# 到货、处理轮次与供应商退回表

本页是七张 Procurement 到货链表的字段与物理约束所有者。数量含义、换轮和正式授权规则见[正式清单](../receipt-acceptance.md)，命令资格、锁序与作废见[到货办理](../receipts.md)，其他采购表及迁移入口见[采购数据库](../database.md)。Quality 检查、来料分组和 Inventory 真实入库均由各自模块所有。

以下表均为 InnoDB、`utf8mb4_0900_ai_ci`，`id` 为 `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY`，所有引用 ID 为 `BIGINT UNSIGNED`。除显式标明 NULL 的字段外均为 NOT NULL；外键使用默认 RESTRICT，所列外键均有支撑索引。创建审计为 `created_by`（FK users.id）及 `created_at DATETIME DEFAULT CURRENT_TIMESTAMP`；可变审计另含 `updated_by`（FK users.id）、`updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`、`version INT DEFAULT 0 CHECK(version>=0)`。时间与事实规则遵守[数据库公共约定](../../../../../../../docs/database-conventions.md)。

## procurement_receipt

一次真实到货登记主单；原登记身份冻结，仅允许一次整单作废。

| 字段 | 类型／约束 | 语义 |
| --- | --- | --- |
| receipt_no | VARCHAR(100)，永久唯一 | 服务端到货编号 |
| purchase_order_id | ID，FK procurement_order(id) | 本次到货所属采购根 |
| received_at | DATETIME | 实际交接时间 |
| handover_evidence | TEXT，CHECK trim 后非空 | 原交接凭据 |
| remark | TEXT NULL | 登记说明 |
| is_voided | TINYINT DEFAULT 0，CHECK IN(0,1) | 一次性整单作废标记 |
| void_reason | TEXT NULL | 作废时 trim 后 1～2000 字，未作废为空 |
| voided_by / voided_at | ID NULL，FK users(id)／DATETIME NULL | 作废人及时间，与作废原因成组 |
| 创建／可变审计 | 见本页公共字段 | 主单版本供整单作废并发核对 |

唯一键为 `receipt_no`、`(id,purchase_order_id)`；业务索引为 `(purchase_order_id,received_at,id)`，作废人和修改人另有支撑索引。CHECK 要求有效登记三项作废字段均空，作废登记三项均非空且原因合法。`trg_procurement_receipt_void_update` 冻结 `id/receipt_no/purchase_order_id/received_at/handover_evidence/remark/created_by/created_at`，文本按字节比较；只允许 `is_voided:0→1` 且 `version=旧值+1`。已作废主单不可再次修改，DELETE 触发器禁止删除。

## procurement_receipt_line

同次到货的精确物料身份与可变当前办理指针；不保存库存批次或分组缓存。

| 字段 | 类型／约束 | 语义 |
| --- | --- | --- |
| receipt_id / purchase_order_id | ID | 同一到货及采购根 |
| purchase_order_line_id | ID | 固定来源采购行，供应商沿该行取得 |
| line_no | INT，CHECK >0 | 单内登记顺序，仅供稳定排序，公开定位使用 id |
| item_id / material_variant_id | ID | 与原采购行相同的物料及精确版本 |
| supplier_batch_code | VARCHAR(100) NULL | 供应商提供的原批号，不是库存批次编号 |
| current_receipt_revision_id / current_round_id | ID NULL | 当前实收版本／当前办理轮；同源组合 FK |
| over_receipt_note | TEXT NULL | 登记时的超到货说明，不是授权或补单依据 |
| 创建／可变审计 | 见本页公共字段 | 来源行并发版本 |

唯一键为 `(receipt_id,line_no)`、`(id,item_id,material_variant_id)`、`(id,purchase_order_line_id)`；业务索引为 `(purchase_order_line_id,id)`。组合外键分别为 `(receipt_id,purchase_order_id)→procurement_receipt(id,purchase_order_id)`、`(purchase_order_line_id,purchase_order_id)→procurement_order_line(id,purchase_order_id)`、`(purchase_order_line_id,item_id,material_variant_id)→procurement_order_line(id,item_id,material_variant_id)`；两个当前指针各与本行 id 组合引用 revision／round 的 `(id,receipt_line_id)`。保留的 `fk_procurement_receipt_line_batch(item_id,material_variant_id)` 只是索引名，不存在到库存批次的外键或 batch_id 列。

