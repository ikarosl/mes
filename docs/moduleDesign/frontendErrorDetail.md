# 前端 HTTP 错误处理详细设计

## 1. 文档目的

本文记录管理端当前实际使用的 HTTP 错误处理、认证刷新、错误标准化、消息去重和 Promise 传播流程，作为后续维护、排查和测试的依据。

本文只描述当前仓库已经存在的前端基础设施，不扩展业务模块范围。文档基于 2026-07-24 的工作树整理。

## 2. 涉及模块

| 文件或模块                                   | 主要职责                                                            |
| -------------------------------------------- | ------------------------------------------------------------------- |
| `apps/admin-web/src/main.ts`                 | 创建 Pinia、实例化认证 Store、注册最终全局 HTTP 错误处理器          |
| `apps/admin-web/src/api/http.ts`             | 创建并导出管理端共享的 `httpClient` 单例                            |
| `apps/admin-web/src/api/error-handler.ts`    | 安装最终响应错误拦截器，执行 401、403、网络错误和通用错误处理       |
| `apps/admin-web/src/api/http-error-state.ts` | 使用 `WeakSet` 按错误对象引用记录“已经提示过”的错误                 |
| `apps/admin-web/src/utils/message.ts`        | 管理端统一消息入口，避免再次提示已由全局处理器处理的错误            |
| `apps/admin-web/src/api/auth.ts`             | 封装登录、刷新、退出和当前用户接口及认证相关请求配置                |
| `apps/admin-web/src/stores/auth.ts`          | 保存内存会话，创建 `AuthClient`，提供登录、恢复和退出能力           |
| `packages/request/src/index.ts`              | 创建 Axios 实例、执行基础重试、定义 `RequestError` 并完成错误标准化 |
| `packages/auth-client/src/index.ts`          | 注入 Access Token，提前刷新 Token，处理 401 后刷新并重放原请求      |

这里的“全局错误处理器”是共享 Axios 实例上的响应错误拦截器，不是 Vue 的 `app.config.errorHandler`。只有通过该 `httpClient` 发出的请求会进入这套流程。

## 3. 初始化与拦截器注册顺序

### 3.1 ES Module 初始化

`main.ts` 的静态依赖会先于模块主体执行。`http.ts` 第一次被导入时立即调用 `createRequestClient()`，创建唯一的 `httpClient`。ES Module 会缓存模块结果，其他 API 模块再次导入 `httpClient` 时取得的是同一个实例，不会创建新的 Axios 实例。

当前初始化顺序为：

```text
加载 main.ts 及其静态依赖
  ↓
执行 http.ts
  ↓
createRequestClient() 创建 httpClient
  ↓
注册 @company/request 的基础请求/响应拦截器
  ↓
执行 main.ts 主体
  ↓
createPinia()
  ↓
useAuthStore(pinia) 实例化认证 Store
  ↓
createAuthClient() / new AuthClient()
  ↓
注册认证请求/响应拦截器
  ↓
installHttpErrorHandler(httpClient)
  ↓
注册最终全局响应错误拦截器
  ↓
createApp().use(pinia).use(router).mount()
```

`useAuthStore(pinia)` 已经在 `app.use(pinia)` 之前显式取得 Pinia 实例并创建 Store。因此，认证拦截器先于最终全局错误拦截器注册。

### 3.2 拦截器执行顺序

Axios 响应拦截器按照注册顺序进入后续 Promise 链。当前错误响应主要经过：

```text
基础重试拦截器
  ↓ 最终仍失败
认证响应拦截器
  ↓ refresh 或重放仍失败
最终全局 HTTP 错误拦截器
```

因此，全局错误处理器原则上只处理重试和认证恢复之后的最终失败。

## 4. 基础请求与重试

`createRequestClient()` 创建的 Axios 实例默认使用：

- `baseURL: /api`；
- `timeout: 10_000ms`；
- 请求开始时增加 loading 计数；
- 响应成功或失败时减少 loading 计数。

