# @company/auth-client

前端认证会话客户端。`AuthClient` 为调用方提供登录、会话恢复、当前用户刷新和退出，并在共享 Axios 实例上安装认证拦截器。

## 边界

- Access Token 只通过调用方提供的内存 session 读写，不持久化到 Web Storage。
- Access Token 临近过期或请求收到 401 时调用 `AuthApi.refresh()`，同一实例内的并发刷新由单一 Promise 合并。
- Refresh Token 的 Cookie 传输由 API 和浏览器负责，本包不读取 Cookie。
- HTTP 重试与错误标准化复用 `@company/request`；认证 DTO 复用 `@company/contracts`。

## 验证

```text
corepack pnpm --filter @company/auth-client typecheck
corepack pnpm --filter @company/auth-client test
```
