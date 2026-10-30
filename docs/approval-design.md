# 审批接入与通知边界

本文维护业务模块、Approval、Identity 与 Notification 的协作。流程和人员规则由 [Approval](../apps/api/src/modules/approval/README.md)维护，场景适配见[接入契约](../apps/api/src/modules/approval/docs/subject-integration.md)；选择理由见 [ADR-0006](adr/0006-approval-workflow-boundaries.md)、[ADR-0008](adr/0008-approval-node-assignees.md)。

## 已接入场景

| 场景 | 业务所有者 |
| --- | --- |
| `product.bom.approve` | [Product BOM](../apps/api/src/modules/product/docs/database.md) |
| `production.demand.correct` | [Production 需求更正](../apps/api/src/modules/production/docs/database/demand-allocation-and-outbound.md#正式需求更正与替代) |
| `production.batch.closeout` | [Production 结案](../apps/api/src/modules/production/docs/database/production-termination.md) |

业务模块提供受审证据、来源锁及最终生效能力；Approval 管理流程与决定，通过 Identity 核验人员。审批证据不成为第二份可写业务事实，流程配置也不能绕过来源资格。Quality 检查与业务审批独立，其职责见[统一检验模型](../apps/api/src/modules/quality/docs/unified-inspection-model.md)。

## 审批通知接入

Approval 决定事件及具体收件人，Notification 保存消息和收件关系，业务待办仍由 Approval 判定。事件映射见[Approval 通知事件](../apps/api/src/modules/approval/README.md#通知事件)，通知发布与本人阅读见[Notification](../apps/api/src/modules/notification/README.md)。

## 后续工单与采购接入

工单下达审批尚未接入，目标和剩余条件见[工单审批目标](../apps/api/src/modules/production/docs/database/work-orders-and-batches.md#工单审批接入目标结构尚未实施)与[路线图](roadmap.md)。采购不接在线审批；其他模块已有 Approval 能力不构成新增业务场景的授权，范围以[产品范围](product-scope.md)为准。

## 通知事务接入

最终审批决定、业务生效、成功审计及站内通知在同一事务提交。外部扩展遵守[通知提交后协议](notification-design.md#4-同事务落库与提交后钩子)，不得在审批服务另设发送旁路。
