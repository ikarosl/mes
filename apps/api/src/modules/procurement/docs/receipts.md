# 到货登记与仓库处理

到货登记、独立检验报告、采购补单和仓库实际入库分别保存各自事实。到货不登记数量，不发起检查或处理轮次；检验报告的结论及数量不决定入库或补单资格。选择理由见 [ADR-0028](../../../../../../docs/adr/0028-independent-warehouse-receipt-and-inspection.md)，表结构见[到货表](database/receipts.md)。

## 到货登记

确认到货要求采购主单已下单、采购行 open 且 fulfillment_mode=new_arrival，核对根与行 version、有效供应商及物料身份。一次选择 1 至 100 条不重复采购行，保存交接时间、选填交接凭据和备注；供应商批号的暂不使用及保留边界见[到货明细字段](database/receipts.md#procurement_receipt_line)。同一次实际来货登记一张到货单，不同来货另建登记。登记不写库存、不保存实收数量、修订、授权或检验轮次。

到货明细的原采购行、物料精确版本、供应商批号及创建事实固定。供应商沿原采购主单取得；不同入库组织方式、补单和质检分组不转移该归属。采购行结束阻止新增到货，已有有效到货仍可检验、入库或登记说明。

## 实际入库与其他处理说明

### 实际入库

`POST /procurement/purchase-inbounds/actions/confirm` 一次提交 1 至 100 条实际入库明细，可混合多个到货、采购单和供应商。同一来源可拆到多个目标，同次输入共享来源行 version；每个来源在命令中只推进一次版本。每条 quantity 为 1～99999999 的实际正整数数量，target 必填；新批次相同 clientKey 共批时必须物料精确身份及单位一致。目标规则归 [Inventory](../../inventory/docs/public-contracts.md#采购和终检成品实际入库)。

实际入库不受采购计划量、检验样本量或检验结果封顶。Procurement 在锁内复核未作废、未结束入库及同源身份，Inventory 在同池事务复核物料与目标批次资格并生成一张入库单、逐笔明细及唯一正库存流水。历史已入只从这些真实流水累计；没有可入授权量或未入余量，也不从说明推算实际退回。输入与结果以[入库契约](../../../../../../packages/contracts/src/procurement/inbounds.ts)为准；确认不接收说明或零入库明细。

### 人工结束与恢复入库

到货明细的 `inbound_closed` 由人员主动切换，默认未结束。结束后退出入库来源候选并禁止新增实际入库，恢复后重新作为候选；它不表示数量已收齐、检查完成、采购结束或全部实物已处理，不自动改变其他业务状态。

`POST /procurement/receipt-lines/:id/inbound-status` 使用当前行版本设置开关。切换只要求记录存在、权限和并发版本有效，不以到货作废、采购状态、入库量、检查报告或补单为前置条件。作废行仍可切换，但恢复开关不解除作废对入库的限制。检验、补单、说明和原有库存事实不受该开关影响。命令沿来源锁序与入库互斥，改变时推进一次行版本；同值请求不产生业务变更。仅保存当前开关和通用行审计，成功变更写通用操作日志，不设专用状态历史、结束人或结束时间。

### 独立其他处理说明

`POST /procurement/receipt-lines/:id/handlings` 在指定到货行追加其他处理说明，仅接收必填 otherHandlingNote，trim 后 1～2000 字，不提交数量、目标、入库引用或来源版本。命令锁定并核验有效、未作废的到货后独立追加，与检验、补单和实际入库均无前置关系，不推进到货行 version。说明与成功审计、幂等结果在同一事务提交，返回不可变 ReceiptHandlingItem；输入与历史形状见[到货契约](../../../../../../packages/contracts/src/procurement/receipts.ts)。

说明只保留人工文字，不登记退回数量或追踪线下执行，不建立库存单据、批次或流水。无需补购时也可独立记录赠送说明；有实际入库时仍通过实际入库入口登记数量。说明不自动结束或恢复采购，不证明实物已全部完成处置。

新说明的 inbound_id 恒为 NULL。已有历史说明的入库关联保留原事实，不重挂或清空。说明更正通过追加新说明保留完整原文，历史读取不受后续检验或入库影响。

## 整单作废

`POST /procurement/receipts/:id/actions/void` 作废整张到货登记，要求主单 version、原因以及完整、无重复明细的 receiptLineId/version 集合。所有行均无真实采购入库且没有非 cancelled 补单依赖才可作废。已保存检验或说明不单独阻断，作废保留全部历史，不制造库存冲销、退回或零数量事实。

非取消补单按 origin_receipt_line_id 引用阻断作废，取消后保留历史引用但解除依赖。作废不自动取消补单或改变采购状态；采购取消继续检查历史自身到货。作废后不恢复，所有新增检验报告、入库、说明及新补单来源写入拒绝，历史报告仍可打印。质检分组关系保留，已有作废关系仍可解除或移组。

## 独立检验与分组

`POST /procurement/receipt-lines/:id/inspect` 在锁内核验有效到货，调用 Quality 公开命令登记或修订报告。报告保存不推进到货版本，不影响仓库输入资格。数量、当前报告与修订校验、打印头快照由 [Quality](../../quality/docs/unified-inspection-model.md)所有。

[已停用分组](../../quality/docs/incoming-inspection-orders.md)的保留关系命令先按数值 ID 升序锁全部受影响到货主单，再调用 Quality 公开能力锁定并维护质检主单与关系。未分组且已作废的到货不能首次关联，已有作废关系允许解除或转移。分组不锁采购根或到货行，不影响后续来源资格和版本。

## 事务、权限与幂等

来源写命令先按数值顺序锁原采购及关联补单根，再锁受影响到货主单、到货行；作废在同样锁序中核验全单版本和依赖。入库在这些来源锁后复核 Product、供应商及 Inventory 目标批次；同源入库、说明、作废、报告与补单办理互斥；实际入库与作废核验预期版本，独立说明和报告只核验有效来源。业务写入、库存流水、成功审计与 HTTP 幂等结果原子提交。

| POST 路径（省略 /api/procurement） | 独立动作权限                        |
| ---------------------------------- | ----------------------------------- |
| /receipts/actions/confirm          | warehouse:receipts:confirm          |
| /receipts/:id/actions/void         | warehouse:receipts:void             |
| /receipt-lines/:id/handlings       | warehouse:receipts:handle           |
| /receipt-lines/:id/inbound-status  | warehouse:receipts:handle           |
| /receipt-lines/:id/inspect         | quality:inbound-inspections:inspect |
| /purchase-inbounds/actions/confirm | warehouse:inbound:confirm-purchase  |

登记采购候选、到货列表及到货行的入库／说明历史要求 warehouse:receipts:view；入库管理的来源候选及入库单历史要求 warehouse:inbound:view。质量来源与报告读取要求 quality:inbound-inspections:view。页面权限不替代每个写接口鉴权。

所有写入要求 Idempotency-Key，完整规范化输入与语义 path 参与指纹；实际入库、作废及入库开关包含各自提交版本，独立说明不携带来源版本。同键同请求重放首次成功结果，后续来源变化不重新执行；错误及未知结果恢复遵守[幂等契约](../../../../docs/idempotency.md)。scope 以[应用代码](../application/idempotency/procurement-idempotency-scopes.contract.ts)为准。
