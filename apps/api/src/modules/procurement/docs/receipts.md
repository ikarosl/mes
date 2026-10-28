# 到货、整批处理与实际执行

当前流程遵循[ADR-0015](../../../../../../docs/adr/0015-unified-quality-quantity-semantics.md)：数量草稿 → 明确发起检验 → Quality 记录事实和结论 → 库管核对定稿 → 实际入库／退回。采购来源固定取到货明细，补单来源解耦见[ADR-0023](../../../../../../docs/adr/0023-supplement-source-and-receipt-ownership.md)。表结构见[数据库](database.md)，数量与去向见[正式清单](receipt-acceptance.md)，展示投影见[查询](receipt-queries.md)。

## 到货与数量

确认到货需要已下单且 open 的 new_arrival 采购行、根／行版本、真实交接时间和凭据。按同次实际来货登记，不按采购计划封顶，也不先拆原单和补单。不同来货批次建立不同 receipt_line；本行物料精确版本、供应商及原采购行不因后续操作改变。

首次登记初始化主单的创建／修改审计及 `version=0`，`is_voided=0` 且作废原因／人／时间均为空。创建实收 revision 与 uninspected round，line 指向两者；不建分配、不写库存。revision.received_quantity 是**本次到货核实总量 T**，包含这次来货后来已入库和已退回的数量。同原采购行的有效到货按各到货行当前版本汇总，作废登记的 T 只保留历史；采购统计按该到货自身采购行及实际执行计算，不重复计同次实物或分走给超量补单。不把某行改量当作后来新到货。实际已入 I、实际已退 B，剩余 U=T−I−B；round.starting_quantity 只是新轮创建时 U 的快照，不能累加为实收。

独立实收更正提交 receivedQuantity=T、当前行／轮版本、previousRevisionId、同批确认和原因。T 必须变化且不小于 I+B；追加 revision，旧轮 superseded，新轮 trigger=receipt_correction。U>0 回 uninspected，U=0 直接 finalized，无分配、无零量质检。已拒收批次同样回新草稿，旧拒收只保留历史，需要拒收则重新操作。更正不接收采购归属；来源固定取到货明细，不因重办改变。真实新货、丢失或损耗不能冒充实收更正。

## 整单到货登记作废

`POST /procurement/receipts/:id/actions/void` 作废整张到货登记，不提供逐行作废。请求为 `{version,reason,lines:[{receiptLineId,version,roundId,roundVersion}]}`；顶层 `version` 为当前到货主单版本，原因 trim 后 1～2000 字，`lines` 必须与锁内整单完整行集合及各行、当前轮版本完全相同。主单过期、漏行、重复、行或轮次变化均在新增事实前拒绝。详情的 `voiding` 仅提供同一只读快照下的预览，提交仍在业务事务内复核。

整单所有行必须真实已入 I=0 且真实已退 B=0，且不存在非 `cancelled` 关联补单依赖。依赖为 `origin_receipt_line_id` 引用，处理轮变化不改变原到货来源依赖；`draft/ordered/completed` 补单均阻断，已取消补单的历史引用不阻断。用户须先人工处理关联补单，作废命令不自动取消补单或修改历史来源。已做 QC、已定稿或已人工拒收不单独阻断作废；任一行已有真实执行则整单拒绝，实际实物处置继续按拒收或退回办理。

成功时以 `id+version+is_voided=0` 原子更新到货主单，写入 `is_voided=1`、`void_reason/voided_by/voided_at` 和最近修改人，主单版本递增一次；原登记字段及创建审计保持冻结，成功审计保存作废状态与版本的前后值、原因及终止轮引用。每行旧当前轮 `superseded`，追加 `receipt_void/voided` 终止轮并推进该行版本；原 revision 的 T、清单、allocation 及已完成 Quality 结果保留，不改 T、不制造退回或库存冲销。终止轮记录作废时 U 的历史快照，不保留来源分配指针、不产生任何新执行授权。经 `QualityInboundCommand.supersedeReceiptCases` 在同池事务终止该行全部历史轮次仍为 reviewing 的办理，迟到检验在新增结果前拒绝。

作废登记保留主单、行及各类历史查询；有效到货及待处理／可入／待退数量退出统计，待定稿、未分组来料候选、入库和补单候选不再列入。已有质检分组关系保留，分组目录展示来源作废及历史，仍可解除或移组。所有后续行写命令、新补单引用均拒绝，没有恢复或反作废动作。作废不自动结束或恢复采购；采购取消仍检查自身历史到货，不因作废重新获得资格。新增到货继续要求采购行 open。

## 质检分组的来源编排