基础响应错误拦截器会在以下条件全部满足时重试：

1. 请求存在有效 `config`；
2. 没有设置 `skipRetry`；
3. 请求方法为 `GET`、`HEAD`、`OPTIONS`，或者显式设置 `retryUnsafe`；
4. 当前重试次数小于 `retryTimes`，`retryTimes` 默认值为 1；
5. 没有收到响应，或者响应状态码不小于 500。

重试等待时间为 `300ms × 当前重试次数`。如果不满足重试条件或重试后仍失败，基础拦截器继续返回 rejected Promise，将错误交给后续拦截器。

登录、刷新和退出接口都设置了 `skipRetry: true`，避免认证类写请求被基础重试机制重复提交。

## 5. 认证请求流程

### 5.1 Access Token 注入和提前刷新

认证请求拦截器对没有设置 `skipAuth` 的请求执行以下逻辑：

1. 从 Pinia 内存状态取得当前会话；
2. 如果没有会话，抛出 `Not authenticated`；
3. 解析 `accessTokenExpiresAt`；
4. 如果时间无效，或者 Access Token 剩余有效期不超过 30 秒，先调用 Refresh；
5. 取得有效会话后，在请求头写入 `Authorization: Bearer <accessToken>`。

Access Token 只保存在内存会话中。Refresh Token 由浏览器通过 HttpOnly Cookie 携带，前端代码不读取 Refresh Token 内容。

同一个 `AuthClient` 实例使用 `refreshPromise` 合并并发刷新，避免同一实例内同时发起多个 Refresh。但该锁只存在于当前页面标签页的内存中，不是跨标签页锁。

### 5.2 业务请求收到 401

认证响应拦截器只在以下条件全部满足时尝试恢复：

```text
响应状态码为 401
并且请求没有 skipAuth
并且请求没有 skipRefresh
```

流程为：

```text
受保护业务请求返回 401
  ↓
认证响应拦截器调用 refresh
  ├─ refresh 成功
  │    ↓
  │  更新内存会话
  │    ↓
  │  给原请求写入新 Access Token
  │    ↓
  │  原请求设置 skipRefresh = true
  │    ↓
  │  重放原请求
  │    ├─ 成功：原调用最终成功
  │    └─ 再次失败：进入最终全局错误处理
  │
  └─ refresh 失败
       ↓
     清理内存会话
       ↓
     将刷新错误标准化并继续抛出
       ↓
     最终全局处理认证失败
```

重放前设置 `skipRefresh = true`，用于防止同一个业务请求持续收到 401 时形成无限 Refresh 循环。

### 5.3 页面初始化恢复会话

访问受保护路由且内存中没有会话时，路由守卫调用 `auth.restore()`。该方法直接调用 Refresh：

```text
访问受保护路由
  ↓
内存中没有会话
  ↓
auth.restore() / refresh
  ├─ 成功：恢复会话，继续权限判断
  └─ 失败：路由守卫 catch，跳转登录页并保留 redirect
```

Refresh 请求设置了 `skipErrorHandling: true`，所以这个恢复失败过程不会由 Refresh 子请求直接弹出全局错误消息。

## 6. 认证相关请求配置

### 6.1 配置语义

| 配置                   | 含义                                                            |
| ---------------------- | --------------------------------------------------------------- |
| `skipAuth`             | 不要求内存会话，不注入 Access Token                             |
| `skipRefresh`          | 当前请求收到 401 后不尝试 Refresh 和重放                        |
| `skipRetry`            | 不进入基础网络/5xx 自动重试                                     |
| `skipErrorHandling`    | 当前这一次错误不执行最终全局提示、401/403 状态处理和跳转        |
| `preserveErrorMessage` | 仅改变 401 的最终展示策略：保留后端消息，不执行通用登录失效处理 |

