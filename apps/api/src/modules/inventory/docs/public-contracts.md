# Inventory 公开能力

本章维护 Inventory 向 Production、Procurement 开放的事务能力。完整锁序见[库存协作协议](../../../../../../docs/inventory-extraction-design.md)，物理字段见[数据库边界](database.md)。公开端口只传业务身份与数量，不暴露 SQL 或连接。

`InventoryStockCommand` 继续负责物料批次锁、生产领料负流水和退料正流水。预留与业务需求仍属 Production；库存余额只由 `inventory_transaction` 及其触发器投影决定。

`InventoryInboundCommand.confirmPurchaseReceipt` 接收来源已锁定并验证的到货授权明细。每条输入含独立 `detailKey`、到货/实收修订/检验/allocation 引用、物料精确版本与单位快照、正整数量和 `target`。`confirmFinishedOutput` 接收 Production 在同池事务内已锁定并验证的当前轮授权明细，每条输入含 allocation ID、revision ID、类别、正整数量与 `target`。成品与采购可以在一单中提交多条明细；一授权可在不同单或同单分次执行，多授权可归同批次。Inventory 不代替来源模块判断当前轮、审批、质量与剩余额度。

共用目标类型见 [`InventoryInboundTarget`](../../../../../../packages/contracts/src/production/inventory-target.ts)：`{mode:'new',clientKey}` 或 `{mode:'existing',batchId}`。同一请求的相同 `clientKey` 明确共用一个新批次且只取一次 IB；已有目标沿用原批号。新批号仅在真实创建 `item_batch` 时由服务端生成；已有批次须精确匹配成品或物料版本及单位，且状态为 `available`。同目标的每条实际明细保持正整数上限，批次累计余额使用 BIGINT 投影，不套用单笔上限。请求不能把别的来源、供应商或类别写成库批的唯一归属。

两种确认均在调用者事务内原子创建已完成主单、每条实际明细、匹配正流水和成功审计。物料正流水为 `purchase_inbound`，成品为 `production_inbound`。成品主单/库批采用中性 `finished_product`；计划内外归属由 `production_output_allocation.category` 经 `inbound_detail.production_output_allocation_id` 追溯。HTTP 幂等由来源用例处理。

`InventoryInboundCommand.readFinishedTaskAllocationReceipts(batchId,lock)` 返回该任务各授权的历史实际入库量，由 Production 按授权类别汇总计划内外；`readFinishedAllocationReceipts(ids,lock)` 返回每授权实际执行量。它们只读取已完成入库明细和匹配的正流水，不用当前库存余额。`InventoryInboundQuery.getReceiptInboundFacts({receiptLineIds})` 同样按到货历史全部修订累计，返回每笔来源的 `batchId/batchCode` 集合，不预设一个到货只用一个库批。

库存批次候选公开查询 `listInboundBatchCandidates` 按成品 ID 或物料精确版本、授权单位、可用状态、批号关键词稳定分页。HTTP 入口分别为 `GET /warehouse/finished-inbound-batch-candidates`（`production:inbounds:view`）和 `GET /warehouse/material-inbound-batch-candidates`（`warehouse:inbound:view`），无需额外采购或任务页面权限。命令事务仍复核身份与状态，候选结果不授予写资格。

`InventoryInboundRepository` 提供入库/库存历史查询；库批来源集合从每条完成的 `inbound_detail` 与匹配正流水关联授权、批准版、采购到货和检验，不从 `item_batch` 单值推断。共批后的领用只能追溯到库批及其来源集合，不能推断领用精确消耗哪次来源。库存查询可只读联表，但业务命令校验继续通过来源公开能力。盘点仍是 Inventory 自有用例，仅处理物料批次。
