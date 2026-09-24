# 来料正式清单与整批采购分配

本文维护来料核实数量、建议公式、正式授权及整批采购分配，是这些规则的主要维护位置。库管负责来料实物核对、定稿和采购分配；Quality 独占检查事实；Inventory 独占库存事实。成品数量建议与定稿规则由[Quality 成品专题](../../quality/docs/finished-inspections.md)维护，数量差异不构成定稿门禁，也不自动继承来料的强制超建议说明；其清单仍由产线管理员核对并经负责人批准。[ADR-0015](../../../../../../docs/adr/0015-unified-quality-quantity-semantics.md)保留共同边界、选择理由和取代关系。

## 六表职责

| 表 | 唯一职责 | 是否随实际入退改写 |
| --- | --- | --- |
| procurement_receipt | 一次真实到货交接主单 | 否 |
| procurement_receipt_line | 精确物料到货身份、原采购行、当前 revision/round 指针及批次绑定 | 仅指针、版本等聚合状态 |
| procurement_receipt_revision | 本次到货核实总量 T 的不可变版本 | 否，数量变化追加版本 |
| procurement_receipt_round | 整批剩余实物的办理资格与前后轮关联 | 办理推进状态；换轮使旧轮 superseded |
| procurement_receipt_acceptance | 库管引用 QC 后确认的 C、前后实收版本和偏离依据 | 否，更正追加新轮、新清单 |
| procurement_receipt_allocation | 本轮正式去向、采购归属和授权数量，或人工拒收分配 | 否，实际执行引用它 |

revision 是数量事实，round 是办理资格，acceptance 是普通定稿依据，allocation 是具体执行授权。删除 procurement_receipt_scope；原 acceptance_line 被 allocation 替代，不再复制一份可变范围树。实际供应商退回与库存明细是各自的事实表，不计入这六张核心办理表。

## 整批换轮与继承

line.current_round_id 指向唯一当前轮，previous_round_id 记录前一轮。更正实收、复检、重新定稿、拒收或撤销拒收创建新轮；旧轮 superseded，旧分配保持原值，剩余额度因旧轮失效而不可执行。已入已退仍引用旧分配，不能修改或重复计算为当前资格。

round.starting_quantity=创建当时 T−I−B，只是起始剩余快照。round.receipt_revision_id 指向起始数量版本；库管同轮定稿校准后的版本由 acceptance.after_receipt_revision_id 和 line.current_receipt_revision_id 表达。

source_allocation_round_id 仅定位新轮需要核对的既有采购归属／采购终止依据。它从当前有分配的已定稿轮，或未完成轮已记录的来源继承；已定稿无分配的零剩余轮清空来源，不能越过它复活更老的分配。这个指针不授予入库资格，不按所有历史分配或最大ID猜可用量。

独立改量一律为 receipt_correction；已拒收批次正剩余也回 uninspected，想拒收就再次决定。rejection_revocation 只撤销当前拒收并使剩余回待检，不改 T、不新增 revision。两者均保留原拒收事实，不能直接恢复原可入额度。

## 正式清单及分配字段

acceptance 不可变，每轮至多一份。id/receipt_line_id/round_id 为同源身份；inspection_record_id 必须是当前明确放行记录；before_receipt_revision_id/after_receipt_revision_id 固化核对前后版本；confirmed_scope_quantity 是本轮尚未处置核实量 C；previous_acceptance_id 连接同到货前版；override_reason 保存偏离检查建议的依据；remark/created_by/at 固化核对说明及责任人。

allocation 不可变字段：

| 字段 | 含义／条件 |
| --- | --- |
| id / receipt_line_id / round_id / line_no | 执行授权身份；同轮行号唯一，同到货组合 FK |
| acceptance_id | 正常分配必填；人工拒收为 NULL，依据直接来自 manual_rejection 轮 |
| purchase_order_line_id | 原采购行或承接本次实物的补单；普通待处理／待退允许待明确归属 |
| disposition / quantity | inbound、return、pending；quantity 为正整数，正常分配合计=C |
| return_reason | return 必填 quality/excess/procurement_termination/manual_rejection；其他去向为空 |
| termination_reason | 已指定采购终止的约束；拒收／撤销／复检不能顺带清除；仅终止或人工拒收退回允许 |
| remark / created_by / created_at | 分配说明及不可变审计 |

