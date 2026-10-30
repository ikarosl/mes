# 到货、来料检验与入库候选查询

本章维护查询范围、分页身份、数量与历史含义；完整字段见[到货契约](../../../../../../packages/contracts/src/procurement/receipts.ts)及[质检分组契约](../../../../../../packages/contracts/src/quality/incoming-inspection-orders.ts)。组合读取各自使用同一只读快照，独立请求不承诺同一时点；查询结果不代替命令资格。跨模块读取见文末[所有权](#所有权与追溯)。

## 接口和权限

| GET路径（省略/api） | 权限 | 内容 |
| --- | --- | --- |
| /procurement/receipt-purchase-orders | warehouse:receipts:view | 有到货的采购主单分页，筛选及完整计数见[分层查询](#采购到货分层查询) |
| /procurement/receipt-purchase-orders/:id | warehouse:receipts:view | 精确采购主单头，供页外定位及刷新 |
| /procurement/receipt-purchase-orders/:id/receipts | warehouse:receipts:view | 指定采购单的完整到货范围分页，附当前 purchaseOrder 头 |
| /procurement/receipts/:id/worklist-lines | warehouse:receipts:view | 单张到货头和完整轻量处置行，最多 100 行 |
| /procurement/receipts/:id | warehouse:receipts:view | 主单登记信息和完整明细目录，用于到货工作台选行 |
| /procurement/receipts/:id/voiding | warehouse:receipts:view | 整单作废弹窗的完整行集合、版本及资格预览 |
| /procurement/receipt-lines/:id/location | warehouse:receipts:view | 精确解析真实采购主单、到货主单及明细 ID，不扫描列表页 |
| /procurement/receipt-lines/:id | warehouse:receipts:view | 当前选中明细的来源、数量、当前轮及有效分配，用于到货处置与提交前核对 |
| /procurement/receipt-lines/:id/acceptance-context | warehouse:receipts:view | 定稿弹窗的当前明细、明确引用的检验及来源轮号、同检验执行量和采购默认拆分参考 |
| /procurement/receipt-order-options[/:id] | warehouse:receipts:view | 到货页登记使用的已下单采购候选和候选详情，不要求采购管理页权限 |
| /procurement/receipt-lines/:id/:historyKind | warehouse:receipts:view 或 quality:inbound-inspections:view | 到货处置／来料质检共用的 rounds/revisions/allocations/cases/returns/inbounds/acceptances 独立历史分页 |
| /quality/inbound-inspection-orders | quality:inbound-inspections:view | 质检主单分页，子目录及完整到货物料按[分层契约](#来料质检主单查询)读取 |
| /quality/inbound-inspections/:id | quality:inbound-inspections:view | 按真实 case ID 精确读取来源行、来源轮号及完整检验事实 |
| /quality/inbound-inspections/receipt-lines/:id | quality:inbound-inspections:view | 专用质检详情 `ProcurementInboundInspectionDetail`，含来源身份、版本、当前轮、实物范围及当前检验依据 |
| /procurement/inbound-releases | warehouse:inbound:view | 当前合法正式可入范围分页 |
| /procurement/purchase-order-lines/:id/receipt-records | procurement:orders:view | 采购行累计到货的正数量来源，含完整累计量及筛选后来源分页，详见[采购行到货记录](#采购行到货记录) |
| /procurement/purchase-order-lines/:id/excess-receipt-candidates | procurement:orders:view | 采购页超量补单的真实到货候选，keyword 搜到货单号／供应商批号，receiptLineId 精确解析 |
| /procurement/purchase-order-lines/:id/quality-replacement-candidates | procurement:orders:view | 采购页质量补发的质量补发到货候选，按到货明细分页；keyword 搜到货单号／供应商批号／实际退回单号，receiptLineId 精确解析 |

到货登记与处置使用仓储到货查看权限，URL 和事实所有者保持 Procurement。来料质检使用专用来源详情与检验权限；采购订单详情、入库或质检页面的导航分别按目标页面授权，不因显示来源单号隐式授予完整采购、仓储或 Quality 能力。权限目录及 any-of 规则见 [Identity](../../identity/docs/database.md#14-permissions)。

分页与批量输入遵守[公共 HTTP 规范](../../../../../../docs/api-conventions.md)。供应商按来源采购行所属主单关联；采购及到货头、详情及作废预览返回唯一 supplierId/supplierName，不返回供应商集合。供应商筛选直接限定采购主单，详情仍展示该到货全部明细。

`/procurement/receipt-order-options` 返回 `PageResult<ProcurementReceiptOrderOption>`，只包含已下单且仍有进行中新到货行的采购单；候选直接包含主单 supplierId/supplierName，候选详情保留完整采购行，不附供应商集合或逐单请求补齐名称。主单契约见[采购订单](purchase-orders.md#主单供应商与单工单来源)。

## 采购到货分层查询

按“采购主单分页 → 所属到货分页 → 单张到货完整轻量行”读取；两层 total 分别计采购单和到货，不计物料行。单张到货最多 100 行，超过上限须报冲突，不能截断冒充完整集合；新增导入或追加入口不得绕过此边界。

采购父列表只列有过到货的采购单，含仅有作废登记的采购单。关键词覆盖采购／到货号、供应商及物料名称、编码、精确版本。关键词、待定稿和供应商条件须由同一真实到货行满足，不能拼接不同来源的命中。待定稿只看有效登记的当前轮，不看历史检查。父摘要的到货数和待定稿明细数是完整计数，不随关键词或当前页裁剪。

匹配父单后，所属到货页保留全部归属范围，不继承父筛选；单到货行也不裁掉未命中、已处理完或作废来源。采购按创建时间／ID 倒序，到货按到货时间／ID 倒序，物料按登记顺序／ID 排序。不存在或尚无到货的采购头返回 `RECEIPT_NOT_FOUND`。

精确 location 沿来源解析采购、到货及明细 ID，不受筛选和分页影响；页外定位对象不计入 total，不扫描所有父子页。到货明细只用 ID 识别，不公开登记行号；采购行号仅用于核对原采购行。

轻量行返回身份、物料／精确版本／单位、供应商批号、当前轮与数量，不加载历史、完整检验或逐笔执行。来源头表达采购单号、到货号、唯一供应商及时间，详细身份按行另读。

作废预览独立读取完整行集合、主单与行／轮版本及阻断原因；该集合不受列表分页影响。预览基于同一快照中的真实入退和非取消补单引用，不加载无关历史。作废标记来自主表，没有独立作废记录身份；资格及提交时复核见[整单作废](receipts.md#整单到货登记作废)。

## 工作列表的查询复用

仓库到货列表与来料检验列表共用真实到货来源，分别鉴权和读取所需投影。仓库读取处置数量与完整当前轮，质检读取实物剩余、阶段和检验摘要；复用来源不扩大另一场景的读取或写入资格。采购主单与质检主单各有独立父身份、筛选和 total，不共享可变查询上下文。

## 采购行到货记录

`GET /procurement/purchase-order-lines/:id/receipt-records` 使用采购查看权限，返回 `PurchaseOrderLineReceiptRecordPage`。它只读核对本行 `quantities.receivedQuantity` 的当前来源，不提供到货登记或处置能力。采购行不存在返回 `404 PURCHASE_ORDER_NOT_FOUND`；草稿、已取消和已结束行均可读取，无来源时返回空分页及累计量 `"0"`，不以采购状态过滤已存在的物流事实。

采购详情与该接口共用 `readPurchaseLineMetrics`，按自身到货明细聚合非作废登记的当前修订 T，每次正数量到货只返回一条。普通采购和质量补单各读自己的到货，超量补单不统计物流，接口固定为空分页及累计量 `"0"`。历史分配不可叠加为到货量，也不沿补单 origin_* 追溯链向最初原单累计。

每次正数量到货只返回一条，数量取当前有效实收；顶层累计量不受搜索或分页影响，total 只计筛选后的明细。关键词搜到货号、供应商批号或明细 ID，按到货时间及明细 ID 倒序。存在性、累计量、总数与当页记录在同一快照读取。

## 当前轮次与历史

整单详情只提供原登记信息及完整行目录；行的 stage 只供定位，按[检验投影](#到货物料行检验投影)识别剩余量、拒收及作废，异常 superseded 轮保留展示兜底。目录不附当前分配、检验或历史，作废资格另读完整预览。

单行详情提供当前来源、版本、实收、轮次、数量、采购对照和有效分配。定稿上下文另补当前明确引用的检验、真实发起轮号、同检验实际执行量及采购默认拆分参考；无明确检验引用时返回空依据和零执行量，不能从最新历史猜测。

质检使用独立来源详情，仅含来源和版本、当前轮、核实总量／真实已入／已退／剩余，以及当前在途或明确采用的检验。完整检查经 Quality public 批量取得，不受历史窗口限制；不附采购分配、清单、目标批次或仓库七类历史。连续录入与提交前重核使用同一契约。

当前轮只取明细指针。轮次起始量是历史快照，不是额外数量池。当前分配只来自 finalized 轮，保留原授权、实际执行、剩余量及当前性，含已执行完的行；待检、检查中或待定稿没有当前分配。旧分配可读历史未执行量，不能再执行。

轮次、实收修订、分配、检验、退回、入库、清单各自独立分页，计数只在对应响应返回；默认详情不预载历史或计数。历史保留当时依据，库存批次按逐笔入库事实查看。完整 case 经 Quality public 批量取得，不逐行请求。

## 数量投影

- 本次到货核实总量T取`current_receipt_revision_id`。实际I只累计completed/purchased入库明细及匹配正库存流水，匹配物料、版本、批次、单位、状态、数量和来源明细；不用库存余额或办理状态代替库存事实。
- 实际R来自不可变退回交接，人工拒收退回也计入R，只有reason_type=quality才计入qualityReturnedQuantity。
- `unprocessedQuantity=T-I-R`。当前轮尚未finalized时，这一数量整体计入undeterminedQuantity；finalized后只累计当前pending份额。
- `pendingInboundQuantity`取当前inbound分配余量；`approvedQuantity=I+pendingInboundQuantity`，是正式授权履约量，不重新用QC建议封顶。
- `pendingReturnQuantity`含质量、超发、采购终止和人工拒收待退；`returnDueQuantity=R+pendingReturnQuantity`。
- `hasOpenReview`展示当前检验中、待复检或不放行的质量阻断，不能仅由版本不同推断。

以上数量针对有效登记。作废到货的 `receivedQuantity/unprocessedQuantity/undeterminedQuantity/approvedQuantity/returnDueQuantity/pendingInboundQuantity/pendingReturnQuantity` 均为 0、`hasOpenReview=false`，不把作废前 T 改写成零数量 revision。单行概况的 `registeredQuantity` 精确读取 `current_receipt_revision_id` 所指修订的原核实量，作废后保留用于展示，不能作为有效数量；完整证据通过修订历史读取。终止轮 `startingQuantity` 也是历史快照；采购汇总、累计量上限与待办不再计入该登记。实际入退继续以不可变事实为准，作废前提保证该单 I=B=0；采购取消资格仍保留自身历史到货事实，不因数量归零恢复。

采购行物流投影聚合自身到货：当前有效处置余量、非作废当前实收及历史实际入退，不根据超量补单拆分。未定稿剩余量仍归到货本身的采购行。数量仅供展示和物流参考，不作为采购结束或恢复资格。

换轮、拒收及撤销对当前授权的影响由[正式清单](receipt-acceptance.md)维护；采购结束和恢复不冻结这些数量。

单行详情及定稿上下文的 `purchaseLineQuantities={plannedQuantity,receivedQuantity}` 返回来源采购行计划量及有效累计到货量，与本批数量处于同一只读快照。累计量复用采购行物流投影，包含本批及已实际入库／退回部分，排除作废登记；只统计直接登记于该采购行的到货，不沿补单来源追溯累计。数量仅供核对，不作为新的办理上限；前端不逐行请求采购详情或对分页记录求和。

定稿上下文的 `originalRemainingPlannedQuantity=max(0,原采购行计划量−当前正式已授权履约量)` 是同一快照中的默认拆分参考。前端默认将计划内部分可入、超出部分待处理，库管可调整；不将采购计划余量作为后台入库上限，也不代替 QC、总量和超建议说明校验。详情不返回采购归属来源集合。

定稿上下文的 `currentInspectionExecution` 分列 `inboundQuantity`、`qualityReturnedQuantity`、`otherReturnedQuantity`，只累计引用当前 inspectionId 的真实入库／退回，不累计历史授权量；当前无 QC 时三项均为 0。真实质量退回按分配的 quality 原因识别，其他原因归入后一类。全检沿用同一记录的建议按[正式清单数量规则](receipt-acceptance.md#数量与建议)计算，新 QC 不扣旧检验执行事实；实际入库仍消费当前正式授权。

## 来料质检主单查询

以下相对路径统一位于 `/quality/inbound-inspection-orders`，由 Procurement 场景编排。全部 GET 要求 `quality:inbound-inspections:view`，写入要求 `quality:inbound-inspections:manage`；不附加采购或仓储页面权限。完整传输类型以 [incoming-inspection-orders.ts](../../../../../../packages/contracts/src/quality/incoming-inspection-orders.ts) 为准。

主单分页、目标候选、精确主单、所属到货分页、到货候选、完整轻量行及来源定位分别读取，不能用当前页覆盖全部关联。主单按创建时间／ID 倒序，所属到货按 ID 倒序；完整物料沿用上述 100 行边界。增量写入、来源归属和版本规则见[Quality 分组主单](../../quality/docs/incoming-inspection-orders.md)。

主单关键词覆盖主单号、到货号、采购号、供应商及物料名称／编码／精确版本。子项筛选在分页前匹配主单，不重复主单。keyword 与 stage／supplierId 分别在主单级核验，可以由同主单不同来源命中；同时指定 stage 和 supplierId 时，二者须由同一来源行满足。阶段依旧读取当前来源及真实剩余，不能用最新历史结论推断。匹配主单后，块内目录和单到货物料仍保留完整归属范围，不继续按主单关键词或阶段裁掉未命中子项。空主单默认可见，只匹配子项的筛选不命中它。主单不持久化阶段或统计缓存。

候选默认包含未分组且未作废到货，不以未检查、剩余正数或尚未处理完作为条件。assigned/all 可返回已分组的作废来源，所有模式都排除未分组作废来源。头部归属和版本只用于建立明确操作草稿，不授予提交资格；关联发生变化时由命令冲突处理，不静默抢占。

当前轮、检查摘要及真实执行按本次来源范围批量读取，不逐行装载详情；阶段仍在分页前筛选。返回归属变化时按真实归属刷新定位，不伪造空目录。

Quality 分组表的只读字段登记在 Procurement `infrastructure/queries/` 下；该目录不写或锁 Quality 表。写命令的来源锁、同池事务及版本规则分别由[来源编排](receipts.md#质检分组的来源编排)和[Quality 分组主单](../../quality/docs/incoming-inspection-orders.md)维护。

## 到货物料行检验投影

单到货检验投影完整保留未检、拒收、已处理完及作废来源；历次检查不增加物料行数。仅提供稳定来源、阶段、当前轮摘要、实物剩余和检验摘要，不加载完整结果或历史。作废前完成记录仍可精确读取，失效的在途检查不能继续提交。

`currentCase` 优先指向当前轮 inspectionId 明确采用的真实办理；当前没有采用结果时，仅查当前轮的 reviewing 办理；两者皆无时为 null，不以历史最大 ID 充当当前依据。摘要只含 id/status 和 `inspection={id,releaseDecision}|null`，currentCaseRoundNo 为该办理真实发起轮号。isInherited 仅在该结果被当前轮明确采用、且发起轮不同于当前轮时为 true。旧轮可已被替代而结果仍被新轮明确引用；旧轮状态不能代替采用关系，也不授予写入资格。

阶段优先识别到货主单或当前轮作废为 voided；有效来源随后按 unprocessedQuantity=0 派生 completed（本批已处理完），再按当前轮 triggerType=manual_rejection 派生 manual_rejection（人工拒收），其余取当前轮的 uninspected／reviewing／reinspection_required／quality_rejected／awaiting_acceptance／finalized。因此 finalized 只表示仍有剩余实物且非人工拒收的已定稿行。阶段是展示投影，不写回 round.status，也不授予业务资格。主单阶段筛选使用相同口径，不把命中后的完整物料集合再次裁剪。

实物剩余取当前实收减真实已入／已退；作废来源有效剩余为零，原量留在修订历史。摘要只读取已登记的检验定位与结论字段，不查正式分配或完整检验。阶段与数量不改变办理状态或写入资格。

检验历史通过到货行 cases 端点独立分页。精确 case 接口直接按真实 case ID 定位原办理及来源轮，并经 Quality public 取得该份完整检验事实；不查询当前轮、实物数量或其他历史，不受主单筛选和历史窗口影响。来源行详情继续由 `/quality/inbound-inspections/receipt-lines/:id` 提供，不要求来源当前已分组。

## 入库候选及正式分配

入库候选须是未作废到货的当前 round.finalized 的 inbound allocation、无终止约束、有本轮 acceptance、Quality 完成且明确 released，当前轮／清单／分配的 QC 与 revision 同源一致。普通分配更正可继承同批旧检查，不要求 case 创建于新轮。旧轮失效或整单作废立即从候选消失，不把用户选择静默替换成新分配。

入库候选按到货自身采购单筛选，返回 roundId/roundVersion、行版本、allocationId、acceptanceId、inspectionId、inspectionCaseId、receiptRevisionId 及正式剩余量。inspectionCaseId 指向该分配实际采用检验的 case，不用当前轮 case 替代。采购身份沿 allocation.receipt_line_id 对应的到货采购行解析；分页仍以 allocation 为单位。allocationIds 精确解析已选授权；每次执行重读剩余量，物料用途在分页前过滤，采购关闭不隐藏有效物流。

超量补单候选限定原采购行的未作废到货，须存在当前有效可入余量或真实历史已入库；全待处理、全退回及失效未执行的可入记录不提供资格。返回到货身份、时间、供应商批号、下述五项到货处理数量和 receiptLinkedSupplements。搜索、精确 receiptLineId、计数与分页共用筛选和只读快照，不以原采购关闭排除合法来源。创建命令仍在锁内核验实际事实。

质量补发候选限定请求路径原采购行，按到货明细分页；每份到货只有一条。合法来源为未作废到货上存在当前有效正式质量退回，或真实质量退回历史。返回 receiptLineId、receiptId/receiptNo、receivedAt、supplierBatchCode、下述五项到货处理数量和 receiptLinkedSupplements。当前无质量待退、但历史实际质量已退仍返回候选。资格聚合只认 quality 原因，不由展示的全部原因待退／已退量判断；人工拒收、超发及采购终止退回不单独提供质量补发资格。分配 ID、分配授权量、分配当前性和单笔退回单号不属于该候选契约。

两类候选共用 `PurchaseSupplementReceiptQuantities`，平面返回 `receivedQuantity/pendingInboundQuantity/inboundQuantity/pendingReturnQuantity/returnedQuantity` 五个必填整数字符串。五项均描述该次到货的整体处理情况，口径复用[数量投影](#数量投影)：本次到货量取当前实收修订 T；可入及待退只取当前 finalized 轮的有效分配余量；已入及已退只取该到货全部历史真实执行事实，旧轮未执行授权不累计。待退及已退包含质量、超发、采购终止和人工拒收全部原因，不只代表质量退回。五项数量只供核对，不提供新的候选资格、超量判断或累计补购额度，也不作为补单数量上限。

keyword 匹配到货单号、供应商批号，或匹配真实质量退回单号；receiptLineId 精确筛选在计数和分页前生效。按到货时间和明细 ID 倒序稳定排序。质量新建命令在原采购根锁内核验到货资格；已有补单下单只检查固定身份、未作废和采购资格。

两类候选的 receiptLinkedSupplements 按同原到货明细、同补因汇总，包括已取消状态；count 为关联补单明细条数，plannedQuantity 为计划补购量，不表示仓库额度。相关单号通过 originOrderLineId＋originReceiptLineId＋supplementReason 查询，不支持分配级补单反查。

## 所有权与追溯

`scripts/api-data-ownership.mjs` 登记 Procurement 所有的 round 表及展示读取边界。允许字段以登记为准，用于当前采用关系、来源轮定位及历史窗口引用；完整办理和检查事实经 Quality public 读取。Inventory 读取限定于正式分配引用及真实执行事实。查询不写、锁外部模块表。供应商与物料当前名称按稳定 ID 读取，历史不因停用或软删除消失；到货行的批次集合与每笔入库历史从已确认 inbound_detail 及匹配正库存流水读取；每笔历史展示目标批次 ID 和批号，不用一个批次代表整条到货。已确认入库的供应商历史名称由 [Inventory 明细快照](../../inventory/docs/database/inventory-ledger-and-inbound.md#9-inbound_detail)提供，不从文本反推供应商身份。
