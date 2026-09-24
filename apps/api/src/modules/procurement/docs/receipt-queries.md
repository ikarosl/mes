# 到货、整批检验待办与入库候选查询

查询端口 `ProcurementReceiptQuery` 由 `MysqlProcurementReceiptQuery` 实现，SQL 位于登记的 `infrastructure/queries/receipt-*.ts`。跨模块展示只读使用 Product 当前物料名称、Inventory 批号和实际入库事实、Quality 办理定位及放行字段；完整检验记录经 Quality public 批量取得。组合详情在同池只读事务的同一快照内组装，不代替写命令锁内资格校验。

## 接口和权限

| GET路径（省略/api） | 权限 | 内容 |
| --- | --- | --- |
| /procurement/receipts、/:id | procurement:receipts:view | 主单分页、明细当前轮次和执行份额 |
| /procurement/receipt-lines/:id | procurement:receipts:view | 单个明细，含receiptId和currentRound |
| /procurement/receipt-order-options[/:id] | procurement:receipts:view | 已下单且可登记新到货的采购候选，不要求采购管理页权限 |
| /procurement/receipt-lines/:id/:historyKind | receipts:view或quality:inbound-inspections:view | rounds/revisions/allocations/cases/returns/inbounds/acceptances独立分页 |
| /quality/inbound-inspections[/:id] | quality:inbound-inspections:view | 待检轮次与真实检验办理联合分页、真实case定位 |
| /quality/inbound-inspections/receipt-lines/:id | quality:inbound-inspections:view | 质检使用的当前来源版本及轮次 |
| /procurement/inbound-releases | production:inbounds:view | 当前合法正式可入范围分页 |
| /procurement/receipt-lines/:id/allocation-candidates | procurement:receipts:view | 原采购行和同次已到货补单候选 |
| /procurement/purchase-order-lines/:id/excess-receipt-candidates | procurement:orders:view | 采购页超量补单的真实到货候选，公共分页及 receiptLineId 精确解析 |

分页默认10、上限100，批量ID最多100且不重复。所有筛选在分页前执行，排序含稳定ID。供应商按具体采购行关联；主单只返回去重供应商集合。供应商筛选使用EXISTS，不使主单或总数重复；详情仍展示该主单全部明细。

## 当前轮次与历史

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

ownershipSources/ownershipSourceQuantity 返回当前或明确继承来源的未消费采购归属和数量。无来源或已全部执行时为空／0；不按最新历史ID猜测。仅拒收在有补单且总量变化时要求这些归属的输入；普通实收更正只改 T。

currentInspectionConsumedQuantity 只累计引用当前 QC 的真实入库／退回量，不累计历史授权量。沿用全检记录时建议 max(0,G−本记录已处置量)，新QC从0计算；实际入库仍消费当前正式授权。

## 检验列表

待检项来自当前uninspected轮次，`taskKind=uninspected`、`case=null`，不伪造case或scope。已发起项`taskKind=case`，返回真实case以及roundId/roundVersion/roundStatus。`coveredQuantity`仅表示发起时申报量，不能解释为质检实测总量或放行数量。

`status`过滤办理状态（或uninspected）；`roundStatus`过滤业务阶段，区分reinspection_required、quality_rejected、awaiting_acceptance等。已替代轮次的历史case仍可查看，但不出现在当前轮阶段待办中；已完成检查不等于允许后续流转。caseType仅表达办理目的，与full/sampling检验方式不同。

关键词匹配到货单号、采购单号、实际供应商、当前物料名、物料编码和精确版本编码。质检页面按来源行供应商筛选，不因同主单另一供应商命中而混入不相关任务。

## 入库候选及正式分配

入库候选须是当前 round.finalized 的 inbound allocation、无终止约束、有本轮 acceptance、Quality 完成且明确 released，当前轮／清单／分配的 QC 与 revision 同源一致。普通分配更正可继承同批旧检查，不要求 case 创建于新轮。旧轮失效立即从候选消失，不把用户选择静默替换成新分配。

候选按实际分配采购单筛选，返回 roundId/roundVersion、行版本、allocationId、acceptanceId、inspectionId、receiptRevisionId 及正式剩余量。allocationIds 一次解析已选分配；同一 allocation 可分多次实际入库，每次重读余量，不能累加历史授权。物料用途／批次状态在分页前过滤；采购关闭不隐藏有效物流。

allocation-candidates返回已正式下单原行及existing_receipt补单；remainingBindingQuantity=0表示已经永久使用过首次绑定资格，不表示历史绑定归属可丢弃。展示候选不能代替确认时的锁内校验。正式清单历史保留核实量、原检查、超建议依据及准确采购分配；不合计历史各版作为当前额度。

超量补单到货候选只返回到货明细 ID、单号、行号、时间、供应商批号及两项数量，不加载质检或正式清单历史。`receivedQuantity` 为该次到货当前修订总量，`unprocessedQuantity=T-I-R`；I 复用 `inboundFactSelect` 核对库存流水，R 来自实际退回事实，同页批量读取而非逐明细查询。分页与数量在同一只读快照组装。候选不按未处置量或当前检验状态过滤，也不以采购关闭排除历史到货；创建及绑定资格仍由对应写命令校验。

## 所有权与追溯

`scripts/api-data-ownership.mjs`登记Procurement所有的round表，以及展示所需Quality incoming_round_id和Inventory正式分配引用。查询不写、锁外部模块表。供应商与物料当前名称按稳定ID读取，历史不因停用或软删除消失；批号直接取receipt_line.batch_id关联item_batch，不另存内部批号快照。已确认库存provider保持原文本，不从它反推供应商身份。
