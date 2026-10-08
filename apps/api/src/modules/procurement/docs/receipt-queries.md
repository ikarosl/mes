# 到货、整批检验待办与入库候选查询

查询端口 `ProcurementReceiptQuery` 由 `MysqlProcurementReceiptQuery` 实现，SQL 位于登记的 `infrastructure/queries/receipt-*.ts`。跨模块展示只读使用 Product 当前物料名称、Inventory 批号和实际入库事实、Quality 办理定位及放行字段；完整检验记录经 Quality public 批量取得。组合详情在同池只读事务的同一快照内组装，不代替写命令锁内资格校验。

## 接口和权限

| GET路径（省略/api） | 权限 | 内容 |
| --- | --- | --- |
| /procurement/receipts、/:id | procurement:receipts:view | 主单分页、明细当前轮次和执行份额 |
| /procurement/receipt-lines | procurement:receipts:view | 跨主单到货行分页，返回当前轮次与数量摘要 |
| /procurement/receipt-lines/:id | procurement:receipts:view | 单个明细，含receiptId/receiptNo、登记原purchaseNo/采购行号和currentRound |
| /procurement/receipt-order-options[/:id] | procurement:receipts:view | 已下单且可登记新到货的采购候选，不要求采购管理页权限 |
| /procurement/receipt-lines/:id/:historyKind | receipts:view或quality:inbound-inspections:view | rounds/revisions/allocations/cases/returns/inbounds/acceptances独立分页 |
| /quality/inbound-inspections[/:id] | quality:inbound-inspections:view | 待检轮次与真实检验办理联合分页、真实case定位 |
| /quality/inbound-inspections/receipt-lines/:id | quality:inbound-inspections:view | 专用质检详情 `ProcurementInboundInspectionDetail`，含来源身份、版本、当前轮、实物范围及当前检验依据 |
| /procurement/inbound-releases | warehouse:inbound:view | 当前合法正式可入范围分页 |
| /procurement/receipt-lines/:id/allocation-candidates | procurement:receipts:view | 原采购行和同次已到货补单的远程搜索与归属解析 |
| /procurement/purchase-order-lines/:id/excess-receipt-candidates | procurement:orders:view | 采购页超量补单的真实到货候选，keyword 搜到货单号／供应商批号，receiptLineId 精确解析 |
| /procurement/purchase-order-lines/:id/quality-replacement-candidates | procurement:orders:view | 采购页质量补发的正式质量退回分配候选，按 allocation 分页；keyword 搜到货单号／供应商批号／实际退回单号，receiptLineId/allocationId 精确解析 |

除 `allocation-candidates` 固定10条搜索窗口外，分页默认10、上限100，批量ID最多100且不重复。所有筛选在窗口截取前执行，排序含稳定ID。供应商按具体采购行关联；主单只返回去重供应商集合。供应商筛选使用EXISTS，不使主单或总数重复；详情仍展示该主单全部明细。

`/procurement/receipts` 的 `items` 和 `total` 始终以到货主单计数；`/procurement/receipt-lines` 的 `items` 和 `total` 始终以到货行计数。两个列表共用 `ReceiptListQueryDto`：`page`、`pageSize`、`keyword`、`awaitingAcceptance=yes`、`purchaseOrderId` 和 `supplierId`。主单的供应商及待定稿筛选以存在匹配行判断，不把多个匹配行扩成多张主单；行列表的供应商筛选只匹配该行原采购行供应商，待定稿只匹配该行当前轮状态。`keyword` 匹配到货单号、采购单号、实际供应商、当前物料名、采购行物料编码和精确版本编码；主单通过明细 `EXISTS` 命中物料或供应商，`total` 仍不重复。筛选先于分页；行列表按到货时间降序、主单 ID 降序、行号升序、行 ID 升序稳定排序。