数据库用组合 FK 保证普通分配与 acceptance 同到货同轮，CHECK 限定 acceptance 为空仅限 manual_rejection 退回；不以空关联制造普通可入依据。触发器拒绝更新、删除授权行。不存 scope 状态、父子节点、quality_partition、已入／已退累计或剩余额。

## 数量与建议

本次到货核实总量 T=实际已入 I+实际已退 B+本轮核实剩余 C。定稿改变 T 时同事务追加 revision；数量不变不新增。QC 保留原 G/F/D。

| 项目 | 全检 | 抽检 |
| --- | --- | --- |
| 检查数 N | G+F，代表实际全检总数 | G+F，只代表样本 |
| 首次建议可入量 L | G | C−F，要求 N≤C 且 F≤C |
| 沿用同一记录更正分配 | max(0,G−该记录已实际处置量) | 以本次剩余 C 计算 C−F |
| 数量差异 | N≠C 或 C≠申报剩余时提示核对 | 样本 N 小于整批正常；N>C 或 F>C 提示异常 |
| 正式可入 A | 超 L 需 override_reason；始终 A≤C | 同左；无有效建议时必须说明异常 |

C 与申报量 D 不同、全检 N 与 C 不同，只提示核对，不强制重复相同检验。抽检 N>C 或 F>C 时不展示负数或有效建议，须保存异常依据。同一 QC 的已实际处置量包含已入库和已实际退回，不能只扣其中一类。

这是一套来料数量建议与责任规则，非统计推断。库管可按已批准规则承担数量例外，不改 Quality 结果；Quality 结论仍必须 released，待复检／不放行不能被数量说明绕过。全部去向合计=C，不合格不会自动变成实际退回或报废。不得重新累计历史清单获得授权。

例如整批核实 C=500，抽检 50 件（G=48、F=2）并明确放行，建议 L=498；是否按建议形成正式可入分配由库管核对。若需转全检则先发起整批复检；决定整批退回 500 必须保留正式退回分配或人工拒收依据，不能把样本 F=2 直接写成整批不合格 500。实际退回仍独立交接，未明确放行不能凭样本公式定为可入。

## 原单、补单和退回示例

原采购100，本次到货120，全检118合格、2不合格，库管核实C120，可分别定稿：

| 方案 | 原单可入 | 承接补单可入 | 质量待退 | 超发待退 |
| --- | --- | --- | --- | --- |
| 超入 | 118 | 0 | 2 | 0 |
| 补单承接 | 100 | 18 | 2 | 0 |
| 退超发 | 100 | 0 | 2 | 18 |

同次实物先统一检验，再分配采购归属；补单 existing_receipt 承接18，不再虚构第二次到货或质检。首次绑定必须已下单、可入量=补单计划；未生效先留 pending。已绑定补单不能再次承接其他实物；换轮核对保留剩余归属，数量调整不得把未变化实物改挂他单。已有采购终止量必须保留终止待退，只有实收纠错造成的净减少可据实减少。

quality_replacement 是独立 new_arrival 补发，引用当前有效质量退回分配，或者该分配已经发生的真实质量退回及供应商约定；不要求先关闭原单或先实际退回，不重复登记同次实物。人工拒收不产生此资格。

m1/x1 独立到货、误将 10 定稿为 11、部分入库后更正、撤销拒收及零剩余轮的完整数量链见[整批处理数据示例](receipt-round-examples.md)。

## 实际执行

只有当前 finalized 轮正常 inbound 分配能入库。实际 inbound_detail 直接引用 allocation_id，可分多次消费同一分配；采购关闭不改变已有资格。退回直接引用 return 分配并一次交接全部余量。余量由授权数量减真实入退事实计算，当前轮以外显示历史未执行量但不得执行。

锁到货聚合后重新计算事实，并校验行／轮版本、明确 QC 及正式授权。旧客户端选择不会被自动换为新分配；未知结果按同键重试。实际 I 来自 Inventory public 的已完成入库及匹配正流水，B 来自真实退回交接，不能用 allocation 或 round 状态代替库存事实。
