# 来料整批处理数据示例

本文模拟当前六表结构中“m1、x1各到货10，m1错误定稿11后整批更正”。规则见[正式清单](receipt-acceptance.md)与[到货命令](receipts.md)，长期决策见[ADR-0015](../../../../../../docs/adr/0015-unified-quality-quantity-semantics.md)。这些是解释当前模型的虚构示例，不是数据库实测或验收结果。

表中RC1、L1、V1、W1等是便于阅读的示意ID，真实主键仍为数值ID。省略常规审计、版本及凭据列，不表示删除这些字段。主场景假设所有纠错完成前都没有实际入库、退回；不存在补单或采购终止限制。

## 1. 数量和身份分别由谁记录

| 字段或数量 | 含义 | 是否随办理覆盖 |
| --- | --- | --- |
| receipt_line.id | 同次来料中某精确版本、某实际批次的稳定身份 | 不因更正/复检创建新到货行 |
| revision.received_quantity，记为T | 本次到货核实总量；不是剩余量 | 旧版本不覆盖，新增版本并切换line当前指针 |
| round.starting_quantity | 本轮创建时尚未实际处置的数量快照 | 本轮内不回写 |
| acceptance.confirmed_scope_quantity，记为C | 库管定稿时核实的本轮未处置总量 | 正式清单不覆盖，更正形成新清单 |
| G/F | Quality检查合格/不合格事实；抽检时仅指样本 | 不被库管分配改写 |
| I/B | 全历史实际已入库/已退回数量 | 来自实际执行事实，不能用定稿代替 |
| U | 当前未处置量，T−I−B | 查询计算，不将多版草稿或定稿累加 |

新轮创建时：`starting_quantity = 当时T − 当时I − 当时B`。它既不是当前本次到货核实总量，也不是当前可入余量。

定稿校准时：`新T = 当时I + 当时B + 本次C`。全部分配数量合计必须等于C；可入、待退和待处理互不重叠。

revision没有检验状态，也没有trigger_type字段；变更前后通过previous_revision_id及reason追溯。round保存trigger_type和status，两者不能在revision中重复建一套。

## 2. 首次登记m1、x1各10

`procurement_receipt`：

| id | receipt_no | purchase_order_id（展示单号） |
| --- | --- | --- |
| RC1 | RC20260922 | PO1（po20260922） |

`procurement_receipt_line`：

| id | receipt_id | 物料/精确版本 | purchase_order_line_id | current_receipt_revision_id | current_round_id |
| --- | --- | --- | --- | --- | --- |
| L1 | RC1 | m1指定版本 | POL1 | V1 | W1 |
| L2 | RC1 | x1指定版本 | POL2 | VX1 | WX1 |

line不再额外保存一份可独立修改的“数量10”；界面数量沿当前revision读取。采购单号也不是物料身份，必须关联到具体采购行。

`procurement_receipt_revision`：

| id | receipt_line_id | revision_no | previous_revision_id | received_quantity | reason |
| --- | --- | --- | --- | --- | --- |
| V1 | L1 | 1 | 空 | 10 | 首次实收确认 |
| VX1 | L2 | 1 | 空 | 10 | 首次实收确认 |

`procurement_receipt_round`：

| id | receipt_line_id | round_no | previous_round_id | receipt_revision_id | starting_quantity | trigger_type | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| W1 | L1 | 1 | 空 | V1 | 10 | receipt | uninspected |
| WX1 | L2 | 1 | 空 | VX1 | 10 | receipt | uninspected |

两条到货行各自有实收版本和轮次。此时没有正常定稿、分配、库存流水。以后只操作L1，L2/VX1/WX1保持上述状态。

## 3. 检查m1：全检G9/F1、明确放行

发起检验时，W1由uninspected更新为reviewing，并创建Quality办理K1；不是每次改状态都新增一条round。

`quality_inspection_case`（关键关联）：

| id | receipt_line_id | incoming_round_id | receipt_revision_id | declared_quantity | 完成结果后的status |
| --- | --- | --- | --- | --- | --- |
| K1 | L1 | W1 | V1 | 10 | completed |

`quality_inspection_record`：

