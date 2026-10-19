# Inventory 公开能力

本章维护 Inventory 向 Production、Procurement 开放的事务能力，以及其他单据 HTTP 命令。完整锁序与反向预留协作例外见[库存协作协议](../../../../../../docs/inventory-extraction-design.md)，六场景字段及不可变守卫见[数据库边界](database.md)。公开端口只传业务身份、数量和明确结果，不暴露 SQL、连接或 SDK 类型。

## 生产领退料

`InventoryProductionDocumentCommand` 是 Production 创建／确认／取消实际领退料的入口，生产资格、任务阶段、需求及补料履约由调用者先在来源锁内决定。端口 `getOutbound/getReturn` 返回父单 ID、编号、任务／工单、状态、版本及原分配／需求、精确身份、原库批、数量、单位和备注；公开值状态统一 pending/completed/cancelled，底层出库 pending_picking 映射 pending。带锁版本只锁 Inventory 自有公共主从，不反锁生产来源。

`createOutbound/createReturn` 接收服务端已核验的一任务／工单及每条来源分配的真实身份、数量和单位，创建待确认公共单据，不记库存。`completeOutbound/completeReturn` 整单生成匹配负／正流水并推进父单；取消经 `cancelOutbound/cancelReturn` 比较父版本，领料取消另传受控 manual/production_batch/production_termination。终态重放不递增版本。公共明细及库存写入归 Inventory，来源命令成功审计由 Production 一次写入，同事务包含需求余额、任务版本及补料履约。

`facts({productionBatchId?,allocationIds?,demandIds?,lock?})` 至少限定一个范围，多范围取交集；只返回 production_material 和 return_inbound，其他单永不参与生产履约、退料／损耗额度或审批依据。lock=true 要求调用者已有活跃同池事务，对公共父单与实际明细使用当前读及 NOWAIT；普通查询不授予写入资格。它不关联或锁生产分配，也不以库存余额代替历史领退料。

生产退料 HTTP 使用 returnNo/returnAt/returnQuantity 及 pending/returned/cancelled 状态，returned 对应公共 completed。回原批次 available 库存是固定业务规则，响应不另附固定状态或释放标记；退料引用为 inbound_detail，独立退料表不保留。

`InventoryStockCommand` 提供物料批次历史引用、统一父身份及库存批次锁与物料数量。库存流水动作在公共单据 adapter 内执行，Production 不得自行写单据或调用裸流水来替代来源编排；单据与流水关联由登记展示查询读取。

## 采购和批准成品实际入库

`InventoryInboundCommand.confirmPurchaseReceipt` 接收 Procurement 已锁定并核验的到货授权。每条输入含到货／实收修订／检验／allocation、服务端确认时供应商名称、物料精确身份与单位、正整数数量及 target。允许多供应商合成一张采购入库，不保存主单唯一供应商。

`confirmFinishedOutput` 接收 Production 已锁定并核验的当前轮批准授权，每条输入含 allocation、revision、类别、数量及 target。两类可同单多明细、分次执行，单内不混来源；同授权可进多个库批，多授权可共库批。Inventory 复核自有目标、身份、单位、容量与单据一致性，不替来源判断当前轮、批准、质量或剩余额度。

两类确认结果及成功审计通过真实 `inboundDetailId`、`batchId` 和 `transactionId` 关联来源授权，采购明细另含到货行身份；每条入库明细独立生成持久身份和唯一正流水。

目标 [`InventoryInboundTarget`](../../../../../../packages/contracts/src/production/inventory-target.ts) 为 `{mode:'new',clientKey}` 或 `{mode:'existing',batchId}`。单内相同 trim 后 clientKey 才共建一次真实批次、取一个 IB；已有批次精确身份和单位一致且 available。采购／批准成品在同事务按 pending→明细／目标→流水→completed 完成，外部一次确认成单，无持久仓库编辑草稿。采购记 purchase_inbound，批准成品记 production_inbound；成品主单／库批中性 finished_product，类别沿明细产出授权追溯。

`readFinishedTaskAllocationReceipts(batchId,lock)` 返回任务每授权累计真实已入，Production 按类别汇总；`readFinishedAllocationReceipts(ids,lock)` 返回每授权执行量。`InventoryInboundQuery.getReceiptInboundFacts({receiptLineIds})` 按到货历史全部修订累计，返回到货行 ID、累计实际已入量及每笔真实入库的 allocationId/quantity，不预设一到货一库批。锁内事实读取只对自有主从及匹配正流水当前读，不锁历史 item_batch；展示批号独立读取。目标排他锁仅在实际写入时按完整集合取得。

## 其他入出库与幂等

`/warehouse/other-inbounds`、`/warehouse/other-outbounds` 分别提供列表／详情，和创建草稿、保存草稿、整单确认、整单取消四类写命令。每方向独立页面 view/create/update/confirm/cancel 权限，后端每入口鉴权。创建 POST、保存 PATCH `/:orderId`，确认／取消 POST `/:orderId/actions/confirm|cancel`；保存、确认和取消携带父版本，取消另有原因。

八个方向／动作组合分别登记 inventory.other-inbound.*.v1 与 inventory.other-outbound.*.v1 scope（create/save/confirm/cancel）。所有写入口要求 Idempotency-Key，并由平台 executor 将幂等记录、单据、批次、流水、成功审计及完整响应同事务提交；同键同语义重放原结果，同键不同语义拒绝。未知结果和有限重试继续原键；锁等待、NOWAIT 或连接等已分类瞬态失败先整体回滚，有限重试用原语义，不能只重试半次扣库存。Ledger 唯一键不替代 HTTP 幂等。

