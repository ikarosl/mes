# @company/request

基于 Axios 的共享请求基础设施，负责创建客户端、维护 loading 计数、执行受控重试，以及把 Axios 错误标准化为 `RequestError`。

默认只自动重试安全方法。写请求必须由调用方显式启用 `retryIdempotentWrite: true`，并同时复用同一个 `Idempotency-Key`；普通写请求不得开启该选项，确定性的幂等结果损坏错误不得重试。认证刷新和最终用户提示分别由 `@company/auth-client` 与具体应用所有。

调用方通过 AbortSignal 主动取消的请求不进入自动重试：Axios 取消错误或请求 signal 已 aborted 均被排除。
该规则适用于全部共享客户端调用方；非取消请求的无响应／网络失败及 5xx 重试遵守上述安全方法与显式幂等写请求边界。
取消仍返回 rejected Promise，不等同于网络故障或请求成功。读取所有者负责丢弃取消后的迟到响应、恢复局部
loading 并决定提示策略；业务写命令不得因页面失活而自动取消。

`createRequestClient` 可通过正整数 `maxConcurrentReads` 限制单个客户端同时在途的 GET／HEAD，未设置时不限制。
超出上限的读取按发起顺序排队；排队计入 loading，但不计入网络超时，AbortSignal 或 CancelToken 取消会立即退出队列并保持失败，不触发重试。
每次网络尝试结束后先释放名额，再进入重试或认证恢复；重试和 401 重放重新排队。其他 HTTP 方法不占读取名额，POST 认证续期不会被读取队列阻塞。
该限制同样适用于请求自定义 adapter，不合并请求或缓存业务结果。

## 验证

```text
corepack pnpm --filter @company/request typecheck
corepack pnpm --filter @company/request test
```