行列表返回 `PageResult<ProcurementReceiptLineListItem>`。每条只含行及主单身份、物料与供应商展示字段、完整 `currentRound`、完整 `quantities`；不装载 `rounds`、`cases`、`allocations` 等历史或详情数组。行列表、到货详情和单行详情共用的 `purchaseOrderLineNo` 取登记来源 `procurement_order_line.line_no`，与到货行自身的 `lineNo` 分开；`purchaseOrderLineId` 保留为定位采购行的 ID。当前页批量读取轮次、修订、当前正式分配和实际入退事实，数量口径与详情共用同一投影；需要完整来源或历史时按行 ID 读取详情及独立历史分页。

## 当前轮次与历史

质检来源详情走独立 `getInspectionReceiptLine` 查询，不复用 `getReceiptLine`／完整到货详情组装。仅查询来源身份、当前轮与版本、当前实收修订和真实入退汇总，以及当前轮在途办理／当前明确引用的检验；通过 Quality public 批量读取完整检验事实，来源轮号精确取得，不受历史十条窗口限制。`quantities` 仅含核实总量、真实已入、真实已退及剩余实物，累计事实供录入表单解释范围；不返回授权去向或待执行量。不读取采购归属、正式分配、清单、入退明细、库存批次集合、历史预览与七类计数。详情、连续录入及提交前重核共用此契约；检验历史独立调用 `cases` 分页端点，具体历史 case 仍可用 `/:id` 精确定位。下面的完整预览与分配规则仅用于采购到货详情。

`receipt_line.current_round_id`是当前整批流程入口，不使用MAX(scope.id)。`currentRound`返回轮次、前驱、触发原因、起始未处置量、状态、关联检验及版本。`rounds`为最新10轮预览，完整轮次链单独分页读取。起始量是历史快照，不能当作已分配后的额外数量池。

详情 allocations 返回当前 finalized 轮的不可变分配，包括已执行完的行；每条返回原 quantity、真实 inboundQuantity/returnedQuantity、remainingQuantity 和 isCurrent。待检／检查／待定稿无当前分配。历史 allocations 单独分页，旧轮原授权与实际执行仍可追溯，但 isCurrent=false，不能据其剩余显示可执行操作。

revision/acceptance/return/inbound各预览最新10条。case预览包含最新10条、在途办理以及当前轮引用的检验，确保继承的有效结果不会因历史窗口而丢失。case按最多100个ID批量公开查询，禁止逐行N+1。`historyTotals`包含七种历史完整数量；只在用户展开历史时请求完整分页。

## 数量投影

- 本次到货核实总量T取`current_receipt_revision_id`。实际I只累计completed/purchased入库明细及匹配正库存流水，匹配物料、版本、批次、单位、状态、数量和来源明细；不用库存余额或scope状态代替库存事实。
- 实际R来自不可变退回交接，人工拒收退回也计入R，只有reason_type=quality才计入qualityReturnedQuantity。
- `unprocessedQuantity=T-I-R`。当前轮尚未finalized时，这一数量整体计入undeterminedQuantity；finalized后只累计当前pending份额。
- `pendingInboundQuantity`取当前inbound分配余量；`approvedQuantity=I+pendingInboundQuantity`，是正式授权履约量，不重新用QC建议封顶。
- `pendingReturnQuantity`含质量、超发、采购终止和人工拒收待退；`returnDueQuantity=R+pendingReturnQuantity`。
- `hasOpenReview`展示当前检验中、待复检或不放行的质量阻断，不能仅由版本不同推断。

采购行投影累计当前有效剩余分配及历史实际入退。未定稿轮按 source_allocation_round_id 核对既有归属；同总量保留归属，数量不同暂把未判定量记原采购行，补单保留旧归属和暂停标记等待确认。该引用不授予可入量，不能越过已定稿零剩余轮寻找更老份额。展示与关闭共用纯领域归属投影，关闭通过 Inventory public 获取锁内真实执行量。

改量后整批拒收涉及补单时必须显式核对 ownership，新拒收 allocation 保存自己的采购归属和数量，不继续挂旧 acceptance。实际待退／已退按对应 allocation 归属统计。普通实收更正和撤销拒收不产生分配，回到新的待检轮。