`skipErrorHandling` 不会把失败变成成功，也不会阻止错误标准化。全局拦截器仍会调用 `toRequestError()`，然后以 rejected Promise 将错误交给上层流程。

`preserveErrorMessage` 不是跳过全局处理。它只让 401 不进入通用的 `onUnauthorized()` 分支，随后使用标准化后的 `requestError.message` 进行提示。该消息通常来自后端响应的 `message` 字段。

### 6.2 当前认证接口配置

| 接口    | 关键配置                                                                          | 目的                                                             |
| ------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Login   | `skipAuth`、`skipRefresh`、`skipRetry`、`preserveErrorMessage`、`withCredentials` | 不依赖现有会话；登录失败时显示后端返回的具体原因                 |
| Refresh | `skipAuth`、`skipRefresh`、`skipRetry`、`skipErrorHandling`、`withCredentials`    | Refresh 子请求不递归刷新、不重复提交，也不直接触发全局消息和跳转 |
| Logout  | `skipAuth`、`skipRefresh`、`skipRetry`、`withCredentials`                         | 本地会话先清理，退出请求不依赖 Access Token，也不刷新或重试      |
| Me      | 默认认证配置                                                                      | 要求有效内存会话并携带 Access Token，可在 401 时尝试刷新         |

### 6.3 Login 401

后端返回：

```json
{
  "status": 401,
  "code": "UNAUTHORIZED",
  "message": "用户名或密码错误"
}
```

前端处理为：

```text
AxiosError
  ↓
RequestError(message = "用户名或密码错误")
  ↓ preserveErrorMessage = true
不执行 auth.clear()，不替换为通用登录失效消息
  ↓
显示“用户名或密码错误”
```

### 6.4 Refresh 失败

`skipErrorHandling` 对应的是 Refresh 子请求本身不立即进行 HTTP 提示和状态跳转。Refresh 仍然失败并向外传播。

当 Refresh 是业务请求 401 恢复流程的一部分时，Refresh 子请求不单独提示；认证恢复最终失败后，外层请求链仍可能进入全局处理并显示“登录状态已失效，请重新登录”。这样避免同时显示 Refresh 错误和登录失效两条消息。

## 7. 错误标准化

### 7.1 `RequestError`

管理端使用统一的 `RequestError`，包含：

- `message`：优先使用后端响应的 `message`，否则使用 Axios 错误消息；
- `status`：HTTP 状态码，没有响应时为 0；
- `response`：原 AxiosResponse；
- `code`：优先使用后端响应的 `code`，否则使用 Axios 错误码；
- `requestId`：后端返回的请求追踪标识。

`toRequestError(error)` 的转换顺序为：

```text
已经是 RequestError
  → 原对象返回

axios.isAxiosError(error) 为 true
  → 提取响应数据并创建 RequestError

普通 Error
  → 原对象返回

其他值
  → new Error("Request failed")
```

因为已经是 `RequestError` 时会返回原对象，API 包装层再次调用 `toRequestError()` 不会创建新对象，也不会破坏 WeakSet 的引用去重。

### 7.2 `axios.isAxiosError()` 和 TypeScript 类型谓词

Axios 的声明类似：

```ts
function isAxiosError<T = any, D = any>(payload: any): payload is AxiosError<T, D>;
```

`payload is AxiosError<T, D>` 是 TypeScript 类型谓词。运行时函数仍然只返回布尔值；编译时如果结果为 `true`，TypeScript 会在对应控制流分支内把 `payload` 收窄为 `AxiosError`，允许安全访问 `response`、`config` 等字段。

这不是运行时类型附加，也不是性能优化。TypeScript 不会修改错误对象，类型信息在编译成 JavaScript 后会被删除。

当前 Axios 实现通过“值是对象并且 `isAxiosError === true`”识别 Axios 错误。

## 8. 最终全局错误处理

最终错误拦截器执行：

