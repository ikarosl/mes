# @company/request

基于 Axios 的共享请求基础设施，负责创建客户端、维护 loading 计数、执行受控重试，以及把 Axios 错误标准化为 `RequestError`。

传输层仅自动重试 GET／HEAD／OPTIONS；写请求即使携带 `Idempotency-Key` 也不自动重试。HTTP 500（包括幂等结果损坏）对所有方法均不自动重试。认证刷新重发由 `@company/auth-client` 所有，手动恢复和最终用户提示由具体应用所有；管理端边界见 [HTTP 错误处理](../../apps/admin-web/docs/http-error-handling.md#4-基础请求与重试)。

调用方通过 AbortSignal 主动取消的请求不进入自动重试：Axios 取消错误或请求 signal 已 aborted 均被排除。
该规则适用于全部共享客户端调用方；非取消请求的无响应／网络失败及 5xx 自动重试也只适用于上述安全方法。
取消仍返回 rejected Promise，不等同于网络故障或请求成功。读取所有者负责丢弃取消后的迟到响应、恢复局部
loading 并决定提示策略；业务写命令不得因页面失活而自动取消。

## 验证

```text
corepack pnpm --filter @company/request typecheck
corepack pnpm --filter @company/request test
```
