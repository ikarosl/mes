# 成品检验与放行

本文维护成品检验的数量定义、请求语义及定稿数量建议，是这些规则的主要维护位置。来料与成品共用[检验两表](database.md)，来料数量授权及其依据要求由 Procurement 的[正式清单与整批分配](../../procurement/docs/receipt-acceptance.md)维护。[ADR-0015](../../../../../../docs/adr/0015-unified-quality-quantity-semantics.md)保留共同边界、选择理由和取代关系。当前定稿数量使用非阻断建议；成品轮次由 Production 明确开始并固定历史已入基准，Quality 在该轮记录一次完整剩余送检范围。实施不代表用户验收通过，状态见路线图。

Quality 所有 `quality_inspection_record` 是每个任务当前成品轮次剩余送检范围的一次不可变检验事实。Production 所有产出草稿和批准清单，只引用记录；Inventory 根据批准清单办理成品入库。批量和研发共用本规则。

## 数量输入与放行

本节描述当前请求、事实计算及定稿建议。检验事实合法性和明确放行要求继续校验，检验计算量与清单数量的差异不构成保存、送审或批准的门禁。

全检分别填写实际合格数 G 与不合格数 F，服务端形成实际检查总数 N=G+F、送检总数 C=N；不能用产线原申报量减不合格数推算实检合格数。抽检填写实际送检整批总量 C 及本次样本合格 G、不合格 F，服务端形成 N=G+F，要求 0<N<=C。每项及合计均为 0..99999999 的安全整数，普通全检／抽检必须有实际检查数量；零产出使用专用核实方式，G=F=N=C=0 且明确完成核实。

只有明确 `released` 才产生本轮建议量R：全检R=G，抽检R=C-F。契约字段 `releasedQuantity` 表示本轮R；待复检或不放行该值为零，但零值不能代替明确放行资格；样本合格数只描述实际检查结果，不按样本合格率推算整批。没有独立的剔除数量输入，也不自动把不合格数登记为产品报废。

`RecordFinishedInspectionPayload` 与事实响应分开。请求提交 `inspectionMethod/qualifiedQuantity/unqualifiedQuantity/releaseDecision`，抽检必须提交 `coveredQuantity`；全检和零产出可省略该值，显式提交时必须与服务端派生值一致。请求不提交 `inspectedQuantity`。检验时间、结论和凭据仍必填；`inspectedAt` 须为带 `Z` 或显式时区偏移的 ISO 8601 时间，服务端保存所表示的同一时刻。`normalizeFinishedInspectionFacts` 通过 `normalizeInspectionQuantities` 校验并转换为 C/N/F 应用输入（持久化统一 C/G/F）；写入、读取记录和 Production 审批解析通过公开纯规则 `evaluateOutputInspection` 复用同一数量校验及派生公式。

产线三项数量和版本保留为登记当时的来源快照，只供核对；不限制实际检验总数，也不自动改变实测 G/F。例如产线申报 10，质检核实实际有 12：全检填合格 11、不合格 1，形成 C=N=12；抽检填实际送检总数 12、样本合格 4、不合格 1，形成 C=12、N=5。两种情况明确放行后的本次建议量都为 11。管理端提示实物总数与原申报的差异，产线管理员随后修正计划内、计划外及实际报废，主动引用最新检验记录送审。质检不合格数不能自动作为已报废数量。

## 成品来源与统一事实

| 字段 | 含义与约束 |
| --- | --- |
| `id` | BIGINT UNSIGNED 主键 |
| `closeout_id / production_batch_id / finished_round_id` | 非空来源；轮次与结案根组合外键保证同一 Production 来源，一轮最多一份 Quality case |
| `declared_version` | 登记时 Production 根版本，非负，不要求等于后来送审版本 |
| `declared_available_quantity / declared_extra_quantity / declared_scrap_quantity` | 当时产线草稿三项参考快照，不由质检修改 |
| `inspection_method` | full / sampling / zero_confirmation |
| `covered_quantity` C | 实际送检整批总数；全检由 G+F 派生，抽检明确输入 |
| `qualified_quantity` G | 本次实检合格数；N=G+F只读派生 |
| `unqualified_quantity` F | 本次实检不合格数 |
| `release_decision` | released / pending_reinspection / not_released，必须明确选择 |
| `inspected_at` | 真实检验时间 DATETIME |
| `result_note / evidence_reference` | 结论及凭据，各非空且最多 5000 字 |
| `previous_record_id` | 当前根最新检验前驱；组合 FK 保证同根，不覆盖原记录 |
| `created_by / created_at` | 不可变事实操作者 FK users 与创建时间 |

统一结果只持久化C/G/F，N=G+F与建议量R按共同规则派生；成品原申报版本和三项数量移至case。响应/批准证据继续提供N与G的只读视图，不建立重复物理计数。字段/组合FK见[数据库](database.md)。

