# 到货、实收修订及仓库处置

本模块编排 Procurement 范围、Quality 结论及 Inventory 入库，三者保持独立所有权。共享请求见 `packages/contracts/src/procurement/receipts.ts` 和 `inbounds.ts`；展示、筛选与分页见[到货查询](receipt-queries.md)。所有数量为整数，API 数量响应使用整数字符串。

## 确认和处置

确认到货需要采购根及行版本、实际交接时间和凭据。只接受已下单的 open 行；同一采购行可在一次确认中按供应商批号拆为多条到货明细，原行版本只递增一次。实际接收不受计划封顶，累计超计划须填写免费超量说明；同意额外购买使用独立补单。到货保存首次不可变实收修订、正数量 uninspected 根及可空 batch_id，不生成检验或库存事实。

数量遵守统一存储上限 99999999，采购行全部到货的累计当前实收也不能超过该上限。确认到货将本次同采购行全部明细与已有实收一起校验；实收更正在同一采购根锁内用新修订替换原明细后校验总量；关闭前再次检查冻结数量。此限制是系统整数存储范围，不能用采购计划量作为实收上限。

开始初检、复检或检验更正时，锁定原范围并按选定数量拆分；选定的新范围与真实 Quality case 同事务变为 reviewing，其余范围继续使用原修订与检验依据。完成检验追加不可变结论，再生成 approved、quality_return、uninspected 子范围。未明确批准不能入库；await_decision 不等于退回。父范围 superseded 后不能办理，旧结论和处置事实保留。

仓管确认只接收有效 approved 范围，允许调小数量。单次 details 最多 100 个范围，可跨同供应商采购单；先锁全部根和所有层级，再批量调用 Inventory。分次入库先拆出本次精确消费叶子；Inventory 直接创建 completed 入库单、明细及正库存流水。首次自动创建的 `item_batch.id` 在同事务通过 `WHERE batch_id IS NULL` 原子绑定到到货明细，同次和后续确认沿用；显示内部批号关联 `item_batch.batch_code`。采购行已关闭仍可处理已有放行量。

采购终止退回只能从未检或已批准、未处置且非 reviewing 范围指定，保留终止原因与根 ID。quality_return 不改记为采购终止。实际退回一次确认完整范围，不接受局部数量，不生成库存流水。不可变退回事实区分 quality 与 procurement_termination；仅前者可成为质量补货来源。

## 实收更正

请求携当前行版本、上一修订 ID、明确的原实物核对确认、各调整范围及其原版本、新范围数量、实收总量和原因。只改变被选中的未处置范围；其余有效叶子可以继续引用旧修订，不因 current_receipt_revision_id 改变而失效。终态 inbounded/returned 不能修改。

新实收必须等于不变叶子总量、被调整后的范围量及 newRemainderQuantity 之和，并不少于真实累计入库加真实退回。累计入库只由 Inventory 基于 inventory_transaction 返回，范围终态仅用于交叉核对。原录入遗漏的剩余实物可用 newRemainderQuantity 创建新的待复核根，因此原量已全部入库／退回时仍可补录原实收遗漏；必须明确不是后来新到货。

受影响的旧 reviewing case 被替代；每个变化范围创建 receipt_correction case。减到零仍有 coveredQuantity=0、无目标实物范围的 case，必须 review_only 核实完成。终止待退范围的修订继承 termination_root_scope_id，复核后仍为 termination_return，不因新结论批准而恢复入库。

## 事务、权限和防重

锁序为采购根（数值 ID 排序）→采购行／供应商→Product 资格（需要时）→到货明细／范围→Quality→Inventory。跨模块仅调用 public.ts，业务判断用锁内当前读；展示查询不承担资格。采购、实收及处置命令共用原采购根，关闭后仍可做物流；同事务失败回滚范围、Quality、Inventory 和审计。

| POST 路径（省略 /api） | 权限 | scope |
| --- | --- | --- |
| /procurement/receipts/actions/confirm | procurement:receipts:confirm | procurement.receipt.confirm.v1 |
| /procurement/receipt-lines/:id/actions/correct-receipt | procurement:receipts:correct | procurement.receipt.correct.v1 |
| /procurement/receipt-lines/:id/actions/start-review | quality:inbound-inspections:review | procurement.receipt.review.v1 |
| /procurement/receipt-lines/:id/actions/inspect | quality:inbound-inspections:inspect | procurement.receipt.inspect.v1 |
| /procurement/receipt-lines/:id/actions/terminate-return | procurement:receipts:return | procurement.receipt.terminate-return.v1 |
| /procurement/receipt-lines/:id/actions/return | procurement:receipts:return | procurement.receipt.return.v1 |
| /procurement/purchase-inbounds/actions/confirm | production:inbounds:confirm | procurement.inbound.confirm.v1 |

以上全部要求 Idempotency-Key，指纹保留完整请求与乐观版本，按平台 executor 与写入、成功审计复用同一事务。新增到货的 details 顺序决定明细行号，不按采购行去重或重排；一次入库的 details 顺序也属于原始确认意图。库存事实和退回事实分别有范围唯一键，幂等恢复不替代范围状态及真实依据核对。

旧 `/production/purchase-inbounds` 只保留 Inventory 历史 GET，旧创建、确认、取消 POST 已移除。新入库核对草稿仅在前端，数据库不保存 pending 采购入库。成品入库原有 pending 流程保持。
