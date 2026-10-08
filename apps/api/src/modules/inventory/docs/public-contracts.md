# Inventory 公开能力

本章维护 Inventory 向 Production、Procurement 开放的事务能力。完整锁序见[库存协作协议](../../../../../../docs/inventory-extraction-design.md)，物理字段见[数据库边界](database.md)。公开端口只传业务身份与数量，不暴露 SQL 或连接。

`InventoryStockCommand` 继续负责物料批次锁、生产领料负流水和退料正流水。预留与业务需求仍属 Production；库存余额只由 `inventory_transaction` 及其触发器投影决定。

`InventoryInboundCommand.confirmPurchaseReceipt` 接收来源已锁定并验证的到货授权明细。每条输入含独立 `detailKey`、到货/实收修订/检验/allocation 引用、服务端解析的确认时供应商名称、物料精确版本与单位快照、正整数量和 `target`；允许不同供应商合成一张外购入库单，不再接收主单唯一 `provider`。`confirmFinishedOutput` 接收 Production 在同池事务内已锁定并验证的当前轮授权明细，每条输入含 allocation ID、revision ID、类别、正整数量与 `target`。两类各自可以在一单中提交多条明细，不混合来源类型；一授权可在不同单或同单分次执行，多授权可归同批次。Inventory 不代替来源模块判断当前轮、审批、质量与剩余额度。

共用目标类型见 [`InventoryInboundTarget`](../../../../../../packages/contracts/src/production/inventory-target.ts)：`{mode:'new',clientKey}` 或 `{mode:'existing',batchId}`。同一请求的相同 `clientKey` 明确共用一个新批次且只取一次 IB；已有目标沿用原批号。新批号仅在真实创建 `item_batch` 时由服务端生成；已有批次须精确匹配成品或物料版本及单位，且状态为 `available`。同目标的每条实际明细保持正整数上限，批次累计余额使用 BIGINT 投影，不套用单笔上限。请求不能把别的来源、供应商或类别写成库批的唯一归属。

两种确认均在调用者事务内原子创建已完成主单、每条实际明细、匹配正流水和成功审计。物料正流水为 `purchase_inbound`，成品为 `production_inbound`。成品主单/库批采用中性 `finished_product`；计划内外归属由 `production_output_allocation.category` 经 `inbound_detail.production_output_allocation_id` 追溯。HTTP 幂等由来源用例处理。

`InventoryInboundCommand.readFinishedTaskAllocationReceipts(batchId,lock)` 返回该任务各授权的历史实际入库量，由 Production 按授权类别汇总计划内外；`readFinishedAllocationReceipts(ids,lock)` 返回每授权实际执行量。它们只读取已完成入库明细和匹配的正流水，不用当前库存余额。`InventoryInboundQuery.getReceiptInboundFacts({receiptLineIds})` 同样按到货历史全部修订累计，返回每笔实际入库的来源、allocation、明细、流水、`batchId` 和数量，不预设一个到货只用一个库批。该事实端口不返回展示批号；在调用者同池事务内只对入库主从单和匹配正流水做当前读，不关联或锁定 `item_batch`，批次身份由既有组合外键保证。批号仍由独立展示查询读取，目标批次仅在实际写入时按[统一锁序](../../../../../../docs/inventory-extraction-design.md#7-事务与锁序)锁定。

库存批次候选公开查询 `listInboundBatchCandidates` 按成品 ID 或物料精确版本、授权单位、可用状态、批号关键词稳定分页。HTTP 入口分别为 `GET /warehouse/finished-inbound-batch-candidates`（`warehouse:inbound:view`）和 `GET /warehouse/material-inbound-batch-candidates`（`warehouse:inbound:view`），无需额外采购或任务页面权限。命令事务仍复核身份与状态，候选结果不授予写资格。

外购入库列表和详情的主单供应商摘要使用 `suppliers` 集合，逐明细的 `supplierId` 从真实采购来源读取，`supplierName` 为确认时名称快照；缺少来源身份时不从名称猜 ID。关键词按明细供应商快照匹配，使用 EXISTS 保持主单计数。库存批次及生产追溯的每笔来源供应方同样取该实际明细快照，不能把合单中另一家供应商显示到本行。

`InventoryInboundRepository` 提供入库/库存历史查询；库批来源集合从每条完成的 `inbound_detail` 与匹配正流水关联授权、批准版、采购到货和检验，不从 `item_batch` 单值推断。外购物料入库详情的 `procurementSource` 是只读展示投影：到货单号与持久行号取该明细保存的到货行，`receipt.purchaseOrderNo` 是登记原采购单；实际采购归属沿该明细的 `procurement_allocation_id → procurement_receipt_allocation.purchase_order_line_id` 取采购行、主单和行号，不能用到货原采购单代替；`inspection` 仅按该明细保存的 `procurement_inspection_id` 取真实检验记录的 `caseId` 和 `inspectedAt`。旧外购无采购来源或任一关联不完整时整个投影为 `null`，原四个来源 ID 仍逐项返回。查询在登记的 `infrastructure/queries/` 批量只读完成，不参与写入资格校验。共批后的领用只能追溯到库批及其来源集合，不能推断领用精确消耗哪次来源。盘点仍是 Inventory 自有用例，仅处理物料批次。
