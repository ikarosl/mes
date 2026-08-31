# @company/request

基于 Axios 的共享请求基础设施，负责创建客户端、维护 loading 计数、执行受控重试，以及把 Axios 错误标准化为 `RequestError`。

默认只自动重试安全方法。写请求必须由调用方显式启用 `retryUnsafe`，并自行保证请求幂等；确定性的幂等结果损坏错误不得重试。认证刷新和最终用户提示分别由 `@company/auth-client` 与具体应用所有。

## 验证

```text
corepack pnpm --filter @company/request typecheck
corepack pnpm --filter @company/request test
```