其他草稿有效行 1–50 条，办理原因必填；保存按父版本变更行、移除行软删除，确认／取消冻结整单。不新增审批、质量定稿或来源履约。new 目标仅其他入库可选，保存不建 item_batch；确认才分组建批并回填 batchId，取消无空批次。客户端不能传人工内部批号或生产日期；其他出库只有已有批次。

`ProductOtherStockQuery.listMaterials/listObjects` 分别提供基础物料和明确物料精确版本／成品的新批次候选及已选回显；物料先选基础身份，再按 `materialId` 服务端查询精确版本，成品直接选择独立成品身份。候选与回显资格、关键词、窗口和完整性由 [Product](../../product/docs/product-rules.md#候选历史展示与写入资格) 维护，不以列表候选授予写资格。resolveReferences 在同池事务锁内核验身份：requireEnabled=true 要求对象／分类及精确版本启用且未删除，new 使用该资格；existing 用 requireEnabled=false 保留停用或删除历史身份，再核对原批次单位及 available 状态。其他用途不授予采购或生产领料资格。

`GET /warehouse/other-stock-materials` 接收 `keyword/includeIds`，返回 `OtherStockMaterials`；`GET /warehouse/other-stock-objects` 接收 `itemKind/keyword/includeIds` 及仅物料类型可用的可选 `materialId`，返回 `OtherStockObjects`。`includeIds` 分别解析基础物料 ID 与当前 `itemKind` 的精确版本／成品 ID，ID 必须是有效数据库身份，最多 100 项。两个端点沿库存用途提供当前启用候选，无需采购或主数据管理权限。`GET /warehouse/other-stock-candidates` 提供已有库批候选，沿历史身份显示物料／精确版本或成品。

三个候选入口供其他入库／出库页面使用，统一按 `warehouse:other-inbounds:view` 与 `warehouse:other-outbounds:view` 的 any-of 并集授权。候选未预留量仅供展示，确认必须当前读重核，不能直接使用候选数量写流水。

## 当前预留协作

Inventory 定义 `InventoryReservationReadPort.currentAllocations(batchIds)`，API 组合根 adapter 只导入 Production public 的 `ProductionReservationQuery`，返回 id/batchId/assignedNumber/allocationStatus。该端口只读有效 active/frozen/abnormal 分配，不调用来源办理资格或修改分配；Production 只锁自己的分配并使用 FOR SHARE NOWAIT。

Inventory 用该事实及自己当前已完成生产领料核对未预留量，不取得预留所有权。调用位置、批次保护、NOWAIT 冲突和有限重试统一见[公共锁序与预留例外](../../../../../../docs/inventory-extraction-design.md#其他出库保护生产预留的窄例外)，不扩展其他来源业务回调。

## 只读展示

库存批次候选公开查询 `listInboundBatchCandidates` 按成品 ID 或物料精确版本、授权单位、可用状态、批号关键词稳定分页。HTTP 入口分别为 `GET /warehouse/finished-inbound-batch-candidates`（`warehouse:inbound:view`）和 `GET /warehouse/material-inbound-batch-candidates`（`warehouse:inbound:view`），无需额外采购或任务页面权限。命令事务仍复核身份与状态，候选结果不授予写资格。

外购入库列表和详情的主单供应商摘要使用 `suppliers` 集合，逐明细的 `supplierId` 从真实采购来源读取，`supplierName` 为确认时名称快照；缺少来源身份时不从名称猜 ID。关键词按明细供应商快照匹配，使用 EXISTS 保持主单计数。库存批次及生产追溯的每笔来源供应方同样取该实际明细快照，不能把合单中另一家供应商显示到本行。

`InventoryInboundRepository` 提供入库/库存历史查询。库存批次列表、详情和名称关键词使用同一名称来源：物料按公共规则读当前名称；成品优先保留有效入库来源中首条工单的冻结名称，没有工单来源时按 `product_id` 读取 `products.product_name`，不因成品停用或软删除丢失历史展示，也不由名称补造工单或任务。

库批来源集合、来源类别筛选及来源工单／任务关键词只读取已完成主单的未删除 `inbound_detail`，并匹配该明细所属场景的原始正流水：采购 `purchase_inbound`、批准成品 `production_inbound`、生产退料 `material_return_inbound`、其他入库 `other_inbound`；身份、精确版本、批次、单位、库存状态及数量必须一致。类别沿产出授权或实际主单读取，授权、批准版、采购到货及检验只返回该明细的真实关联；其他入库不产生生产／采购来源。批次供应方和工单／任务摘要仅在所有有效来源均有相同值时返回，否则为 `null`；`item_batch.source_type` 保留建批类别，不作为实际来源集合或唯一工单归属。

外购物料入库详情的 `procurementSource` 是只读展示投影：到货单号与真实明细 ID 取该明细保存的到货行，不读取或返回到货行号；`receipt.purchaseOrderNo` 是登记原采购单；实际采购归属沿该明细的 `procurement_allocation_id → procurement_receipt_allocation.purchase_order_line_id` 取真实采购行 ID、采购主单 ID 和单号，不读取或返回采购行号，不能用到货原采购单代替；`inspection` 仅按该明细保存的 `procurement_inspection_id` 取真实检验记录的 `caseId` 和 `inspectedAt`。旧外购无采购来源或任一关联不完整时整个投影为 `null`，原四个来源 ID 仍逐项返回。查询在登记的 `infrastructure/queries/` 批量只读完成，不参与写入资格校验。共批后的领用只能追溯到库批及其来源集合，不能推断领用精确消耗哪次来源。盘点仍是 Inventory 自有用例，仅处理物料批次。
