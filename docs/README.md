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
- [采购与外购物料入库质检业务设计](procurement-inbound-design.md)（一期业务边界已确定）
- [采购到入库技术设计](procurement-inbound-technical-design.md)：表结构、状态、公开契约、权限及事务
- [Inventory 提取设计](inventory-extraction-design.md)：真实 migration 核对、逐表所有权与现有生产用例改造
- [采购管理端设计](../apps/admin-web/docs/procurement-inbound.md)：页面、分页选择、明细与仓库待办
- [审批接入边界与后续通知设计](approval-design.md)
- [通用通知设计与提交后扩展钩子](notification-design.md)

## 应用与模块

- [API](../apps/api/README.md)：[命令上下文](../apps/api/docs/command-context.md)、[事务审计](../apps/api/docs/audit.md)、[幂等性](../apps/api/docs/idempotency.md)
- [Identity](../apps/api/src/modules/identity/README.md)：[数据库设计](../apps/api/src/modules/identity/docs/database.md)
- [Product](../apps/api/src/modules/product/README.md)：[数据库设计](../apps/api/src/modules/product/docs/database.md)
- [Production](../apps/api/src/modules/production/README.md)：[数据库设计](../apps/api/src/modules/production/docs/database/README.md)、[内部职责与成品入库扩展](../apps/api/src/modules/production/docs/module-boundaries.md)
- [Procurement](../apps/api/src/modules/procurement/README.md)：供应商、采购、到货、实收修订和仓库处置编排
- [Quality](../apps/api/src/modules/quality/README.md)：来料初检、复核办理及不可变结论
- [Inventory](../apps/api/src/modules/inventory/README.md)：唯一库存账本、批次、入库和盘点
- [Approval](../apps/api/src/modules/approval/README.md)：[数据库设计](../apps/api/src/modules/approval/docs/database.md)
- [Notification](../apps/api/src/modules/notification/README.md)：[数据库设计](../apps/api/src/modules/notification/docs/database.md)
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
- [工单、BOM 与顺序多级审批的业务边界](adr/0006-approval-workflow-boundaries.md)
- [通用通知与事务提交后扩展边界](adr/0007-general-notification-boundaries.md)
- [单节点待办与角色或指定用户审批](adr/0008-approval-node-assignees.md)
- [研发轮次结案、产出处置与物料余量](adr/0009-research-round-close-and-output-disposition.md)
- [通过关闭与替代纠正正式需求](adr/0010-demand-correction-by-replacement.md)
- [任务统一结案、产出清单与成品入库](adr/0011-task-closeout-output-list-and-finished-goods-inbound.md)
- [工单选版与任务引用边界](adr/0012-work-order-material-configuration.md)
- [采购来源、检验后入库与事实边界](adr/0013-procurement-source-and-stock-boundaries.md)
