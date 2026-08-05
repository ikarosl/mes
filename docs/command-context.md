# 命令上下文与请求 ID

每个 HTTP 命令接收一个 `CommandContext`，包含 `actorId`、`requestId`、`ip`、`userAgent` 以及可选的 `idempotencyKey`。请求上下文中间件接受有效的 `X-Request-Id`；若不存在则生成一个 UUID，并将其写入请求和响应。User-Agent 在进入事务审计前会截断至数据库字段长度限制。

完成服务端幂等闭环并在接口契约中显式声明的写命令，使用 `Idempotency-Key` HTTP 头作为其唯一的
幂等键表示，请求体中不得重复携带。管理端在一次尚未确认结果的提交意图第一次正式提交时使用
`crypto.randomUUID()` 生成键，并在内容未变的模糊失败重试中复用；API 包装函数和服务端均不得为每次
HTTP 尝试重新生成键。当前内存意图不支持浏览器硬刷新恢复，具体边界见实施方案 §9。

后端当前只落地了 `IdempotencyExecutor` 抽象端口，尚未实现键、请求指纹、执行状态和原结果的 MySQL
原子持久化，也没有任何业务端点完成接入。因此客户端仍不发送该请求头；
`CommandContext.idempotencyKey` 只作为后续能力边界。完整启用步骤与阶段 A/B/C 定义见
[`http-idempotency-implementation-plan.md`](http-idempotency-implementation-plan.md) §10。

阶段 A（平台闭环）必须新增端点级启用元数据：启用端点要求合法键，未启用端点收到键返回
`400 IDEMPOTENCY_NOT_SUPPORTED`。当前 `CurrentCommandContext` 只做可选读取和长度校验，尚未实现该
门禁。首次登记还需把 `CommandContext.requestId` 保存为幂等记录的 `initial_request_id`，用于关联同一
request ID 的首次成功审计；重放请求拥有自己的 request ID，但不得覆盖首次值。

业务写操作的审计日志在同一个事务中将请求 ID 与业务写入一并持久化。通用请求、失败和安全拒绝日志为尽力而为（best-effort），且绝不能包含密码、令牌、Cookie、签名、凭证或原始请求体。

`operation_logs.request_id` 可为空以兼容历史数据，并已建立索引用于调查。可通过现有的操作日志请求 ID 筛选器进行查询。
