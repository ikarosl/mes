# 到货、整批处理与实际执行

当前流程遵循[ADR-0015](../../../../../../docs/adr/0015-unified-quality-quantity-semantics.md)：数量草稿 → 明确发起检验 → Quality 记录事实和结论 → 库管核对定稿 → 实际入库／退回。表结构见[数据库](database.md)，数量及采购归属见[正式清单](receipt-acceptance.md)，展示投影见[查询](receipt-queries.md)。

## 到货与数量

确认到货需要已下单且 open 的 new_arrival 采购行、根／行版本、真实交接时间和凭据。按同次实际来货登记，不按采购计划封顶，也不先拆原单和补单。不同来货批次建立不同 receipt_line；本行物料精确版本、供应商及原采购行不因后续操作改变。

首次创建实收 revision 与 uninspected round，line 指向两者；不建分配、不写库存。revision.received_quantity 是**本次到货核实总量 T**，包含这次来货后来已入库和已退回的数量。同原采购行的历次实物到货可按各到货行当前版本汇总；正式履约统计另按原单／补单的分配归属及实际执行计算，不重复计同次实物。不把某行改量当作后来新到货。实际已入 I、实际已退 B，剩余 U=T−I−B；round.starting_quantity 只是新轮创建时 U 的快照，不能累加为实收。

独立实收更正提交 receivedQuantity=T、当前行／轮版本、previousRevisionId、同批确认和原因。T 必须变化且不小于 I+B；追加 revision，旧轮 superseded，新轮 trigger=receipt_correction。U>0 回 uninspected，U=0 直接 finalized，无分配、无零量质检。已拒收批次同样回新草稿，旧拒收只保留历史，需要拒收则重新操作。更正不接收 ownership；采购归属留待定稿或重新拒收时核对。真实新货、丢失或损耗不能冒充实收更正。

## 整批检验与定稿

全检／抽检都判定当前整批剩余实物资格，样本不单独拆成办理范围。首次和复检都需要明确开始动作，不传部分检验覆盖数量。初检推进当前轮 reviewing；复检创建新轮并使旧轮全部剩余分配退出执行资格。Quality 未完成办理同步 superseded；已完成检查作为事实保留，不授予旧轮执行资格。数据库锁不跨现场检查过程持有。

Quality 填方法、合格 G、不合格 F、结论、时间、说明和凭据，实际检查数 N=G+F。来料不填整批 C、剔除量或零数量核实。released 进入 awaiting_acceptance；pending_reinspection 进入 reinspection_required；not_released 进入 quality_rejected。后两者继续阻断普通定稿及入库，允许重新发起整批检验或人工拒收。

库管只引用当前轮关联的明确放行记录，填写本轮剩余实物 C 及分配。本轮核对发现数量变化时，同事务追加 T=I+B+C 的 revision，不因此重复质检；Quality 原申报与 G/F 不覆盖。超建议可入量必须保存 overrideReason，所有分配合计=C。详细公式见[正式清单](receipt-acceptance.md)。

更正正式分配也针对整个剩余 U，追加 acceptance_correction 轮及新清单，可显式继承当前同批有效 QC；旧清单和分配不可变。不能任取历史最高 G，不得恢复已执行数量或丢失补单归属及采购终止约束。

## 人工拒收、撤销及重新办理

库管可在待检、检验中、待复检、不放行、待定稿或已定稿阶段，填写原因拒收本批全部剩余 U>0。新增 manual_rejection 轮，直接 finalized，生成 return/manual_rejection 分配；acceptance_id 和 QC 可空，拒收依据为该轮原因、创建人和时间。旧轮失效，未完成 Quality case 同事务终止；迟到写入直接冲突，不能先新增事实再标作废。

**revoke-rejection** 仅接受当前 manual_rejection/finalized 且 U>0 的批次。必须填原因，替代旧轮并创建 rejection_revocation/uninspected 轮；T 不变，不新增 revision，不直接恢复旧可入分配。后续必须重新质检和定稿。已实际退回不回到新轮，全部已退时不允许撤销。部分人工拒收及已入库退货仍不在本入口。