| id | case_id | receipt_line_id | receipt_revision_id | inspection_method | qualified_quantity | unqualified_quantity | release_decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | K1 | L1 | V1 | full | 9 | 1 | released |

W1改为awaiting_acceptance，inspection_id=Q1，starting_quantity仍为10。只有明确允许继续，才能走普通定稿；单有G/F不够。

## 4. 错误定稿：把整批核实成11

准确描述这次误操作是：库管填写C=11，分配可入9、质量待退1、超发待退1。三个份额是互不重叠的11件；不能把其中一个待退1同时理解成已经包含在另一个份额内。

Quality仍为G9/F1，共检查10。系统提示核实11与原报10、全检10不一致，库管填写核对说明后确认。按当前已允许的数量纠偏规则，这种人为误确认可以进入系统。此例可入9没有超过质检建议9，不属于“超建议可入量”，但数量差异仍需核对。

追加 `procurement_receipt_revision`：

| id | receipt_line_id | revision_no | previous_revision_id | received_quantity | reason |
| --- | --- | --- | --- | --- | --- |
| V2 | L1 | 2 | V1 | 11 | 库管本次核对说明（后来发现录错） |

新增 `procurement_receipt_acceptance`：

| id | receipt_line_id | round_id | inspection_record_id | before_receipt_revision_id | after_receipt_revision_id | confirmed_scope_quantity | previous_acceptance_id |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | L1 | W1 | Q1 | V1 | V2 | 11 | 空 |

`procurement_receipt_allocation`（本轮不可变执行分配）：

| id | receipt_line_id | round_id | acceptance_id | purchase_order_line_id | disposition | quantity | return_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | L1 | W1 | A1 | POL1 | inbound | 9 | 空 |
| D2 | L1 | W1 | A1 | POL1 | return | 1 | quality |
| D3 | L1 | W1 | A1 | POL1 | return | 1 | excess |

本步之后：L1.current_receipt_revision_id=V2，current_round_id=W1；W1.status=finalized，starting_quantity=10，receipt_revision_id仍为创建时的V1；A1.C=11；当前T=11、I=0、B=0、U=11。

这里同时出现10与11是有意保留的前后事实：启动时登记10，库管后来核实为11。当前数量应读line指向的V2，不能误读W1的起始修订，也不能用starting_quantity覆盖A1.C。

D1/D2/D3就是直接执行授权，不再创建派生scope。

## 5. 发现录错：更正本次到货核实总量为10，重新待检

