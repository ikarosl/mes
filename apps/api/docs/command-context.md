# 命令上下文与请求 ID

[CommandContext](../src/common/audit/audit.types.ts) 保存操作者与请求审计元数据，不表示 HTTP 幂等。`IdempotentCommandContext` 另要求已认证操作者和已验证幂等键；类型以代码为准。

Repository 将 `actorId` 显式映射到审计用户或业务操作者列，不能直接把上下文对象当作数据库字段。进入 port／Repository 前须收窄为普通 `CommandContext`，幂等键只到 application executor，不下放 header 解析职责。

请求 ID 的接受与返回遵循[公共 HTTP 规范](../../../docs/api-conventions.md#7-请求上下文与幂等键)。User-Agent 入上下文前最多保留 512 字符，避免不可信头部破坏核心事务；普通上下文装饰器只读取认证身份与审计元数据。

专用幂等上下文只接收已验证的键与认证用户，缺少任一项即拒绝，不在下游重新解析请求头。登记前校验、首次 requestId、重放与外部副作用限制见[平台幂等契约](idempotency.md)，日志字段与写入归属见[事务审计](audit.md)。
