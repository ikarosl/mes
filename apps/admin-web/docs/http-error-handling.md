# 前端 HTTP 错误处理

本文维护管理端共享 HTTP 客户端的认证、重试及错误展示约束。协议见[公共 API 规范](../../../docs/api-conventions.md)，业务意图见[管理端架构](architecture.md#5-写意图与错误)与 [API 幂等契约](../../api/docs/idempotency.md)。

## 1. 初始化边界

API wrapper 统一使用 [httpClient](../src/api/http.ts)。启动时先配置认证，再注册最终错误处理器；响应链依次经过基础重试、认证恢复、最终提示。否则可恢复的 401 会被提前当作登出，或 Refresh 子请求重复弹错。共享实现分别由 [request](../../../packages/request/README.md) 和 [auth-client](../../../packages/auth-client/README.md) 所有。

## 4. 基础请求与重试

| 请求 | 可自动重试的失败 |
| --- | --- |
| GET／HEAD／OPTIONS | 无响应或 HTTP ≥500 |
| 显式 `retryIdempotentWrite: true` 且带原 `Idempotency-Key` 的写请求 | 无响应或 502／503／504 |
| 普通写请求、未启用幂等端点、文件上传 | 不自动重试 |

`skipRetry`、请求取消或 signal 已中止均禁止重试。`retryTimes` 是首次之后的次数，默认 1；延迟为 300ms × 当前重试次数。普通写入 500 和 `IDEMPOTENCY_RESULT_CORRUPT` 不自动重试，避免重复确定性失败。所有写重放保留原内容与键；只看 POST 方法不能判断是否具备幂等能力。

## 5. 认证恢复

Access Token 仅在内存，Refresh Token 仅用 HttpOnly Cookie。普通请求需要内存会话；过期时间无效或距到期不超过 30 秒时先刷新，再注入 Token。401 可触发一次刷新并重放原请求，重放设置 `skipRefresh` 防循环；不得为此改动原幂等键。

页面初始化尝试恢复会话，失败转登录并保留目标路由。`refreshPromise` 只合并单个 AuthClient 实例内的并发刷新，不是多标签页锁；BroadcastChannel 的退出同步也不提供跨标签刷新互斥。

## 6. 请求配置

| 配置 | 精确含义 |
| --- | --- |
| `skipAuth` | 不要求内存会话、不注入 Access Token |
| `skipRefresh` | 401 后不刷新／重放 |
| `skipRetry` | 不进入基础网络／5xx 重试 |
| `skipErrorHandling` | 跳过本次最终提示、401／403 状态处理及跳转，仍规范化错误并保持失败 |
| `preserveErrorMessage` | 仅对 401 保留后端消息，不清理会话或执行通用登录失效跳转 |

认证接口的例外必须保留：Login 使用 skipAuth/skipRefresh/skipRetry、preserveErrorMessage 和 credentials；Refresh 使用四个 skip 及 credentials，避免子请求递归、重复提示；Logout 先清本地会话，使用 skipAuth/skipRefresh/skipRetry 和 credentials；Me 使用默认认证配置。Refresh 子请求静默不代表外层原请求也静默；认证恢复最终失败仍可能进入全局处理。

## 7. 错误对象与页面责任

API wrapper 用 `toRequestError` 规范化错误。已有 RequestError 保留引用，普通 Error 保留原对象，未知值才生成 Error；字段和转换实现见 [request](../../../packages/request/src/index.ts)。最终处理器与 [EMessage](../src/utils/message.ts) 通过同一错误对象去重；不要重新包装、复制或先转字符串，否则会丢失关联并重复提示。

处理提示后必须继续 reject，不能让失败流进入保存成功、关窗或清空草稿分支。页面 catch 仍负责业务状态与恢复；需要提示时传原错误对象。使用 `skipErrorHandling` 的候选和可取消详情由所有者提供局部失败提示，并只忽略已失效或取消的请求。

## 8. 最终全局错误处理

[error-handler](../src/api/error-handler.ts) 先按对象去重，再处理以下情况；`skipErrorHandling` 的请求不进入此流程。

| 错误 | 展示与状态行为 |
| --- | --- |
| 401，未 preserveErrorMessage | 清会话、跳登录、提示登录失效 |
| 403 | 提示无权并跳无权限页 |
| 无响应 `status=0`／超时代码 | 网络失败／超时；当前判定顺序限制见下文 |
| `409 IDEMPOTENCY_CONFLICT` | 提交标识已用于不同内容，要求重新核对 |
| `503 IDEMPOTENCY_STORAGE_RETRYABLE` | 提交服务暂不可用，可稍后原命令重试 |
| `500 IDEMPOTENCY_RESULT_CORRUPT` | 保存结果异常，联系管理员核对，不自动另发 |
| 普通 500／`INTERNAL_SERVER_ERROR` | 通用服务器错误并附 requestId，不改称幂等故障 |
| 其他／不能规范化 | 后端或标准化消息／通用失败提示 |

错误来源与防重复恢复状态分开：网络中断或普通 500 后保留原提交标识，只说明结果需核对，不证明发生幂等存储故障。只有明确业务错误码才显示对应幂等提示。未知代码异常仍按普通 500，服务端原异常链仅开发环境可记录，详细脱敏边界见 [API 诊断](../../api/README.md#http-错误诊断)。

## 12. 已知边界与待修正问题

### 12.1 超时当前会优先被识别为网络错误

当前先判断 `status === 0` 再判断 `ECONNABORTED`，无响应超时会显示网络失败。此处记录现状，不能据文档宣称超时文案已修复；整改状态见[路线图](../../../docs/roadmap.md)。

其他易误用边界：去重仅按对象引用；Refresh 并发锁不跨标签；`preserveErrorMessage` 只改变 401；硬刷新不恢复本地写意图。维护时按[测试策略](../../../docs/testing-strategy.md)验证拦截器顺序、取消不重试、写入重试矩阵、认证子请求失败及同一错误只提示一次，不能用应用构建代替这些行为验证。
