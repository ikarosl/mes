# 到货与仓库查询

传输字段以[共享契约](../../../../../../packages/contracts/src/procurement/receipts.ts)和[入库契约](../../../../../../packages/contracts/src/procurement/inbounds.ts)为准；分页、错误及候选完备性遵守[接口规范](../../../../../../docs/api-conventions.md)。当前事实语义见[到货和仓库处理](receipts.md)。

## 到货分页与精确定位

GET /procurement/receipts 直接按到货单分页，包含作废历史，采购单号与供应商作为来源展示。supplierId 和 purchaseOrderId 精确筛选，keyword 搜索到货单号、原采购单号、供应商、基础物料名称、物料编码、精确版本编码和供应商批号；筛选交集先于分页，按 received_at DESC、id DESC 稳定排序。总数以实际到货单计，命中同单多条物料不重复计数。物料关键词只限定命中的到货单，不改变该单完整行数和展开明细。

单张到货 worklist-lines、详情和 voiding 返回完整轻量行，登记限制保证最多 100 行；不会把当前分页误作整单。receipt-lines/:id/location 按持久明细 ID 返回采购及到货路径，receipt-lines/:id 读取当前来源。行号仅作为来源采购行的显示属性。

stage 是展示结果：作废为 voided，存在实际入库或说明为 handled，否则 registered。handled 仅表示已有仓库记录，不能推算剩余实物或全部处理完成。quantities 只有真实 inboundQuantity；handlingCount 与最后 otherHandlingNote 是说明历史投影。没有实收量、可入量、待退量和检验轮次。

receipt-order-options 使用已下单且有 open/new_arrival 行的采购候选，按公共分页；明细仍在确认事务中校验。上述仓储查询均要求 warehouse:receipts:view，无需采购管理页面权限。

## 入库来源候选

GET /procurement/inbound-sources 按有效到货物料分页，支持 keyword、supplierId、purchaseOrderId、receiptLineId 和 receiptLineIds，多个精确筛选取交集。keyword 搜索到货单号、采购单号、供应商、物料名称、物料编码、精确版本编码和供应商批号。按到货时间、明细 ID 倒序稳定排序。

候选无数量授权含义，包含尚未检验、尚未入库、已有入库或说明的有效到货；作废来源退出候选。receiptLineVersion 用于提交时的乐观校验，入库总量仅供参考，不作为上限。每条来源可多次实际入库和分批归入新旧库存批次。入口要求 warehouse:inbound:view，批次候选由 Inventory 提供。

## 历史查询与作废预览

receipt-lines/:id/inbounds 按真实已完成采购入库及匹配原始正流水分页，返回实际数量、入库单、明细、目标库批和流水身份。receipt-lines/:id/handlings 按创建时间、ID 倒序返回不可变说明，新独立说明没有入库关联，已有历史入库关联保留原事实。独立追加说明不改变到货行版本。两类历史均保留作废来源，不筛掉停用的历史资料。

voiding 是同一只读快照的完整行与阻断原因预览；真实入库或有效补单阻断。提交命令在来源锁内复核全量明细和版本，预览不授予写资格。

## 采购来源与补单候选

采购行 quantities.inboundQuantity 与 receipt-records 只累计该采购行自身有效到货的实际库存正流水；超量补单 existing_receipt 没有自身到货，quantities=NULL。receipt-records 包含尚未入库的有效登记，页头完整已入量不受关键词和分页影响。到货不是数量台账，登记次数不换算采购完成度。

excess-receipt-candidates 和 quality-replacement-candidates 都列出该原采购行的有效到货，支持 keyword 与 receiptLineId；关键词搜索到货单号和供应商批号。候选不要求检验、授权、已入或已退。receiptLinkedSupplements 按同到货、同补因分组统计状态、行数和计划量，包含取消历史且不表示仓库额度。正式创建及下单仍核验同源有效到货，规则见[补单](purchase-orders.md#补单来源与独立物流)。

## 来料质检主单查询

来料分组及报告数量、最近报告摘要由[Quality 分组契约](../../quality/docs/incoming-inspection-orders.md)维护。GET /quality/inbound-inspections/receipt-lines/:id 复用当前 ProcurementReceiptLine 来源投影；GET /quality/inbound-inspections/:id/reports 独立分页报告，GET /quality/inbound-inspections/reports/:reportId 按历史报告精确读取及打印。均要求 quality:inbound-inspections:view；打印采用报告持久快照。

跨模块展示读取只在登记的 infrastructure/queries 中完成，不作为来源写入资格、业务状态或库存数量授权。