来料[分组主单](../../quality/docs/incoming-inspection-orders.md)属于 Quality；本模块只编排真实到货来源与事务。关系命令先按数值 ID 升序锁全部受影响 `procurement_receipt` 主表并核对存在性；未分组且已作废的来源不得首次关联，已有作废关系可以解除或转移。随后调用同池活动事务中的 `QualityIncomingInspectionOrderCommand`，由 Quality 按数值 ID 升序锁受影响既存主单，核对预期版本和真实原归属并更新自己的关系。新建初始关系同样遵守此顺序。

分组不锁采购根、到货明细、处理轮次或 case，不先锁质检主单再回头锁到货。原整单作废仍按采购根、到货行、到货主表、轮次／检查的顺序办理，不自动修改分组，因此不形成反向锁依赖。备注修改只锁 Quality 主单。分组变化不推进任何来源版本，不替代后续检查或仓储命令的资格校验。

一次关系命令的到货 ID 并集最多 100；初次登记的到货整单明细也限制 1～100，其他导入或追加入口不得绕过该完整轻量读取边界。HTTP 场景入口及返回见[查询与命令契约](receipt-queries.md#来料质检主单查询)，新建、备注和关联写入独立要求 `quality:inbound-inspections:manage`，成功审计、关系、版本和幂等结果原子提交。

## 整批检验与定稿

全检／抽检都判定当前整批剩余实物资格，样本不单独拆成办理范围。首次和复检都需要明确开始动作，不传部分检验覆盖数量。初检推进当前轮 reviewing；复检创建新轮并使旧轮全部剩余分配退出执行资格。Quality 未完成办理同步 superseded；已完成检查作为事实保留，不授予旧轮执行资格。数据库锁不跨现场检查过程持有。

`start-review` 仅接收行／轮版本、轮次 ID 和发起原因，不接收 `caseType`。Procurement 在锁内按当前轮状态确定办理类型：`uninspected` 沿当前轮发起 `initial`，其他符合复检资格的阶段建立新轮并发起 `reinspection`。不再提供人工选择的“检验更正”分类；已有分类及检查事实继续保留，历史值约束见 [Quality 数据库](../../quality/docs/database.md#检验办理-quality_inspection_case)。

Quality 填方法、合格 G、不合格 F、结论、时间、说明和凭据，实际检查数 N=G+F。来料不填整批 C、剔除量或零数量核实。released 进入 awaiting_acceptance；pending_reinspection 进入 reinspection_required；not_released 进入 quality_rejected。后两者继续阻断普通定稿及入库，允许重新发起整批检验或人工拒收。

库管只引用当前轮关联的明确放行记录，填写本轮剩余实物 C 及分配。本轮核对发现数量变化时，同事务追加 T=I+B+C 的 revision，不因此重复质检；Quality 原申报与 G/F 不覆盖。超建议可入量必须保存 overrideReason，所有分配合计=C。详细公式见[正式清单](receipt-acceptance.md)。

更正正式分配也针对整个剩余 U，追加 acceptance_correction 轮及新清单，可显式继承当前同批有效 QC；旧清单和分配不可变。不能任取历史最高 G，不得恢复已执行数量或丢失采购终止约束；历史补单来源保留，不因更正阻断其继续办理。

## 人工拒收、撤销及重新办理

库管可在待检、检验中、待复检、不放行、待定稿或已定稿阶段，填写原因拒收本批全部剩余 U>0。新增 manual_rejection 轮，直接 finalized，生成 return/manual_rejection 分配；acceptance_id 和 QC 可空，拒收依据为该轮原因、创建人和时间。旧轮失效，未完成 Quality case 同事务终止；迟到写入直接冲突，不能先新增事实再标作废。

**revoke-rejection** 仅接受当前 manual_rejection/finalized 且 U>0 的批次。必须填原因，替代旧轮并创建 rejection_revocation/uninspected 轮；T 不变，不新增 revision，不直接恢复旧可入分配。后续必须重新质检和定稿。已实际退回不回到新轮，全部已退时不允许撤销。部分人工拒收及已入库退货仍不在本入口。

当前尚未撤销或更正的拒收轮不能直接复检或普通定稿。拒收不是实检不合格，也不表示实际已退；不会生成质量补发资格。

拒收不接受采购归属输入。新拒收分配合计为 U，保留既有 termination_reason；只有真实数量净减少允许相应减少采购终止范围，不能借拒收、撤销或复检清除终止约束。新分配使用自己的数量和办理依据，不假借旧清单授权。

## 实际入库与退回

入库一次提交 1～100 条目标明细，可选不同供应商、采购及到货的当前有效 allocation，同一 allocation 允许拆到多个目标；一次确认生成一张入库单。请求携行 version、roundId/roundVersion、allocationId、receiptRevisionId、inspectionId 和本次数量。服务端逐供应商核验有效身份，锁内解析每行确认时供应商名称，并核对当前轮 finalized、disposition=inbound、正常 acceptance、同源当前 revision/QC、有效 released 以及真实剩余。任何明细不合格均整体回滚。

一个 allocation 可分多次实际入库；不拆分或修改分配行。每次创建 inbound_detail 和唯一库存正流水，引用同一个 allocation_id；余量=授权 quantity−真实已入−真实已退。库存流水幂等键以本次 inbound_detail 身份生成，HTTP 同键重试只重放原结果。每条执行明细由库管选择新建或已有的合资格目标库存批次；同一授权本次拆成多明细时按 allocation 合计校验不超余量。到货行不绑定唯一批次，逐笔目标从 inbound_detail 与正库存流水追溯。跨供应商合单不改变各行采购归属和实际退回规则，供应商名称与来源保存边界见 [Inventory](../../inventory/docs/public-contracts.md)。

实际退回一次办理所选 return 分配的全部余量，保存真实交接时间、凭据和数量，不写库存。普通质量／超发／采购终止退回须正常定稿及 QC；manual_rejection 仅可凭当前真实拒收轮和分配办理，允许无正常清单／QC。不能凭客户端声明退回原因豁免依据。采购关闭不阻止已有合法物流，已入和已退不被后续轮次覆盖。

## 事务、权限与防重

按数值ID锁原采购及关联补单根，再锁到货行／当前轮，读取不可变分配及锁内实际事实，经 public 核对 Quality／Inventory。整单作废在锁齐到货行后锁定主单、核对主单版本和未作废标记，再锁各当前轮；其他同源行命令在原锁内复核主表作废标记。状态、主单及预期行／轮版本在新增事实前校验。更正、复检、拒收、撤销、定稿、入库、退回及整单作废同源互斥；业务写入、审计和幂等结果同事务。

数量、轮次推进、定稿放行与说明、采购终止约束及拒收分配计划由本模块 domain 纯规则处理，只接收普通业务数据，不查询数据库或持有连接。infrastructure 在原锁内检查点调用规则，负责按序取事实、校验预期版本、跨模块调用、持久化和审计；不把所有判断提前到事务外，也不为调用一个总规则函数而提前读取后续事实。复检、更正、拒收保留各自条件，共用规则只覆盖实际一致的数量及终止约束。

| POST 路径（省略 `/api/procurement`） | 独立动作权限 |
| --- | --- |
| `/receipts/actions/confirm` | `warehouse:receipts:confirm` |
| `/receipts/:id/actions/void` | `warehouse:receipts:void` |
| `/receipt-lines/:id/actions/correct-receipt` | `warehouse:receipts:correct` |
| `/receipt-lines/:id/actions/start-review` | `quality:inbound-inspections:review` |
| `/receipt-lines/:id/actions/inspect` | `quality:inbound-inspections:inspect` |
| `/receipt-lines/:id/actions/accept`、`reject`、`revoke-rejection` | `warehouse:receipts:accept` |
| `/receipt-lines/:id/actions/return` | `warehouse:receipts:return` |
| `/purchase-inbounds/actions/confirm` | `warehouse:inbound:confirm-purchase` |

到货页的登记采购候选和候选详情仅要求 `warehouse:receipts:view`，办理不依赖采购管理页权限；入库页的正式可入候选、归批候选和历史读取统一要求 `warehouse:inbound:view`。查看与动作分别鉴权，目录父子关系不授予后端子权限，完整规则见 [Identity 权限目录](../../identity/docs/database.md#14-permissions)。这些仓储职责的接口继续由 Procurement 校验来源并编排，Quality 与 Inventory 保持各自事实所有权。

检验发起使用 `procurement.receipt.review.v3`，指纹包含到货明细 ID、行版本、轮次 ID／版本和规范化原因，不含服务端派生的办理类型。旧客户端携带 `caseType` 时按未知字段拒绝；换版保留既有办理与检查事实，客户端须结束旧意图并刷新，不将旧请求自动转换为新意图。

所有写入要求 Idempotency-Key；版本与 codec 在 application/idempotency 中集中登记。整单作废使用 `procurement.receipt.void.v3`，指纹包含 receipt ID、主单版本、原因及整单行／轮版本，结果为 `{receiptId,version}`，其中 `version` 是作废后的主单版本。采购入库使用 `procurement.inbound.confirm.v8`，指纹包含备注、各明细的来源行／轮版本、修订、质检、allocation、数量及目标 mode／clientKey 或 batchId；结果按真实 inboundDetailId、batchId 和 transactionId 关联来源行及授权，同键只重放原已确认结果。未知结果冻结原 body/key 重试，不自动换新轮或新ID。成功操作即使后续轮次变化仍只重放原结果。版本切换遵守[平台幂等规则](../../../../docs/idempotency.md#13-scope-版本与开发重置)。