1. 从原错误读取请求配置；
2. 调用 `toRequestError()` 标准化错误；
3. 如果没有设置 `skipErrorHandling`，调用 `handleHttpError()`；
4. 返回 `Promise.reject(requestError)`，让调用方仍然感知请求失败。

`handleHttpError()` 当前判断顺序为：

| 顺序 | 条件                                | 行为                                                   |
| ---- | ----------------------------------- | ------------------------------------------------------ |
| 1    | 同一错误对象已处理                  | 直接返回，不重复提示                                   |
| 2    | 不能转换为 `RequestError`           | 提示“请求失败，请稍后重试”                             |
| 3    | 401 且未设置 `preserveErrorMessage` | 清理会话、跳转登录页、提示“登录状态已失效，请重新登录” |
| 4    | 403                                 | 跳转无权限页、提示当前账号无权执行操作                 |
| 5    | `status === 0`                      | 提示网络连接失败                                       |
| 6    | `code === ECONNABORTED`             | 提示请求超时                                           |
| 7    | 其他错误                            | 显示后端/标准化错误消息，缺失时使用通用失败提示        |

401 的 `onUnauthorized()` 由 `main.ts` 提供，负责清理认证状态并在当前路由不是登录页时跳转登录页，同时记录原路由为 `redirect`。

403 的 `onForbidden()` 由 `main.ts` 提供，负责在当前路由不是无权限页时跳转到无权限页。

## 9. 为什么最终要返回 rejected Promise

Axios 拦截器组成 Promise 链。错误回调的返回行为决定后续 Promise 状态：

| 错误回调行为                  | 后续状态                       |
| ----------------------------- | ------------------------------ |
| 返回普通值或 `undefined`      | 转为 fulfilled，表示错误已恢复 |
| 返回 `Promise.resolve(value)` | 转为 fulfilled                 |
| `throw error`                 | 保持 rejected                  |
| 返回 `Promise.reject(error)`  | 保持 rejected                  |
| 返回重新发起的 Axios 请求     | 由重试请求的结果决定成功或失败 |

最终全局错误处理器只完成标准化、提示和状态跳转，并没有恢复原业务操作。因此必须 `throw requestError` 或 `return Promise.reject(requestError)`。当前代码选择后者。

如果错误回调只提示但隐式返回 `undefined`，Axios 会把链条视为已经恢复，调用方可能得到 `undefined` 并继续执行成功逻辑，掩盖原始请求失败。

## 10. WeakSet 去重与页面 catch

### 10.1 去重机制

全局 `handledHttpErrors` 是 `WeakSet<object>`，按对象引用判断错误是否已经处理：

```text
全局拦截器得到 RequestError 对象 A
  ↓
将对象 A 放入 WeakSet，并显示消息
  ↓
Promise.reject(A)
  ↓
页面 catch 再次得到对象 A
  ↓
EMessage.error(A) 查询 WeakSet
  ↓
已经处理，不重复弹窗
```

WeakSet 只解决同一对象引用的重复提示，不会按照 `message`、`status`、`code` 或 `requestId` 合并不同错误对象。对象失去其他强引用后可被垃圾回收，因此该集合不会因为长期运行而强制保留所有历史错误。

### 10.2 页面仍然需要 catch

WeakSet 不会吞掉 Promise rejection，也不替代页面级错误控制。页面仍可使用 `catch`：

- 避免异步事件处理产生未处理的 Promise rejection；
- 恢复局部 loading；
- 回滚表单或临时状态；
- 区分取消、关闭等非 HTTP 分支；
- 执行页面特有的失败逻辑。

页面不需要在 `catch` 中重复完成通用 HTTP 提示。现有页面即使调用 `EMessage.error(error)`，同一错误对象也会因 WeakSet 标记而停止重复弹窗；普通本地 Error 则仍可以正常提示。

登录页的 `catch` 为空，是因为登录 HTTP 错误已经由全局处理器展示；`finally` 仍负责恢复按钮 loading。

