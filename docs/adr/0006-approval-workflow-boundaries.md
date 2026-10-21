# ADR-0006：工单、BOM 与顺序多级审批的业务边界

状态：Accepted。BOM 审批已接入，工单审批仍为后续范围；当前实现及验收状态见[路线图](../roadmap.md)。

后续取代范围：[ADR-0008](0008-approval-node-assignees.md)取代个人任务与人工重新分派；[ADR-0011](0011-task-closeout-output-list-and-finished-goods-inbound.md)补充任务结案和业务关联人员；[ADR-0013](0013-procurement-source-and-stock-boundaries.md)细化按正式需求采购与独立备料；[ADR-0014](0014-task-material-policy-and-output-inspection.md)将 BOM 任务门禁限定为批量；通知边界由 [ADR-0007](0007-general-notification-boundaries.md)维护。

## 背景

销售需要在 BOM 尚未完整时下达研发或批量工单，研发先建立成品资料并占用编码。任务承诺、技术定义和实际执行资格必须分开，避免把成品存在、工单下达和允许生产混为同一条件。

## 决策

### 业务流程与审批关注点

工单审批核对是否接受任务、成品与外部订单是否一致、数量和交期；BOM 审批核对投入物料、单位用量等技术定义。二者可以分别推进，互不代替，多张工单可共用成品已批准的 BOM。

**工单审批目标尚未接入**：沿用现有 `work_orders`，不增加前置委托单；审批后下达。研发审批人员须对照外部要求核对稳定产品身份及编码，受审产品不能在批准前悄悄替换。系统不记录外部下单动作，也不宣称自动核验外部订单。是否增加 `submitted` 等状态须另行定稿。

### BOM 锁定与使用资格

永久锁定由“首次创建任务”前移到“BOM 最后一级批准”，批准与 Product 锁定同事务。保持成品级单一 BOM、批准后不解锁；原则性用料变化新建成品和编码，不增加每工单 BOM 副本或版本模型。批量任务须使用已批准、已锁定 BOM；研发不要求 BOM。

当前完整门禁由 [Product](../../apps/api/src/modules/product/docs/database.md)和[Production 工单设计](../../apps/api/src/modules/production/docs/database/work-orders-and-batches.md)维护，工单资料有效不代表 BOM 获批，审批也不能替代后续命令的实时资格校验。

### 采购来源与事实边界的后续细化

按需采购以具体正式需求为来源，BOM／工单批准不足以下单；独立备料不依赖工单或 BOM。采购不接在线审批，下单及入库不减少生产需求。选择理由见 ADR-0013，当前规则见[采购订单](../../apps/api/src/modules/procurement/docs/purchase-orders.md)。

### 顺序多级审批

节点数量由不可变流程版本表达，不硬编码两级、不在业务表增加逐级审批人字段。顺序通过全部节点才执行最终业务动作；同级任一合格人员明确决定即可，并发只接受一次有效结果。首期不包含条件分支或会签。

### 申请人与审批人员

允许合格申请人自审及同人跨级，但每级独立操作、实时校验并留决定事实，不自动通过。角色表达授权职责，不按角色名称推断职级或上级。人员资格统一由 Approval 处理，业务模块不各设自审开关。

### 人员空缺与重新分派

原个人任务和人工重新分派已被 ADR-0008 取代。当前共享节点待办按实时资格判断；无人时阻塞、不跳过，固定人员不自动换人，完整规则见 [Approval](../../apps/api/src/modules/approval/README.md#配置与操作)。

### 驳回、撤回与重新提交

驳回结束本申请；修改后新建申请，从首级重审并保留旧历史。在审修改须先撤回，只有申请人可撤回未终态申请；撤回与最终批准互斥，不能撤回已经生效的批准或解除 BOM 永久锁定。命令与并发细节由 Approval 所有。

## 架构影响

Approval 所有流程与决定，Product 所有 BOM 和锁定，Production 所有工单与任务；最终业务动作经所有者公开能力同事务执行。审批进度与业务状态分别表达，未最终批准不执行受审动作。

### 通知边界

Notification 所有消息、收件和已读，Approval 所有待办；收到或读过通知不授予审批资格。通知与业务同事务，提交后扩展不改变已提交结果，详见 ADR-0007。

## 实施衔接

日常开发从 [Approval](../../apps/api/src/modules/approval/README.md)及相应业务所有者读取当前规则，本 ADR 保留职责拆分、锁定时机与未接入目标。不得伪造历史人工审批；迁移条件见[迁移安全](../../packages/database/docs/migration-safety.md)。
