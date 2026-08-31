# 全局文档

这里维护跨应用、跨包的稳定规范、架构决策、产品范围与路线图。

## 全局规范

- [总体架构](architecture.md)
- [HTTP/API 约定](api-conventions.md)
- [编码规范](coding-standards.md)
- [测试策略](testing-strategy.md)
- [数据库公共约定](database-conventions.md)
- [产品范围](product-scope.md)
- [路线图](roadmap.md)

## 应用与模块

- [API](../apps/api/README.md)：[命令上下文](../apps/api/docs/command-context.md)、[事务审计](../apps/api/docs/audit.md)、[幂等性](../apps/api/docs/idempotency.md)
- [Identity](../apps/api/src/modules/identity/README.md)：[数据库设计](../apps/api/src/modules/identity/docs/database.md)
- [Product](../apps/api/src/modules/product/README.md)：[数据库设计](../apps/api/src/modules/product/docs/database.md)
- [Production](../apps/api/src/modules/production/README.md)：[数据库设计](../apps/api/src/modules/production/docs/database/README.md)
- [管理端](../apps/admin-web/README.md)：[架构](../apps/admin-web/docs/architecture.md)、[视觉设计](../apps/admin-web/docs/visual-design.md)、[路由/弹窗/标签页](../apps/admin-web/docs/route-dialogs-and-tabs.md)、[HTTP 错误处理](../apps/admin-web/docs/http-error-handling.md)
- [数据库基础设施包](../packages/database/README.md)
- [技术文件与对象存储](../apps/api/src/modules/product/docs/technical-files.md)

## 共享 Workspace

- [认证客户端](../packages/auth-client/README.md)
- [业务编码规则](../packages/code-rules/README.md)
- [环境配置加载](../packages/config/README.md)
- [共享常量](../packages/constants/README.md)
- [传输契约](../packages/contracts/README.md)
- [数据库基础设施](../packages/database/README.md)
- [HTTP 请求基础设施](../packages/request/README.md)
- [纯数据规范化工具](../packages/utils/README.md)
- [跨模块测试](../tests/README.md)

## 运维

- [运维入口](../ops/README.md)
- [服务器 Runbooks](../ops/runbooks/README.md)

## ADR

- [ADR 目录](adr/)