**当前定稿规则**：Production管理员决定计划内A、计划外E及新增报废。明确放行后的建议只作核对，不以A+E超过建议量或历史已入量超过本次建议为由阻断保存、送审或批准。不新增强制超建议说明或额外审批，原有产出说明、更正原因、物料安排及负责人审批保留。`A<=任务计划`、计划内外各自不低于历史已入量、整数与存储上限继续校验；不合格不自动转报废。

本轮开始时 Production 固定计划内与计划外历史已入 `I₀`，Quality 记录本轮剩余送检量和建议 R。页面比较累计目标 A＋E 与累计建议 `S=I₀计划内＋I₀计划外＋R`，只提示差异。I₀ 是来源历史已入事实快照，不由库存批次余额、当前目标批次或后续领用推算；同一 R 不能随继续入库再次叠加。首次轮 I₀=0。

## 部分已入后的复检与固定范围

生产来源通过明确开始动作建立当前 `production_output_round`，锁定结案根并固定本轮开始时计划内／计划外历史已入基准及剩余范围。`POST /quality/finished-inspections/:batchId/actions/start` 只编排 Production 注册的来源能力，将来源轮次推进 inspecting，不创建 Quality case/record；开始后同源剩余授权立即暂停，旧批准版、旧检验和旧入库事实保留。新的检查覆盖该任务全部剩余送检实物，排除已入和已独立处置报废，不按库存批次拆检验范围。

Quality 只在 Production 准备的当前有效轮次执行 record 时一并创建一份 completed case/record，`finished_round_id` 明确关联来源轮次；同轮重复登记拒绝，必须由来源发起下一轮复检。全检 C=G＋F，抽检独立填写 C 且 0＜G＋F≤C。明确放行的本轮 R 为全检 G、抽检 C−F；固定累计建议 `S=I₀计划内＋I₀计划外＋R`。A、E 是任务累计计划内、计划外目标，比较 A＋E 与 S 只提示，不限制保存、送审或批准。质量不决定类别分配、报废或入库目标，已入下限、任务上限及有效授权由 Production 和 Inventory 各自校验。

本轮待复检或不放行继续阻断正常定稿和入库；新检查完成本身不恢复旧授权。产线管理员核对清单并经负责人批准后，来源按新有效授权恢复剩余执行。纯分配更正可引用仍适用的旧检验依据，不新增一份同轮检查，也不把旧 R 叠加为新检验事实。后续执行不更新该轮 I₀；已入10、剩余全检 G=2/F=0 时本轮 R=2、S=12，历史10件仍引用其原依据。

## 不可变记录与事务

每次新记录代表当前成品轮次的完整剩余送检范围；新轮复检追加记录并关联同来源前驱，只采用当前轮有效依据，不叠加历史检验数量。固定范围、累计建议与开始冻结见上节，不用动态库存余额补造基准。仅调整计划内外划分或减少草稿可用量不要求重复质检；实际送检范围变化仍须新依据，不能借差异提示混用不同批次实物。质量登记不替管理员选择引用；送审须主动引用当前记录。

开始及登记命令分别通过 Production 注册来源能力在同池事务锁定工单→任务→结案根，核对来源版本、当前轮次及草稿资格；开始固定轮次基准，登记只在该轮生成一次检查事实。Quality 读取当前前驱、追加记录、写审计，Production 自身能力推进根版本。开始与登记分别使用 `quality.finished-inspection.start.v1` 与 `quality.finished-inspection.record.v2` 幂等 namespace；登记指纹包含规范化后的 C/N/F、方式、决定、来源版本、时间和去首尾空白的说明／凭据。省略非抽检 C 与明确提交相同派生值形成同一规范化事实；有冲突则拒绝。结果仅含 batchId、inspectionId、version。

Quality 不写 Production 表。Production 送审和最终批准通过 Quality public 当前共享读重新核对联合指纹、最新记录与快照；`readForCloseout` 的锁内读只锁 Quality case/record，Production 轮次基准关联仅供展示，不借该读路径锁定来源轮次。UPDATE／DELETE 触发器禁止改写事实；保留 `(id,closeout_id)` 引用唯一键及 case的 `(closeout_id,id)` 与结果的 `(production_batch_id,id)` 查询索引。

## 迁移保护

`202609200007-quality-finished-inspection-quantities` 删除范围说明和独立剔除量，更新数量 CHECK，不改已执行迁移。上下行在首个永久 DDL 前拒绝任何成品检验、批准版、结案审批记录或根冻结快照，不能把旧的额外剔除量静默解释为新规则，也不能回填虚构范围。仅允许无这些业务事实的开发结构切换；迁移及应用切换期间暂停 Quality、Production 结案和相关 Approval 写入，失败后先核对真实结构再恢复。

`202609210001`再将成品并入统一case/record并切换Production引用外键；来源申报移至case，结果存C/G/F，前驱改为previous_record_id。同样按空业务守卫和统一重建切换，不改旧迁移。
