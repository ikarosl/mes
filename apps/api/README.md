# apps/api

NestJS 组合根，负责启动、全局管道／过滤器／拦截器、模块装配和健康检查，不放业务 SQL。模块分层与跨模块访问遵守[项目架构](../../docs/architecture.md)，HTTP 协议遵守[API 规范](../../docs/api-conventions.md)。

## HTTP 错误诊断

全局异常过滤器始终向客户端返回安全错误信封和 requestId，未预期异常不暴露底层消息、SQL 或堆栈。只有 NODE_ENV=development 记录原始异常链；production、test 及未设置环境只保留异常类型、数据库错误码、阶段、errno、sqlState 和去除消息首行的堆栈帧。两种模式都不记录请求体、Cookie、Token、签名、凭证或 URL 查询串。

输入结构校验向用户返回可理解的格式或业务字段提示，保留明确的自定义说明与数量范围；诊断日志只记录首个失败的字段路径、约束名和 requestId，不记录 ValidationError 的 target/value。提交协议检查使用固定诊断文本并关联 requestId，不记录请求头值。用户文案调整不改变错误码、HTTP 状态或接口字段。

## 相关文档

- 业务模块：[Identity](src/modules/identity/README.md)、[Approval](src/modules/approval/README.md)、[Notification](src/modules/notification/README.md)、[Template](src/modules/template/README.md)、[Product](src/modules/product/README.md)、[Production](src/modules/production/README.md)、[Procurement](src/modules/procurement/README.md)、[Quality](src/modules/quality/README.md)、[Inventory](src/modules/inventory/README.md)。
- 平台约束：[业务编号](docs/business-numbering.md)、[命令上下文](docs/command-context.md)、[事务审计](docs/audit.md)、[幂等性](docs/idempotency.md)。
- 权限目录：[Identity 目录来源、发布与鉴权边界](src/modules/identity/docs/database.md#14-permissions)；具体只读消费者与写动作权限由各模块接口文档维护。

## 验证

API 类型、构建、启动与正式测试的命令和阶段统一见[测试策略](../../docs/testing-strategy.md)。
