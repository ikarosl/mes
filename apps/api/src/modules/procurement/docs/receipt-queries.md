# 到货、来料检验与入库候选查询

到货详情与历史由 `ProcurementReceiptQuery` 提供，质检分组及分层目录由 `IncomingInspectionOrderQuery` 提供；各自 MySQL adapter 的 SQL 位于已登记的 `infrastructure/queries/`。跨模块展示只读使用 Product 当前物料名称、Inventory 批号和实际入库事实、Quality 办理定位及放行字段；完整检验记录经 Quality public 批量取得。组合详情在同池只读事务的同一快照内组装，不代替写命令锁内资格校验。

## 接口和权限

| GET路径（省略/api） | 权限 | 内容 |
| --- | --- | --- |
| /procurement/receipts | warehouse:receipts:view | 主单分页 |
| /procurement/receipts/:id | warehouse:receipts:view | 主单登记信息和完整明细目录，用于到货工作台选行 |
| /procurement/receipts/:id/voiding | warehouse:receipts:view | 整单作废弹窗的完整行集合、版本及资格预览 |
| /procurement/receipt-lines | warehouse:receipts:view | 跨主单到货行分页，返回当前轮次与数量摘要 |
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

分页默认10、上限100，批量ID最多100且不重复。所有筛选在窗口截取前执行，排序含稳定ID。供应商按具体采购行关联；到货主单列表及作废预览返回去重供应商集合，详情目录逐行展示供应商。供应商筛选使用EXISTS，不使主单或总数重复；详情仍展示该主单全部明细。