当前尚未撤销或更正的拒收轮不能直接复检或普通定稿。拒收不是实检不合格，也不表示实际已退；不会生成质量补发资格。

拒收时若整批剩余总量与继承分配不同且涉及已承接补单，需 ownership=[{purchaseOrderLineId,quantity}] 显式核对各既有归属；最多100行、不能重复、合计=U，变化方向及合计不超过整批净差额。总量未变则沿用归属，无须额外输入。新拒收分配保存自己的数量、采购归属和已有 termination_reason，不假借旧清单授权。

## 实际入库与退回

入库一次提交 1～100 条目标明细，可选不同供应商、采购及到货的当前有效 allocation，同一 allocation 允许拆到多个目标；一次确认生成一张入库单。请求携行 version、roundId/roundVersion、allocationId、receiptRevisionId、inspectionId 和本次数量。服务端逐供应商核验有效身份，锁内解析每行确认时供应商名称，并核对当前轮 finalized、disposition=inbound、正常 acceptance、同源当前 revision/QC、有效 released 以及真实剩余。任何明细不合格均整体回滚。

一个 allocation 可分多次实际入库；不拆分或修改分配行。每次创建 inbound_detail 和唯一库存正流水，引用同一个 allocation_id；余量=授权 quantity−真实已入−真实已退。库存流水幂等键以本次 inbound_detail 身份生成，HTTP 同键重试只重放原结果。每条执行明细由库管选择新建或已有的合资格目标库存批次；同一授权本次拆成多明细时按 allocation 合计校验不超余量。到货行不绑定唯一批次，逐笔目标从 inbound_detail 与正库存流水追溯。跨供应商合单不改变各行采购归属和实际退回规则，供应商名称与来源保存边界见 [Inventory](../../inventory/docs/public-contracts.md)。

实际退回一次办理所选 return 分配的全部余量，保存真实交接时间、凭据和数量，不写库存。普通质量／超发／采购终止退回须正常定稿及 QC；manual_rejection 仅可凭当前真实拒收轮和分配办理，允许无正常清单／QC。不能凭客户端声明退回原因豁免依据。采购关闭不阻止已有合法物流，已入和已退不被后续轮次覆盖。

## 事务、权限与防重

按数值ID锁原采购及关联补单根，再锁到货行／当前轮，读取不可变分配及锁内实际事实，经 public 核对 Quality／Inventory。状态、预期行／轮版本在新增事实前校验。更正、复检、拒收、撤销、定稿、入库及退回同源互斥；业务写入、审计和幂等结果同事务。

数量、轮次推进、定稿放行与说明、采购归属及拒收分配计划由本模块 domain 纯规则处理，只接收普通业务数据，不查询数据库或持有连接。infrastructure 在原锁内检查点调用规则，负责按序取事实、校验预期版本、跨模块调用、持久化和审计；不把所有判断提前到事务外，也不为调用一个总规则函数而提前读取后续事实。复检、更正、拒收保留各自条件，共用规则只覆盖实际一致的数量及归属约束。

动作位于 /procurement/receipt-lines/:id/actions/：correct-receipt、start-review、inspect、accept、reject、revoke-rejection、return。更正用 receipts:correct；检验用 Quality review/inspect；定稿／拒收／撤销用 receipts:accept；退回用 receipts:return；入库用 production:inbounds:confirm，每个后端接口独立鉴权。

所有写入要求 Idempotency-Key；版本与 codec 在 application/idempotency 中集中登记。采购入库逐明细目标和结果结构切换为 `procurement.inbound.confirm.v6`，指纹包含每条 detailKey、来源行／轮版本、修订、质检、allocation、数量及目标 mode／clientKey 或 batchId；同键只重放原已确认结果。未知结果冻结原 body/key 重试，不自动换新轮或新ID。成功操作即使后续轮次变化仍只重放原结果。契约与 schema 同版切换，不保留 scope 接口或双写。
