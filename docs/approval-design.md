# 审批接入与通知边界

本文维护业务模块、Approval、Identity 与 Notification 的共同协议。当前流程执行、人员资格及 HTTP 规则由 [Approval](../apps/api/src/modules/approval/README.md)维护；选择理由见 [ADR-0006](adr/0006-approval-workflow-boundaries.md)、[ADR-0008](adr/0008-approval-node-assignees.md)，通知独立边界见 [ADR-0007](adr/0007-general-notification-boundaries.md)。

## 1. 已接入场景

| 场景 | 业务所有者及当前规则 |
| --- | --- |
| `product.bom.approve` | [Product BOM](../apps/api/src/modules/product/docs/database.md)：送审冻结，末级批准永久锁定；原则性用料变化需新成品编码 |
| `production.demand.correct` | [Production 需求更正](../apps/api/src/modules/production/docs/database/demand-allocation-and-outbound.md#正式需求更正与替代)：先批准，再关闭旧剩余并按依据创建替代 |
| `production.batch.closeout` | [Production 结案](../apps/api/src/modules/production/docs/database/production-termination.md)：先处理实际收尾、引用 Quality 事实，再由工单负责人最终批准；驳回不撤销已发生的收尾事实 |

业务场景由代码注册，管理员只能配置支持的流程，不能创建任意业务回调。审批保存受审证据及决定；业务状态、数量、永久锁定和执行资格始终由业务所有者校验。最终决定与业务生效、成功审计、站内通知同事务，不能仅把审批状态改为通过。

质检不是固定审批层。Quality 保存独立事实与明确放行，Production 管理员核对计划内外及真实报废后送审。成品数量使用[非阻断建议](../apps/api/src/modules/quality/docs/finished-inspections.md#成品来源与统一事实)，不再以清单超过建议量拒绝送审或批准；明确放行、任务计划约束和已入类别锁量仍有效。固定已入基准、剩余范围与复检开始冻结仍按 CQ-01 区分当前和待实施。

## 2. 公共字段和约束

Approval 的六张表及引用约束由[模块数据库](../apps/api/src/modules/approval/docs/database.md)维护。业务对象状态、归属和资格通过所属模块公开能力核验，不能由外键或流程配置代替。审批证据不成为第二份可写业务事实。

## 3. 审批通知接入

Approval 解析触发时的具体收件人，Notification 保存消息和固定收件集合；当前节点待办与通知未读数各有事实来源。发布、送审时无人可审由 Approval 拒绝；运行中资格变化不撤销既有决定，空收件跳过通知且不自动补发。通知历史不授予业务详情或决定权限。

动作到事件键、节点与终态收件人的准确映射由[Approval 通知事件](../apps/api/src/modules/approval/README.md#通知事件)维护；发布去重、本人已读及历史保留由[Notification](../apps/api/src/modules/notification/README.md)维护。双方不得通过通知文案或旧收件集合推断当前审批资格。

## 4. 后续工单与采购接入

工单下达审批尚未接入。目标沿用 draft，通过当前申请关联冻结待审内容，批准后才下达；完整目标字段见[工单审批目标](../apps/api/src/modules/production/docs/database/work-orders-and-batches.md#工单审批接入目标结构尚未实施)。审核证据包含产品 ID、编码、名称、数量、客户、外部订单号、质量要求、交期和负责人，最终下达使用受审快照并重新核验当前资格。产品核对独立于 BOM 批准；外部订单不入系统也不能省略人工核对。

采购当前不接在线审批，由采购正式确认下单；不能因为已有 Approval 自动增加审批场景。按需采购须先有正式需求，备料采购独立，来源与后续物流见[采购业务协议](procurement-inbound-design.md)。批量 BOM 门禁不延伸至研发。未实施和验收事项统一见[路线图](roadmap.md)。

## 5. 通知事务接入

站内通知核心写入与业务同事务；只有最外层明确提交后的扩展可异步运行，遵守[通知事务协议](notification-design.md#4-同事务落库与提交后钩子)。不得在审批服务另设外部发送旁路。通用批准、驳回、撤回未启用 HTTP Idempotency-Key，不自动重试；业务送审只采用已登记的各自幂等契约。

## 6. 节点共享待办与角色或指定用户

### 6.1 配置与数据结构

一个节点一条执行记录；角色、固定用户、业务来源三选一，配置发布后不可变。字段互斥、节点状态和活动槽见[Approval 数据库](../apps/api/src/modules/approval/docs/database.md#34-approval_flow_steps)。角色成员实时解析，不固定历史候选名单。

### 6.2 查询、决定与前端

身份和权限通过 Identity 公开能力实时核验，待办在分页前过滤。每级显式决定，允许自审和同人逐级处理；并发决定、撤回与最终批准互斥，迟到请求不能误批下一节点。修改在审内容须先撤回或驳回，重新提交形成新申请，保留原证据。准确接口及历史访问范围见[Approval](../apps/api/src/modules/approval/README.md#http-与权限)。

## 7. 业务关联人员分派

### 7.1 流程规则与本次人员分开保存

流程固定来源规则，申请固定送审解析人员，当前账号与权限资格仍实时检查；不修改流程模板来适配每张工单，也不因人员变化改写在途授权。完整规则见[场景接入](../apps/api/src/modules/approval/docs/subject-integration.md#业务关联人员)。

### 7.2 场景解析与事务

Production 在来源锁内解析所属工单负责人；Approval 校验场景白名单、必需末级及 Identity 资格并与受审证据同事务保存。缺少或无资格负责人不能回退给申请人、管理员或同角色人员；当前无负责人转交能力。

### 7.3 查询与页面

来源规则、送审确定人员和实际处理人分别表达。新申请或清单更正重新解析，旧申请及已发生决定不变；具体契约见模块所有者文档。
