# 命令上下文与请求 ID

[CommandContext](../src/common/audit/audit.types.ts) 保存操作者及请求审计元数据，不代表 HTTP 幂等；IdempotentCommandContext 另要求已认证 actorId 与已验证幂等键。类型以代码为准，不另维护声明副本。

Repository 将 context.actorId 显式映射到 operation_logs.user_id 或业务 created_by/updated_by/deleted_by；不能把上下文对象直接视为数据库字段。业务成功审计与业务事实同事务，日志归属及脱敏见[事务审计](audit.md)。

请求中间件接受符合[公共 API 规范](../../../docs/api-conventions.md#7-请求上下文与幂等键)的 X-Request-Id，否则生成 UUID，并写入请求／响应。User-Agent 入上下文前最多 512 字符，避免不可信头部破坏核心事务。`@CurrentCommandContext()` 只读认证用户、requestId、IP、User-Agent，不解析 Idempotency-Key。

只有显式 `@IdempotentEndpoint({ scope })` 且 application executor 已接线的认证端点使用 `@CurrentIdempotentCommandContext()`：Guard 校验并 trim header，写入请求局部私有属性，参数装饰器只读该值；缺少用户或已验证键须防御性拒绝。DTO、鉴权及头部校验均在幂等登记前完成。

幂等键只到 application executor；传入 port／Repository 前重新收窄为 CommandContext，不能把键、HTTP header 或其解析职责下放。未启用端点含 Public 误带任意键都拒绝，范围见[幂等契约](idempotency.md#1-当前启用范围)。

首次登记的 requestId 保存为 initial_request_id 并关联成功审计；重放使用本次 requestId，不覆盖首次值、不新增业务成功审计、不把原始键写入 operation_logs。历史 operation_logs.request_id 可空，并可按索引筛选调查。

Product 文件上传虽需要命令审计，但对象存储不在 MySQL 事务内，当前不能声明该幂等能力、发送幂等键或开启写入自动重试。外部 HTTP／消息等同样须先设计 outbox、补偿或恢复闭环；详见[幂等事务边界](idempotency.md#2-项目级决定)。
