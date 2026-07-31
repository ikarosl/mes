# 命令上下文与请求 ID

每个 HTTP 命令接收一个 `CommandContext`，包含 `actorId`、`requestId`、`ip`、`userAgent` 以及可选的 `idempotencyKey`。请求上下文中间件接受有效的 `X-Request-Id`；若不存在则生成一个 UUID，并将其写入请求和响应。User-Agent 在进入事务审计前会截断至数据库字段长度限制。

完成服务端幂等闭环并在接口契约中显式声明的确认类命令，使用 `Idempotency-Key` HTTP 头作为其唯一的幂等键表示，请求体中不得重复携带。当前 HTTP 命令尚未实现键、请求指纹、执行状态和原结果的原子持久化，因此客户端不发送该请求头；`CommandContext.idempotencyKey` 仅保留为后续能力边界。

业务写操作的审计日志在同一个事务中将请求 ID 与业务写入一并持久化。通用请求、失败和安全拒绝日志为尽力而为（best-effort），且绝不能包含密码、令牌、Cookie、签名、凭证或原始请求体。

`operation_logs.request_id` 可为空以兼容历史数据，并已建立索引用于调查。可通过现有的操作日志请求 ID 筛选器进行查询。
