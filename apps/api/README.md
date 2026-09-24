# apps/api

NestJS 组合根，负责启动、全局管道／过滤器／拦截器、模块装配和健康检查，不放业务 SQL。模块分层与跨模块访问遵守[项目架构](../../docs/architecture.md)，HTTP 协议遵守[API 规范](../../docs/api-conventions.md)。

## HTTP 错误诊断

全局异常过滤器始终向客户端返回安全错误信封和 requestId，未预期异常不暴露底层消息、SQL 或堆栈。只有 NODE_ENV=development 记录原始异常链；production、test 及未设置环境只保留异常类型、数据库错误码、阶段、errno、sqlState 和去除消息首行的堆栈帧。两种模式都不记录请求体、Cookie、Token、签名、凭证或 URL 查询串。

## 相关文档

- 业务模块：[Identity](src/modules/identity/README.md)、[Approval](src/modules/approval/README.md)、[Notification](src/modules/notification/README.md)、[Product](src/modules/product/README.md)、[Production](src/modules/production/README.md)、[Procurement](src/modules/procurement/README.md)、[Quality](src/modules/quality/README.md)、[Inventory](src/modules/inventory/README.md)。
- 平台约束：[命令上下文](docs/command-context.md)、[事务审计](docs/audit.md)、[幂等性](docs/idempotency.md)。

## 验证

`corepack pnpm --filter @company/api typecheck` 只检查可运行 API 代码，不含相邻测试；开发启动沿用此边界。测试独立由 `corepack pnpm --filter @company/api test` 执行，测试文件类型用 `corepack pnpm --filter @company/api typecheck:test` 检查，dev 和运行时构建不会代替它。执行阶段遵守根 [AGENTS.md](../../AGENTS.md)和[测试策略](../../docs/testing-strategy.md)。