## 11. API 层的 request 包装

`auth.ts`、`product.ts`、`system.ts` 分别定义了类似的请求包装：

```ts
try {
  return (await httpClient.request<T>(config)).data;
} catch (error) {
  throw toRequestError(error);
}
```

这些模块共享同一个 `httpClient`，不会重复创建 Axios 实例或重复注册拦截器。

在当前管理端完整运行链路中，最终全局拦截器通常已经把 AxiosError 转换为 RequestError，API 层再次调用 `toRequestError()` 会原样返回，因此存在“标准化代码重复”，但不存在“重复全局提示”。

该包装仍提供一层 API 边界保证：即使 API 模块在未安装 UI 全局处理器的独立测试或其他入口中使用，也尽量向调用方抛出统一错误。后续如需整理，可提取共享 `requestData<T>()`，保留错误契约并消除各 API 文件的重复代码。

## 12. 已知边界与待修正问题

### 12.1 超时当前会优先被识别为网络错误

当前 `handleHttpError()` 先判断 `status === 0`，再判断 `code === 'ECONNABORTED'`。Axios 超时通常同时具有：

```text
status = 0
code = ECONNABORTED
```

因此超时会先命中网络错误分支，“请求超时”分支基本无法执行。这是当前代码问题，不是期望设计。修正时应先判断 `ECONNABORTED`，再判断通用的 `status === 0`，并补充相邻单元测试。

### 12.2 WeakSet 只按对象引用去重

如果同一逻辑错误被重新包装成不同对象，WeakSet 不会认为它们相同。当前标准链路通过 `toRequestError(RequestError)` 原样返回来保持对象身份；新增错误包装层时需要避免无意义地创建新错误对象。

### 12.3 Refresh 并发锁不是跨标签页锁

`refreshPromise` 只能合并当前 `AuthClient` 实例内的刷新。多个浏览器标签页拥有各自的 JavaScript 内存和 AuthClient，仍可能同时使用同一个 Refresh Cookie 发起刷新。当前 BroadcastChannel 只同步退出事件，不同步刷新互斥。

### 12.4 `preserveErrorMessage` 只对 401 有特殊效果

当前代码只在 401 分支查询 `preserveErrorMessage`。其他状态码默认已经在最终通用分支展示标准化后的后端消息。不要把它理解为适用于所有状态码的通用“显示后端消息”开关。

## 13. 维护约束

1. 新增 API 应复用共享 `httpClient`，不要为普通业务模块创建独立 Axios 实例。
2. 匿名接口应明确配置认证行为；后端仍必须显式使用 `@Public()`，前端配置不构成安全边界。
3. Access Token 只能保存在内存中；Refresh Token 只能通过 HttpOnly Cookie 传输。
4. 不得在日志、错误提示、调试输出或审计记录中写入 Token、Cookie、密码等敏感信息。
5. 不要在拦截器错误回调中无意返回 `undefined`；只有真正恢复请求时才能将 rejected 状态转为 fulfilled。
6. 页面 catch 负责局部恢复和业务分支，通用 HTTP 提示由全局处理器负责。
7. 新增配置项或错误分支时，应同时补充 `apps/admin-web/src/api/__tests__` 或被测模块相邻 `__tests__/*.test.ts`。

## 14. 当前相关测试

- `apps/admin-web/src/api/__tests__/error-handler.test.ts`：验证 401 只处理一次、错误标准化、登录 401 保留后端消息、网络错误提示。
- `apps/admin-web/src/utils/__tests__/message.test.ts`：验证已由全局处理的错误不会再次弹窗，本地错误仍会提示。
- `packages/request/src/__tests__/request.test.ts`：验证 RequestError 原样返回、AxiosError 标准化和重试判定基础行为。

文档指出的超时判断顺序问题当前尚未修正，对应的超时优先级测试也尚未补充。