UPDATE 身份触发器冻结 receipt_id、purchase_order_id、purchase_order_line_id、item_id、material_variant_id 和 supplier_batch_code；登记顺序、说明及创建依据由命令保留，当前指针和可变审计按命令推进。同源冗余 ID 不构成第二份来源；供应商名称按采购行供应商身份读取。

## procurement_receipt_revision

| 字段 | 类型／约束 | 语义 |
| --- | --- | --- |
| receipt_line_id | ID，FK procurement_receipt_line(id) | 本次到货明细 |
| revision_no | INT，CHECK >0 | 本明细实收版本号 |
| previous_revision_id | ID NULL | 前版本；与 receipt_line_id 组合自 FK |
| received_quantity | INT，CHECK 0..99999999 | 本次到货核实总量 T，包含后来真实已入和已退 |
| reason | TEXT，CHECK trim 后非空 | 登记或计数更正依据 |
| physical_identity_confirmed | TINYINT，CHECK =1 | 已确认仍为同次实物，不以更正登记新货 |
| 创建审计 | 见本页公共字段 | 不可变数量事实 |

唯一键 `(receipt_line_id,revision_no)`、`(id,receipt_line_id)` 同时支持按来源读取及组合引用。前版本 FK 为 `(previous_revision_id,receipt_line_id)→本表(id,receipt_line_id)`。UPDATE／DELETE 触发器禁止改写；版本链创建与当前指针推进同事务，不覆盖旧总量。

## procurement_receipt_round

| 字段 | 类型／约束 | 语义 |
| --- | --- | --- |
| receipt_line_id | ID，FK procurement_receipt_line(id) | 所属到货明细 |
| round_no | INT，CHECK >0 | 本明细办理轮号 |
| previous_round_id | ID NULL | 前一轮，同到货组合自 FK |
| source_allocation_round_id | ID NULL | 继承采购终止约束的来源轮，同到货组合自 FK；不授予执行资格 |
| trigger_type | VARCHAR(30)，CHECK 封闭值域 | receipt／receipt_correction／review／acceptance_correction／manual_rejection／rejection_revocation／receipt_void |
| receipt_revision_id | ID | 建轮时的实收版本，与 receipt_line_id 组合 FK revision |
| starting_quantity | INT，CHECK 0..99999999 | 建轮时尚未实际处置量快照 |
| status | VARCHAR(30)，CHECK 封闭值域 | uninspected／reviewing／reinspection_required／quality_rejected／awaiting_acceptance／finalized／superseded／voided |
| inspection_id | ID NULL | 本轮明确引用的检验结果，与 receipt_line_id 组合 FK quality_inspection_record |
| reason | TEXT，CHECK trim 后非空 | 本次建轮原因 |
| 创建／可变审计 | 见本页公共字段 | 当前办理资格的乐观版本 |