本例选择独立“更正实收并重新检查”；若只更正正式分配，可沿用同批有效 QC，见[到货命令](receipts.md#整批检验与定稿)。此时I=B=0。

追加revision：

| id | receipt_line_id | revision_no | previous_revision_id | received_quantity | reason |
| --- | --- | --- | --- | --- | --- |
| V3 | L1 | 3 | V2 | 10 | 上次误将实收核对成11，现场复核实际10 |

替换处理轮次：

| id | receipt_line_id | round_no | previous_round_id | receipt_revision_id | starting_quantity | trigger_type | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| W1 | L1 | 1 | 空 | V1 | 10 | receipt | superseded |
| W2 | L1 | 2 | W1 | V3 | 10 | receipt_correction | uninspected |

L1当前指针切到V3/W2。A1、D1/D2/D3、Q1全部保留原内容。当前模型不逐条修改旧分配状态，但旧轮已失效，旧分配不能再执行。

此时不存在有效可入分配：当前未处置量10，当前可入0，等待新检验和新定稿。不能因为Q1仍有G9就沿用D1入库；Q1是历史检查事实，不能单独决定当前资格。

W1变为superseded，D1/D2/D3不修改；执行资格由当前轮及正式依据决定。

## 6. 第二次检查并正确定稿

W2由uninspected到reviewing；新建办理K2，关联W2/V3，申报快照10。保存新检查Q2，全检G9/F1，结论released，K2完成，W2到awaiting_acceptance。Q2不覆盖Q1。

库管这次确认C=10，形成：

| acceptance.id | round_id | inspection_record_id | before_revision | after_revision | confirmed_scope_quantity | previous_acceptance_id |
| --- | --- | --- | --- | --- | --- | --- |
| A2 | W2 | Q2 | V3 | V3 | 10 | A1 |

| allocation.id | receipt_line_id | round_id | acceptance_id | purchase_order_line_id | disposition | quantity | return_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D4 | L1 | W2 | A2 | POL1 | inbound | 9 | 空 |
| D5 | L1 | W2 | A2 | POL1 | return | 1 | quality |

T没有再次改变，因此不创建V4；W2改为finalized，starting_quantity仍为10，inspection_id=Q2。L1指向V3/W2。

现在当前实收10、当前可入9、当前待退1。A1和A2合计21没有业务意义，不能累计历史定稿计算实收或可入额度。

## 7. 最后执行入库及退回

实际入库明细引用D4，确认入库9；Inventory保存真实入库及正流水，首次生成并绑定内部批次。实际供应商退回记录引用D5，交接退回1。实际执行不再拆scope。

| 本批事实 | 数量 |
| --- | --- |
| 当前本次到货核实总量T（V3） | 10 |
| 实际已入I | 9 |
| 实际已退B | 1 |
| 当前未处置U | 0 |
| D4可入剩余 | 0 |
| D5待退剩余 | 0 |

V3仍然记录10，A2仍记录C10，D4/D5仍记录授权9/1；实际执行不覆盖这些历史数量。物料x1仍然实收10、待检10，没有被m1的操作一起推进。

## 8. 如果更正前已经执行过一部分

仍沿用步骤4的错误T11，但假设已真实入库4、尚未退回：

- 更正本次到货核实总量为T10，创建新revision；新轮starting_quantity=10−4−0=6。
- 原已入4保留原A1/D1/Q1及真实流水引用，旧轮剩余可入/待退资格一并失效。
- 新检验针对剩余6；假设新全检G5/F1，库管确认C6，分配可入5、待退1。
- 最新本次到货核实总量仍是10，不能把新轮6或新定稿6当成整批总到货量。

更正后T不能小于真实I+B。金额、收费或补购安排不在本例推算；已有补单采购归属在换轮时仍须按原规则核对。

## 9. 误拒收后重新办理

假设当前T11、I=B=0，管理员人工拒收，创建W3（manual_rejection/finalized）及D6（return/manual_rejection，quantity11，acceptance_id为空）；拒收原因／人／时间在W3，旧轮失效。

| 接下来的操作 | revision | 新round | 新分配 |
| --- | --- | --- | --- |
| 数量没错，仅撤销拒收 | 不新增，T仍11 | W4，previous=W3，rejection_revocation/uninspected，starting_quantity11 | 无，等待重新质检和定稿 |
| 发现其实只有10，更正实收 | 新版本T10 | W4，previous=W3，receipt_correction/uninspected，starting_quantity10 | 无，旧拒收效力结束 |
| 更正后仍决定拒收10 | T不变 | W5，previous=W4，manual_rejection/finalized，starting_quantity10 | 新return/manual_rejection10 |

上表前两行为互斥路径；W3/D6始终保留历史，不能修改为新的数量，也不直接恢复旧可入。若已有真实退回，则新轮只处理未退的剩余，T不能小于I+B；全部已退不能单纯撤销。采购终止约束不因这些操作解除。

## 10. 继承依据及实际执行约束

round.source_allocation_round_id只定位需核对的既有采购归属／终止分配：从有分配的已定稿前轮取该轮ID，否则沿前轮既有来源；已定稿且无分配的零剩余轮清空来源，不能跳过零轮恢复更老分配。它不授予执行资格。

同一allocation可分多次真实入库，inbound_detail直接引用它，不设allocation唯一消费约束；每次实际明细／库存流水独立，当前行／轮锁、余量核对和幂等防止超入。实际退回仍为一个待退分配一次全部交接。当前轮以外的分配即便显示历史未执行量也不可使用。

数量版本、起始快照、定稿C、授权量与真实入退分别记录，不跨版本／轮次累加。开发迁移按成对文件执行；验证与待验收项集中在[路线图](../../../../../../docs/roadmap.md)。
