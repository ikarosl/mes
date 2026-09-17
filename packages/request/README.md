# @company/request

基于 Axios 的共享请求基础设施，负责创建客户端、维护 loading 计数、执行受控重试，以及把 Axios 错误标准化为 `RequestError`。

默认只自动重试安全方法。写请求必须由调用方显式启用 `retryIdempotentWrite: true`，并同时复用同一个 `Idempotency-Key`；普通写请求不得开启该选项，确定性的幂等结果损坏错误不得重试。认证刷新和最终用户提示分别由 `@company/auth-client` 与具体应用所有。

调用方通过 AbortSignal 主动取消的请求不进入自动重试：Axios 取消错误或请求 signal 已 aborted 均被排除。
该规则适用于全部共享客户端调用方；普通无响应／网络失败及安全方法、显式幂等写请求的 5xx 重试规则保持不变。
取消仍返回 rejected Promise，不等同于网络故障或请求成功。读取所有者负责丢弃取消后的迟到响应、恢复局部
loading 并决定提示策略；业务写命令不得因页面失活而自动取消。

## 验证

```text
corepack pnpm --filter @company/request typecheck
corepack pnpm --filter @company/request test
```
