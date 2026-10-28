# ADR-0026：采购主单统一供应商与明细金额边界

状态：Accepted。当前字段及命令由 [Procurement 采购订单](../../apps/api/src/modules/procurement/docs/purchase-orders.md)和[数据库](../../apps/api/src/modules/procurement/docs/database.md)维护，实施、用户验收及正式测试状态见[路线图](../roadmap.md)。

## 选择与理由

一张采购单表达向一家供应商发出的采购安排，供应商由采购主单保存唯一稳定 ID；采购明细只区分物料与精确版本，同单相同物料版本不重复建行。跨供应商采购分别建单，使草稿选择、正式冻结和补单继承共用一个供应商身份，避免将同单供应商集合误作实际到货或办理边界。

普通草稿可更换主单供应商，正式下单后冻结；补单从创建起继承并锁定原采购主单供应商，物料及需求来源仍逐原行继承。到货、来料和库存来源沿固定采购行所属主单解析供应商，不在下游复制可独立修改的关系。

每条采购明细的无税金额、含税金额均为人工填写的整行总金额文本，随正式下单冻结。补单的新金额只描述此次采购，默认空，不复制原行总金额。保留文本满足轻量采购记录，不据此引入税额计算、结算、财务或库存成本模型；具体输入契约不在 ADR 重复。

## 取代与保留范围

本 ADR 仅取代 [ADR-0013](0013-procurement-source-and-stock-boundaries.md) 的逐行供应商存储、同物料版本按供应商拆行，以及补单从原采购行继承供应商的规则，并取代 [ADR-0014](0014-task-material-policy-and-output-inspection.md)、[ADR-0015](0015-unified-quality-quantity-semantics.md)、[ADR-0016](0016-inbound-authorizations-and-stock-batches.md) 对这些逐行规则的援引。单工单正式需求、任务供应商提示、独立采购量、来源和状态规则保持。

来料质检主单仍可组织跨采购、跨供应商的完整到货，检查仍逐真实到货明细独立。[ADR-0018](0018-purchase-inbound-multiple-suppliers.md) 的跨供应商实际入库继续有效，入库主单不因此获得唯一供应商。Inventory 已确认供应商名称快照、既有批次 provider 及审计文本保留历史，不因采购供应商层级或名称变化回写。

Procurement 继续拥有采购供应商关系，Quality 不查询或存储采购供应商；跨模块展示读取按架构登记，业务资格仍通过所有者公开能力在锁内核验。开发库通过统一初始化恢复，结构变更只追加成对 migration，不猜旧多供应商单的主单身份，也不建立兼容双写。
