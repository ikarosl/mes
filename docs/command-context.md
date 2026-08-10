# 命令上下文与请求 ID

命令审计元数据与 HTTP 幂等能力是两个正交概念。生产代码统一使用以下类型：

```ts
interface CommandContext {
  actorId: string | null;
  requestId: string;
  ip: string | null;
  userAgent: string | null;
}

interface IdempotentCommandContext extends CommandContext {
  actorId: string;
  idempotencyKey: string;
}
```

`CommandContext` 只说明该命令携带了操作者和请求审计元数据，不代表端点支持 HTTP 幂等。Identity、Product
以及 Production 普通写命令都使用该类型；写 `operation_logs.user_id` 或业务表
`created_by/updated_by/deleted_by` 时，由 Repository 明确把 `context.actorId` 映射到对应字段。
`AuditContext` 与 `CurrentAuditContext` 已完成迁移并从生产代码删除。

请求上下文中间件接受有效的 `X-Request-Id`；若不存在则生成 UUID，并写入请求和响应。User-Agent 在进入
命令上下文前最多保留 512 个字符。`@CurrentCommandContext()` 只读取认证用户、requestId、IP 和 User-Agent，
不得解析 `Idempotency-Key`。

只有显式声明 `@IdempotentEndpoint({ scope })` 且已经完成 application executor 闭环的认证端点，才使用
`@CurrentIdempotentCommandContext()` 与 `IdempotentCommandContext`。全局 `IdempotencyKeyGuard` 先校验并
trim 请求头，再将规范化键写入请求局部私有属性；参数装饰器只读取该已验证值，不重复解析原始 header。
缺少认证用户或已验证键属于非法装配状态，必须防御性拒绝。

幂等能力止于 application 用例：Service 把 `idempotencyKey` 交给 `IdempotencyExecutor`，传给 application
port/Repository 的对象必须重新收窄为 `CommandContext`，Repository 不得读取 header 或幂等键。当前唯一
启用端点是 createBatch（scope `production.batch.create.v1`）；其余 Product、Identity、Production 端点误带
任意 `Idempotency-Key` 均返回 `400 IDEMPOTENCY_NOT_SUPPORTED`，包括 `@Public()` 端点。

Product 文件上传虽需要 `CommandContext` 记录审计，但对象存储写入不在 MySQL executor 的单事务边界内，
因此当前不得声明幂等、不得发送 `Idempotency-Key`、不得开启 unsafe 自动重试。外部 HTTP、消息发送等非
事务副作用同样必须先设计 outbox、补偿或恢复闭环，不能直接套用 MySQL executor。

createBatch 首次登记以 `IdempotentCommandContext.requestId` 保存 `initial_request_id`，用于关联首次成功审计；
重放请求拥有自己的 request ID，但不得覆盖首次值，也不新增业务成功审计。前端键生命周期与硬刷新边界见
[`http-idempotency-implementation-plan.md`](http-idempotency-implementation-plan.md) §9。

业务写操作的审计日志在同一个事务中将请求 ID 与业务写入一并持久化。通用请求、失败和安全拒绝日志为尽力而为（best-effort），且绝不能包含密码、令牌、Cookie、签名、凭证或原始请求体。

`operation_logs.request_id` 可为空以兼容历史数据，并已建立索引用于调查。可通过现有的操作日志请求 ID 筛选器进行查询。