关闭命令的归属投影对Procurement自有行、轮次、范围和分配使用锁内当前读；不得混用无锁定位阶段建立的较早快照。展示查询仍按同一只读快照组装，不能代替关闭时的当前事实核验。

`ownershipSources/ownershipSourceQuantity` 返回当前或明确继承来源的未消费采购归属和数量。无来源或已全部执行时为空／0；不按最新历史ID猜测。定稿草稿用其中正数量且非原采购行的归属初始化保留补单份额；原采购行由 `purchaseOrderLineId` 标识，`originalRemainingPlannedQuantity=max(0,原采购行计划量−当前正式已授权履约量)` 在同一详情快照中提供本批可入初值的采购计划参考。两项均只作显示和输入初值，不代替候选 ID 解析或确认时的锁内资格校验。仅拒收在有补单且总量变化时要求这些归属的输入；普通实收更正只改 T。

`currentInspectionExecution` 分列 `inboundQuantity`、`qualityReturnedQuantity`、`otherReturnedQuantity`，只累计引用当前 inspectionId 的真实入库／退回，不累计历史授权量；当前无 QC 时三项均为 0。真实质量退回按分配的 quality 原因识别，其他原因归入后一类。全检沿用同一记录的建议按[正式清单数量规则](receipt-acceptance.md#数量与建议)计算，新 QC 不扣旧检验执行事实；实际入库仍消费当前正式授权。

## 检验列表

待检项来自当前uninspected轮次，`taskKind=uninspected`、`case=null`，不伪造case或scope。已发起项`taskKind=case`，返回真实case；`roundId/roundVersion/roundStatus`仍描述发起轮，旧轮的`roundStatus`显示superseded，`sourceRoundNo`给出真实发起轮序号。两类列表项同时返回到货行的`currentRound={id,roundNo,status,inspectionId}`和持久`receiptLineNo`；按到货行 ID 单查也返回单号与原采购单号，供质量权限下精确定位来源。`coveredQuantity`仅表示发起时申报量，不能解释为质检实测总量或放行数量。

`isCurrentlyAdopted`仅当真实case的`inspection.id`等于当前轮`inspectionId`时为true；`isInherited`还要求该case发起轮与当前轮不同。当前轮未完成的case和待检占位均不是已采用结果。完成case所在的旧轮可为superseded，同时该结果仍被新轮明确引用；旧轮状态不能代替当前采用关系，更不能授予旧轮写入资格。

`status`过滤办理状态（或uninspected）；`roundStatus`保留发起轮业务阶段口径；`currentRoundStatus`按当前整批轮状态过滤，并且只返回当前轮任务或当前明确采用的case。两种阶段筛选都在count及分页前执行，历史case不会因为到货行的当前状态而混入当前阶段。`caseType`仅表达办理目的，与full/sampling检验方式不同。按真实case ID精确读取始终定位原case，`taskKey`与`total`不因继承重复。

关键词匹配到货单号、采购单号、实际供应商、当前物料名、物料编码和精确版本编码。质检页面按来源行供应商筛选，不因同主单另一供应商命中而混入不相关任务。

## 入库候选及正式分配

入库候选须是当前 round.finalized 的 inbound allocation、无终止约束、有本轮 acceptance、Quality 完成且明确 released，当前轮／清单／分配的 QC 与 revision 同源一致。普通分配更正可继承同批旧检查，不要求 case 创建于新轮。旧轮失效立即从候选消失，不把用户选择静默替换成新分配。

候选按实际分配采购单筛选，返回 roundId/roundVersion、行版本、allocationId、acceptanceId、inspectionId、inspectionCaseId、receiptRevisionId 及正式剩余量。`inspectionCaseId` 取该分配 acceptance 采用的 `inspectionId` 所属真实检验 case，和 `receiptLineId` 一起用于精确定位历史检验记录；不得用到货行当前轮 case 代替。`receiptLineNo`、`receiptReceivedAt` 和 `receiptPurchaseNo` 标识原到货，既有 `purchaseNo` 标识 allocation 实际归属采购单；两者可能不同。分页总数与切页单位仍为 allocation，当前页按到货分块时不得宣称包含整张到货单的所有分配。allocationIds 一次解析已选分配；同一 allocation 可分多次实际入库，每次重读余量，不能累加历史授权。物料用途在分页前过滤；目标批次由库管在确认时选择并由 Inventory 锁内检查，采购关闭不隐藏有效物流。

`allocation-candidates` 仅返回已正式下单的原采购行及关联本到货行的 `existing_receipt` 补单，仍要求采购行处于 open/closed。`keyword`（最多100字符）按采购单号模糊搜索，按原采购行优先、采购行 ID 降序稳定排列，固定只返回前10条；`hasMore` 表示还有匹配项，继续缩小关键词即可定位，新正式下单补单可在弹窗内重新搜索取得。该接口不接受 page/pageSize。`includeIds` 是逗号分隔的采购行 ID，最多100个、不可重复；它在同一到货行候选资格内精确解析，不受搜索窗口限制，也不扩大候选范围。

响应为 `{items,resolved,hasMore}`；`items` 是至多10条搜索窗口，`resolved` 只包含已显式请求且仍合格的 `includeIds`，按请求 ID 顺序返回，不占用搜索窗口。原采购行、保留归属和数量初值由到货行详情提供；候选只负责搜索与已选 ID 当前资格解析，不重复计算整批归属或采购计划余量。搜索窗口缺少已选 ID 不能证明其失效，只有显式解析后缺失才能如此判断。`remainingBindingQuantity=0` 表示已经永久使用过首次绑定资格，不表示历史绑定归属可丢弃。展示候选不能代替确认时的锁内校验。正式清单历史保留核实量、原检查、超建议依据及准确采购分配；不合计历史各版作为当前额度。

超量补单到货候选只返回到货明细 ID、单号、行号、时间、供应商批号及两项数量，不加载质检或正式清单历史。`receivedQuantity` 为该次到货当前修订总量，`unprocessedQuantity=T-I-R`；I 复用 `inboundFactSelect` 核对库存流水，R 来自实际退回事实，同页批量读取而非逐明细查询。keyword 在分页前匹配到货单号或供应商批号，COUNT 与数据使用同一筛选及只读快照。候选不按未处置量或当前检验状态过滤，也不以采购关闭排除历史到货；创建及绑定资格仍由对应写命令校验。

质量补发候选限定到货登记来源采购行，正式分配的履约采购行可与来源不同，分别返回身份和采购单号。只返回 disposition=return、return_reason=quality，且仍属当前 finalized 轮或已有真实质量退回的分配；复检／更正后失效且未实际退回的历史分配不列入。返回到货单、持久到货行号、分配量、当前待退量、实际已退量与退回单号，关联补单按主单状态汇总数量与计划量；已关联单号经采购单列表的 originOrderLineId＋originAllocationId 在分页前精确筛选。keyword 在分页前匹配到货单号、供应商批号或真实退回单号，COUNT 与数据使用相同条件。候选查询与分页在同一只读事务组装，只作展示，创建及下单仍逐行锁内重核资格。排列按到货时间、到货行 ID、分配 ID 倒序稳定排序。

## 所有权与追溯

`scripts/api-data-ownership.mjs`登记Procurement所有的round表，以及展示所需Quality incoming_round_id和Inventory正式分配引用。查询不写、锁外部模块表。供应商与物料当前名称按稳定ID读取，历史不因停用或软删除消失；到货行的批次集合与每笔入库历史从已确认 inbound_detail 及匹配正库存流水读取；每笔历史展示目标批次 ID 和批号，不用一个批次代表整条到货。已确认入库的供应商历史名称由 [Inventory 明细快照](../../inventory/docs/database/inventory-ledger-and-inbound.md#9-inbound_detail)提供，不从文本反推供应商身份。