`/procurement/receipt-order-options` 返回 `PageResult<ProcurementReceiptOrderOption>`，只包含已下单且仍有进行中新到货行的采购单；候选包含去重 `suppliers` 供到货选单辨认，分页后按当前页采购单批量读取供应商，不逐单请求。候选详情保留完整采购行及供应商汇总。普通采购主单列表不携带该集合，契约见[采购订单](purchase-orders.md#明细供应商与单工单来源)。

`/procurement/receipts` 的 `items` 和 `total` 始终以到货主单计数；`/procurement/receipt-lines` 的 `items` 和 `total` 始终以到货行计数。两个列表共用 `ReceiptListQueryDto`：`page`、`pageSize`、`keyword`、`awaitingAcceptance=yes`、`purchaseOrderId` 和 `supplierId`。主单的供应商及待定稿筛选以存在匹配行判断，不把多个匹配行扩成多张主单；行列表的供应商筛选只匹配该行原采购行供应商，待定稿只匹配该行当前轮状态。`keyword` 匹配到货单号、采购单号、实际供应商、当前物料名、采购行物料编码和精确版本编码；主单通过明细 `EXISTS` 命中物料或供应商，`total` 仍不重复。筛选先于分页；行列表按到货时间降序、主单 ID 降序、行号升序、行 ID 升序稳定排序。

行列表返回 `PageResult<ProcurementReceiptLineListItem>`。每条只含行及主单身份、物料与供应商展示字段、完整 `currentRound`、完整 `quantities`；不装载 `rounds`、`cases`、`allocations` 等历史或详情数组。单行详情及作废预览的 `purchaseOrderLineNo` 取登记来源 `procurement_order_line.line_no`；`purchaseOrderLineId` 保留为定位采购行的 ID。到货明细只以 `id`／`receiptLineId` 公开识别；到货列表／详情、来料列表／详情、补单候选和入库候选不查询、映射或返回到货 `lineNo`／`receiptLineNo`。数据库 `procurement_receipt_line.line_no` 仍保存登记顺序并用于到货列表和整单详情的稳定排序，不作为公开定位字段。列表只返回实际展示、分组及操作定位需要的字段，不返回基础物料编码、采购行 ID／行号、物料／精确版本 ID 或供应商 ID；基础编码仍参与服务端关键词匹配。当前页批量读取轮次、修订、当前正式分配和实际入退事实，数量口径与详情共用同一投影；需要完整来源或历史时按行 ID 读取详情及独立历史分页。

到货主单列表及作废预览返回主单 `version`；主单、到货行列表及来源详情返回 `void: {reason,createdBy,createdAt}|null`，从主表 `is_voided` 及 `void_reason/voided_by/voided_at` 映射，没有独立作废记录 ID。一般到货列表保留作废登记及其终止轮；待定稿筛选不包含作废行。`/:id/voiding` 独立返回 `ProcurementReceiptVoidingDetail`，包含主单、完整行概况及 `voiding: {canVoid,blockedReason,lines:[{receiptLineId,version,roundId,roundVersion}]}`；`items` 和 `voiding.lines` 始终为同一主单完整集合，不受其他列表分页影响。预览读取同一快照下的主单版本、真实入退和非 cancelled 补单来源引用，不装载分配明细、检验、采购行指标或历史。所有状态下的作废资格均按[到货所有者规则](receipts.md#整单到货登记作废)核验，命令再在锁内检查主单版本、全单集合及行／轮版本，不以预览替代写入校验。

## 工作列表的查询复用

到货行列表与单张到货的检验物料投影共用 `ProcurementReceiptListSource`，基础来源关联、字段清单及身份映射由 `receipt-read.shared` 维护。到货页面按明细服务端分页，前端采购／到货分块只组织当前页；来料主页面按持久[质检主单](#来料质检主单查询)分页，再独立读取到货目录与单到货完整物料，两者不能共用明细 total 或筛选裁剪假设。

到货列表读取处置数量和完整当前轮次，检验物料投影只读取实物剩余、当前轮摘要和当前检验引用。两种读取分别鉴权，只查询自身投影需要的字段；复用来源不增加质检页的仓库详情或历史读取，也不将展示字段作为写命令资格。

## 采购行到货记录

`GET /procurement/purchase-order-lines/:id/receipt-records` 使用采购查看权限，返回 `PurchaseOrderLineReceiptRecordPage`。它只读核对本行 `quantities.receivedQuantity` 的当前来源，不提供到货登记或处置能力。采购行不存在返回 `404 PURCHASE_ORDER_NOT_FOUND`；草稿、已取消和已结束行均可读取，无来源时返回空分页及累计量 `"0"`，不以采购状态过滤已存在的物流事实。

采购详情与该接口共用 `readPurchaseLineMetrics`，按自身到货明细聚合非作废登记的当前修订 T，每次正数量到货只返回一条。普通采购和质量补单各读自己的到货，超量补单不统计物流，接口固定为空分页及累计量 `"0"`。历史分配不可叠加为到货量，也不沿补单 origin_* 追溯链向最初原单累计。

每条返回独立的 `receiptId`、`receiptLineId`、`receiptNo`、`receivedAt`、`supplierBatchCode` 和 `receivedQuantity`，条目数量为该明细当前有效到货量。顶层 `receivedQuantity` 是完整累计量，不受搜索或分页影响；`total` 是筛选后的正数量到货明细数。

请求使用公共 `page/pageSize` 和最长 100 字符的 `keyword`。关键词 trim 后在分页前模糊匹配到货单号、供应商批号或到货明细 ID；按 `receivedAt DESC, receiptLineId DESC` 稳定排序。行存在性、累计投影、筛选计数与当前页在同池只读事务的同一快照内取得，越界页保留页码并返回空 `items`。

## 当前轮次与历史

整单详情 `ProcurementReceiptDetail` 服务于工作台顶部登记信息和左侧明细目录，主单仅返回 `id/receiptNo/purchaseNo/receivedAt/handoverEvidence/remark/void`。它不继承主单列表的供应商集合、版本、待定稿数、创建时间或行数统计；目录行数由完整 `items` 长度取得，作废命令依据仍独立读取专用预览。

`items` 只返回行 ID、物料／供应商／批号检索展示及 `stage`，不返回 `currentRound`、`quantities` 或逐行重复的作废记录。阶段沿用[检验物料投影](#到货物料行检验投影)的剩余实物和人工拒收判定顺序，并优先识别主单或当前轮作废；异常当前轮的 `superseded` 保留原展示兜底。它只表达目录标签，不授予办理资格。查询只读取阶段所需的轮次字段、当前实收修订及本单行范围的真实入退汇总，不读取完整轮次、供应商汇总或列表计数；真实入退口径仍遵守[数量投影](#数量投影)。

单行详情 `ProcurementReceiptLine` 按当前选择读取，包含来源身份、当前版本／修订、当前轮、数量、采购数量对照和当前分配。整单目录和单行详情均不预载七类历史、历史计数、检验事实或库存批次集合。

定稿上下文 `ProcurementReceiptAcceptanceContext` 在单行详情基础上返回 `currentInspectionCase`、`inspectionSourceRoundNo`、`currentInspectionExecution` 和 `originalRemainingPlannedQuantity`，供首次初始化及提交前重核。检验只按当前轮明确引用的 `inspectionId` 定位，通过 Quality public 取得完整事实，来源轮号精确关联；无引用时检验与来源轮号为 `null`、执行量为零，不从最新历史推断。全部依据在同池事务的同一快照内取得，接口本身不授予定稿资格。

质检来源详情走独立 `getInspectionReceiptLine` 查询，不复用 `getReceiptLine`／完整到货详情组装。仅查询来源身份、当前轮与版本、当前实收修订和真实入退汇总，以及当前轮在途办理／当前明确引用的检验；通过 Quality public 批量读取完整检验事实，来源轮号精确取得，不受历史窗口限制。`quantities` 仅含核实总量、真实已入、真实已退及剩余实物，累计事实供录入表单解释范围；不返回授权去向或待执行量。不读取采购归属、正式分配、清单、入退明细、库存批次集合、历史预览与七类计数。详情、连续录入及提交前重核共用此契约；检验历史独立调用 `cases` 分页端点，具体历史 case 仍可用 `/:id` 精确定位。

`receipt_line.current_round_id`是当前整批流程入口，不按历史最大 ID 推断当前轮。单行详情的 `currentRound` 返回轮次、前驱、触发原因、起始未处置量、状态、关联检验及版本。完整轮次链通过 `rounds` 独立分页读取；起始量是历史快照，不能当作已分配后的额外数量池。

详情 allocations 返回当前 finalized 轮的不可变分配，包括已执行完的行；每条返回原 quantity、真实 inboundQuantity/returnedQuantity、remainingQuantity 和 isCurrent。待检／检查／待定稿无当前分配。历史 allocations 单独分页，旧轮原授权与实际执行仍可追溯，但 isCurrent=false，不能据其剩余显示可执行操作。

`rounds/revisions/allocations/cases/returns/inbounds/acceptances` 各自服务端分页，计数只在对应分页响应的 `total` 返回。历史包含完整当时依据；当前分配与清单历史中的同一分配分别用于当前执行和历史追溯，不在默认详情重复返回。库存批号按 `inbounds` 历史中的真实目标查看。历史 case 按最多 100 个 ID 批量公开查询，禁止逐行 N+1。

## 数量投影

- 本次到货核实总量T取`current_receipt_revision_id`。实际I只累计completed/purchased入库明细及匹配正库存流水，匹配物料、版本、批次、单位、状态、数量和来源明细；不用库存余额或办理状态代替库存事实。
- 实际R来自不可变退回交接，人工拒收退回也计入R，只有reason_type=quality才计入qualityReturnedQuantity。
- `unprocessedQuantity=T-I-R`。当前轮尚未finalized时，这一数量整体计入undeterminedQuantity；finalized后只累计当前pending份额。
- `pendingInboundQuantity`取当前inbound分配余量；`approvedQuantity=I+pendingInboundQuantity`，是正式授权履约量，不重新用QC建议封顶。
- `pendingReturnQuantity`含质量、超发、采购终止和人工拒收待退；`returnDueQuantity=R+pendingReturnQuantity`。
- `hasOpenReview`展示当前检验中、待复检或不放行的质量阻断，不能仅由版本不同推断。

以上数量针对有效登记。作废到货的 `receivedQuantity/unprocessedQuantity/undeterminedQuantity/approvedQuantity/returnDueQuantity/pendingInboundQuantity/pendingReturnQuantity` 均为 0、`hasOpenReview=false`，不把作废前 T 改写成零数量 revision。单行概况的 `registeredQuantity` 精确读取 `current_receipt_revision_id` 所指修订的原核实量，作废后保留用于展示，不能作为有效数量；完整证据通过修订历史读取。终止轮 `startingQuantity` 也是历史快照；采购汇总、累计量上限与待办不再计入该登记。实际入退继续以不可变事实为准，作废前提保证该单 I=B=0；采购取消资格仍保留自身历史到货事实，不因数量归零恢复。

采购行物流投影聚合自身到货：当前有效处置余量、非作废当前实收及历史实际入退，不根据超量补单拆分。未定稿剩余量仍归到货本身的采购行。数量仅供展示和物流参考，不作为采购结束或恢复资格。

改量、拒收和撤销不接收采购归属输入。新拒收分配保留数量和采购终止依据；旧分配执行事实继续留在该到货自己的采购行。普通实收更正和撤销拒收不产生分配，回到新的待检轮。

展示查询按同一只读快照组装；到货、清单和实际执行命令仍在锁内检查各自当前事实与资格。采购结束和恢复只改变采购状态，不冻结这些数量。

单行详情及定稿上下文的 `purchaseLineQuantities={plannedQuantity,receivedQuantity}` 返回来源采购行计划量及有效累计到货量，与本批数量处于同一只读快照。累计量复用采购行物流投影，包含本批及已实际入库／退回部分，排除作废登记；只统计直接登记于该采购行的到货，不沿补单来源追溯累计。数量仅供核对，不作为新的办理上限；前端不逐行请求采购详情或对分页记录求和。

定稿上下文的 `originalRemainingPlannedQuantity=max(0,原采购行计划量−当前正式已授权履约量)` 是同一快照中的默认拆分参考。前端默认将计划内部分可入、超出部分待处理，库管可调整；不将采购计划余量作为后台入库上限，也不代替 QC、总量和超建议说明校验。详情不返回采购归属来源集合。

定稿上下文的 `currentInspectionExecution` 分列 `inboundQuantity`、`qualityReturnedQuantity`、`otherReturnedQuantity`，只累计引用当前 inspectionId 的真实入库／退回，不累计历史授权量，也不把所有历史分配装载到内存再筛选；当前无 QC 时三项均为 0。真实质量退回按分配的 quality 原因识别，其他原因归入后一类。全检沿用同一记录的建议按[正式清单数量规则](receipt-acceptance.md#数量与建议)计算，新 QC 不扣旧检验执行事实；实际入库仍消费当前正式授权。

## 来料质检主单查询

以下相对路径统一位于 `/quality/inbound-inspection-orders`，由 Procurement 场景编排。全部 GET 要求 `quality:inbound-inspections:view`，写入要求 `quality:inbound-inspections:manage`；不附加采购或仓储页面权限。完整传输类型以 [incoming-inspection-orders.ts](../../../../../../packages/contracts/src/quality/incoming-inspection-orders.ts) 为准。

| 方法及相对路径 | 输入和返回边界 |
| --- | --- |
| GET `/` | `keyword/stage/supplierId/page/pageSize`；返回主单头 `PageResult`，total 计主单，不附到货树 |
| GET `/targets` | `keyword/page/pageSize`；目标主单远程候选，返回完整主单头和版本 |
| GET `/:orderId` | 精确主单头，包含 ID、单号、备注、创建／修改审计及版本 |
| GET `/:orderId/receipts` | `page/pageSize`；该主单当前完整归属范围的到货头分页，并返回当前 `order` 主单头 |
| GET `/receipt-candidates` | `association=unassigned/assigned/all`，默认 unassigned；`keyword/page/pageSize`；到货头含当前主单引用及版本 |
| GET `/receipts/:receiptId/lines` | `{receipt,items}`，一次返回完整到货轻量检验行，含作废来源，最多 100 行，不返回历史或仓库分配 |
| GET `/receipt-lines/:receiptLineId/location` | `{receiptLineId,receiptId,order}`；order 是真实当前归属引用，未分组为 null |
| POST `/` | `{remark?,receipts:[{receiptId,fromOrderId}],expectedOrders:[{orderId,expectedVersion}]}`；原子创建及初始关联，返回 `{order,affectedOrders,changes}` |
| PATCH `/:orderId` | `{expectedVersion,remark}`；修改备注，返回完整主单头 |
| POST `/associations` | `{changes:[{receiptId,fromOrderId,toOrderId}],expectedOrders:[{orderId,expectedVersion}]}`；显式有界增量，返回 `{affectedOrders,changes}`，不返回全量关系 |

主单与块内到货各自默认 10、最大 100；主单按创建时间及 ID 倒序，到货按 `receipt_id DESC` 稳定分页。到货行沿 `(receipt_id,line_no)` 稳定读取，登记上限 100 保证这一级完整有界；若新增导入或追加入口突破此上限，须先调整为明确的固定分页契约。查看单物料继续使用原质检来源详情、case 精确入口及独立历史分页。

主单关键词覆盖主单号、到货号、采购号、供应商及物料名称／编码／精确版本。子项条件用 `EXISTS` 在 count 与分页前筛选主单，不重复主单。keyword 与 stage／supplierId 分别在主单级核验，可以由同主单不同来源命中；同时指定 stage 和 supplierId 时，二者须由同一来源行满足。阶段依旧读取当前来源及真实剩余，不能用最新历史结论推断。匹配主单后，块内目录和单到货物料仍保留完整归属范围，不继续按主单关键词或阶段裁掉未命中子项。空主单默认可见，只匹配子项的筛选不命中它。主单不持久化阶段或统计缓存。

候选默认包含未分组且未作废到货，不以未检查、剩余正数或尚未处理完作为条件。assigned/all 可返回已分组的作废来源，所有模式都排除未分组作废来源。头部归属和版本只用于建立明确操作草稿，不授予提交资格；关联发生变化时由命令冲突处理，不静默抢占。

按本次受限到货／行 ID 范围批量读取当前轮、检查摘要及真实入退；单张到货不触发逐行详情请求，入退聚合限定到当前来源范围。阶段筛选仍在分页前完成，不能为缩小扫描把资格过滤移到客户端；未限定阶段的主单 count 不读取不必要的物料数量。每个组合读取保持自身同一只读快照，独立层级请求不承诺同一时点；返回归属变化时按真实归属刷新定位，不伪造空目录。

两个新 Quality 表的只读字段登记在 Procurement `infrastructure/queries/` 下；该目录不写或锁 Quality 表。写命令的来源锁、同池事务及版本规则分别由[来源编排](receipts.md#质检分组的来源编排)和[Quality 分组主单](../../quality/docs/incoming-inspection-orders.md)维护。

## 到货物料行检验投影

`GET /quality/inbound-inspection-orders/receipts/:receiptId/lines` 返回 `QualityIncomingInspectionReceiptLines={receipt,items}`，items 为本到货完整的 `ProcurementInboundInspectionLineItem[]`，最多 100 条，不另设物料 total 或行分页。同一行的历次检查不增加物料条目；未检、人工拒收、已处理完及已作废来源都保留其真实行身份。每项只返回行及来源主单身份、物料与供应商展示字段、stage、`currentRound={roundNo,status,triggerType}`、`quantities={unprocessedQuantity}`、当前检验摘要及其来源轮号，不装载历史集合、完整检验事实或历史计数。作废前完成的检验仍由精确 case、来源详情和历史分页读取，已失效的 reviewing 办理不能继续提交。

`currentCase` 优先指向当前轮 inspectionId 明确采用的真实办理；当前没有采用结果时，仅查当前轮的 reviewing 办理；两者皆无时为 null，不以历史最大 ID 充当当前依据。摘要只含 id/status 和 `inspection={id,releaseDecision}|null`，currentCaseRoundNo 为该办理真实发起轮号。isInherited 仅在该结果被当前轮明确采用、且发起轮不同于当前轮时为 true。旧轮可已被替代而结果仍被新轮明确引用；旧轮状态不能代替采用关系，也不授予写入资格。

阶段优先识别到货主单或当前轮作废为 voided；有效来源随后按 unprocessedQuantity=0 派生 completed（本批已处理完），再按当前轮 triggerType=manual_rejection 派生 manual_rejection（人工拒收），其余取当前轮的 uninspected／reviewing／reinspection_required／quality_rejected／awaiting_acceptance／finalized。因此 finalized 只表示仍有剩余实物且非人工拒收的已定稿行。阶段是展示投影，不写回 round.status，也不授予业务资格。主单 stage 筛选使用同一 SQL CASE 在分页前判断存在匹配来源，不把命中后的完整物料集合再次裁剪。

本到货物料按 line_no、id 稳定排序，其身份、摘要、实物数量及到货头在同一只读事务快照中组装。实物剩余取当前修订总量减真实已入、已退；作废来源的有效剩余为零，原登记量仍保留在修订事实。入退聚合与 `readReceiptPhysicalQuantities` 共用有界来源查询片段，已入复用 `inboundFactSelect` 核对匹配正库存流水。当前摘要只读取已登记的 Quality 定位及结论字段，不调用完整检验批量读取，不查询正式分配或逐行请求。数量仅解释当前整批阶段，不改变办理状态或写入资格。

检验历史通过到货行 cases 端点独立分页。`GET /quality/inbound-inspections/:id` 返回 `ProcurementInboundInspectionCaseDetail={receiptLineId,sourceRoundNo,case}`，直接按真实 case ID 定位原办理及来源轮，并经 Quality public 取得该份完整检验事实；不查询当前轮、实物数量或其他历史，不受主单筛选和历史窗口影响。来源行详情继续由 `/quality/inbound-inspections/receipt-lines/:id` 提供，不要求来源当前已分组。

## 入库候选及正式分配

入库候选须是未作废到货的当前 round.finalized 的 inbound allocation、无终止约束、有本轮 acceptance、Quality 完成且明确 released，当前轮／清单／分配的 QC 与 revision 同源一致。普通分配更正可继承同批旧检查，不要求 case 创建于新轮。旧轮失效或整单作废立即从候选消失，不把用户选择静默替换成新分配。

入库候选按到货自身采购单筛选，返回 roundId/roundVersion、行版本、allocationId、acceptanceId、inspectionId、inspectionCaseId、receiptRevisionId 及正式剩余量。inspectionCaseId 指向该分配实际采用检验的 case，不用当前轮 case 替代。采购身份沿 allocation.receipt_line_id 对应的到货采购行解析；分页仍以 allocation 为单位。allocationIds 精确解析已选授权；每次执行重读剩余量，物料用途在分页前过滤，采购关闭不隐藏有效物流。

超量补单候选限定原采购行的未作废到货，须存在当前有效可入余量或真实历史已入库；全待处理、全退回及失效未执行的可入记录不提供资格。返回到货身份、时间、供应商批号、下述五项到货处理数量和 receiptLinkedSupplements。搜索、精确 receiptLineId、计数与分页共用筛选和只读快照，不以原采购关闭排除合法来源。创建命令仍在锁内核验实际事实。

质量补发候选限定请求路径原采购行，按到货明细分页；每份到货只有一条。合法来源为未作废到货上存在当前有效正式质量退回，或真实质量退回历史。返回 receiptLineId、receiptId/receiptNo、receivedAt、supplierBatchCode、下述五项到货处理数量和 receiptLinkedSupplements。当前无质量待退、但历史实际质量已退仍返回候选。资格聚合只认 quality 原因，不由展示的全部原因待退／已退量判断；人工拒收、超发及采购终止退回不单独提供质量补发资格。分配 ID、分配授权量、分配当前性和单笔退回单号不属于该候选契约。

两类候选共用 `PurchaseSupplementReceiptQuantities`，平面返回 `receivedQuantity/pendingInboundQuantity/inboundQuantity/pendingReturnQuantity/returnedQuantity` 五个必填整数字符串。五项均描述该次到货的整体处理情况，口径复用[数量投影](#数量投影)：本次到货量取当前实收修订 T；可入及待退只取当前 finalized 轮的有效分配余量；已入及已退只取该到货全部历史真实执行事实，旧轮未执行授权不累计。待退及已退包含质量、超发、采购终止和人工拒收全部原因，不只代表质量退回。当前页按到货明细 ID 批量复用 `readCurrentRounds` 与 `readReceiptQuantitySummaries`，在候选计数、分页及补单摘要所在的同一只读快照中组装，不逐行查询。五项数量只供核对，不提供新的候选资格、超量判断或累计补购额度，也不作为补单数量上限。

keyword 匹配到货单号、供应商批号，或通过 EXISTS 匹配真实质量退回单号；receiptLineId 精确筛选在计数和分页前生效。按到货时间和明细 ID 倒序稳定排序。质量新建命令在原采购根锁内核验到货资格；已有补单下单只检查固定身份、未作废和采购资格。

两类候选的 receiptLinkedSupplements 按同原到货明细、同补因汇总，包括已取消状态；count 为关联补单明细条数，plannedQuantity 为计划补购量，不表示仓库额度。相关单号通过 originOrderLineId＋originReceiptLineId＋supplementReason 查询，不支持分配级补单反查。

## 所有权与追溯

`scripts/api-data-ownership.mjs` 登记 Procurement 所有的 round 表及展示读取边界。Quality 办理表只开放 `id/receipt_line_id/status/incoming_round_id/source_kind`，结果表只开放 `id/receipt_line_id/case_id/release_decision`，用于当前采用关系、来源轮定位及历史窗口引用；完整办理和检查事实经 Quality public 读取。Inventory 读取限定于正式分配引用及真实执行事实。查询不写、锁外部模块表。供应商与物料当前名称按稳定 ID 读取，历史不因停用或软删除消失；到货行的批次集合与每笔入库历史从已确认 inbound_detail 及匹配正库存流水读取；每笔历史展示目标批次 ID 和批号，不用一个批次代表整条到货。已确认入库的供应商历史名称由 [Inventory 明细快照](../../inventory/docs/database/inventory-ledger-and-inbound.md#9-inbound_detail)提供，不从文本反推供应商身份。