唯一键为 `(id,receipt_line_id)`、`(receipt_line_id,round_no)`；列表索引为 `(status,created_at,id)`，其余组合引用有各自支撑索引。轮次资格、起始依据保留和状态转换由来源命令在锁内校验，不能把 CHECK 值域误当状态转换校验。当前轮以明细指针定位，不按最大 ID 推断；来源轮继承及零剩余时的清空规则由[正式清单](../receipt-acceptance.md#整批换轮与继承)维护。

## procurement_receipt_acceptance

| 字段 | 类型／约束 | 语义 |
| --- | --- | --- |
| receipt_line_id / round_id | ID | 所属到货及定稿轮；组合 FK round(id,receipt_line_id) |
| inspection_record_id | ID | 明确引用的放行结果，与 receipt_line_id 组合 FK quality_inspection_record |
| before_receipt_revision_id / after_receipt_revision_id | ID | 核对前后实收版本，分别与 receipt_line_id 组合 FK revision |
| confirmed_scope_quantity | INT，CHECK 0..99999999 | 本轮核实的尚未处置实物量 C |
| previous_acceptance_id | ID NULL | 同到货前清单，组合自 FK |
| override_reason | TEXT NULL，非空时 CHECK trim 后非空 | 数量差异／超建议依据 |
| remark | TEXT，CHECK trim 后非空 | 本次定稿说明 |
| 创建审计 | 见本页公共字段 | 库管确认依据 |

唯一键为 `round_id`、`(id,receipt_line_id)`、`(id,receipt_line_id,round_id)`；历史索引为 `(receipt_line_id,id)`，receipt_line_id 另有到明细的 FK。每轮至多一份，UPDATE／DELETE 触发器禁止改写。CHECK 容许 C=0 不代表开放重复零量定稿；当前命令资格仍遵守[实际执行](../receipt-acceptance.md#实际执行)及[定稿规则](../receipts.md#整批检验与定稿)。

## procurement_receipt_allocation

| 字段 | 类型／约束 | 语义 |
| --- | --- | --- |
| receipt_line_id / round_id | ID | 执行授权来源，组合 FK round(id,receipt_line_id) |
| acceptance_id | ID NULL | 正常分配依据；与 receipt_line_id、round_id 组合 FK acceptance |
| line_no | INT，CHECK >0 | 本轮分配顺序 |
| disposition | VARCHAR(30)，CHECK inbound／return／pending | 正式去向，不表达实际完成状态 |
| quantity | INT，CHECK 1..99999999 | 本分配授权数量 |
| return_reason | VARCHAR(30) NULL | return 必填 quality／excess／procurement_termination／manual_rejection；其他去向为空 |
| termination_reason | TEXT NULL | 非空时须 trim 后非空，且为采购终止或人工拒收退回 |
| remark | TEXT NULL | 分配说明 |
| 创建审计 | 见本页公共字段 | 不可变授权事实 |

唯一键为 `(round_id,line_no)`、`(id,receipt_line_id)`；历史索引为 `(receipt_line_id,id)`。CHECK 保证 acceptance 为空仅限 `return/manual_rejection`，普通分配必须有 acceptance 且不能使用 manual_rejection 原因；业务事务还须核对当前真实拒收轮。UPDATE／DELETE 触发器禁止改写，不存已入、已退或剩余额；采购归属沿 receipt_line 固定解析，不保存 purchase_order_line_id。正常分配合计=C、当前资格及终止约束继承由[正式清单](../receipt-acceptance.md)维护。

## procurement_supplier_return

| 字段 | 类型／约束 | 语义 |
| --- | --- | --- |
| return_no | VARCHAR(100)，永久唯一 | 按 supplier_return 类型生成实际退回单号 |
| receipt_line_id / allocation_id | ID | 实际交接来源；组合 FK allocation(id,receipt_line_id) |
| receipt_revision_id | ID | 当时实收版本，与 receipt_line_id 组合 FK revision |
| inspection_id | ID NULL | 当时检验依据，与 receipt_line_id 组合 FK quality_inspection_record |
| reason_type | VARCHAR(30)，CHECK 封闭值域 | quality／excess／procurement_termination／manual_rejection |
| returned_quantity | INT，CHECK 1..99999999 | 本次真实退回量，不代表不合格数或库存出库 |
| returned_at | DATETIME | 真实交接时间 |
| handover_evidence | TEXT，CHECK trim 后非空 | 真实退回凭据 |
| remark | TEXT NULL | 交接说明 |
| 创建审计 | 见本页公共字段 | 不可变实际退回事实 |

唯一键为 `return_no`、`(id,receipt_line_id)`、`allocation_id`；历史索引为 `(receipt_line_id,returned_at,id)`。CHECK 要求非 manual_rejection 时 inspection_id 非空；人工拒收是否免 QC 仍由当前轮及分配真实类型验证，不能仅信任请求原因。一个分配一次交接全部余量，UPDATE／DELETE 触发器禁止改写。本表不写库存，实际已入由 Inventory 公开事实读取。
