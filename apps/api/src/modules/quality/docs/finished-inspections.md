# 成品检验与放行

本文维护成品检验的 G/F 事实、请求语义及放行资格。来料与成品共用[检验两表](database.md)，来料整批 C、数量授权及建议由 Procurement 的[正式清单与整批分配](../../procurement/docs/receipt-acceptance.md)维护。[ADR-0019](../../../../../../docs/adr/0019-finished-inspection-measurement-simplification.md)精确取代旧成品 C/R/S 裁决；[ADR-0015](../../../../../../docs/adr/0015-unified-quality-quantity-semantics.md)保留其余共同边界与来料规则。成品轮次由 Production 明确开始并固定历史已入基准，Quality 在该轮留存一次检查事实。实施、运行验证和用户验收状态见[路线图](../../../../../../docs/roadmap.md)。

Quality 所有 `quality_inspection_record` 是每个任务当前成品轮次剩余送检范围的一次不可变检验事实。Production 所有产出草稿和批准清单，只引用记录；Inventory 根据批准清单办理成品入库。批量和研发共用本规则。

## 数量输入与放行

本节描述当前请求、事实计算及放行。Quality 不核实整批数量，不计算可入量或产出数量差异；Production 负责最终清单及其有限的定稿提示。

全检与抽检都只填写本次实际检查的合格数 G、不合格数 F，服务端自动形成实际检查总数 N=G+F。每项及合计均为 0..99999999 的安全整数，普通全检／抽检必须 N>0；不按产线原申报量推算 G，也不以抽检样本推断整批合格数或整批差异。零产出只使用专用 `zero_confirmation`，G=F=N=0，须明确选择 `released` 并完成核实。

普通检查可明确选择 `released/pending_reinspection/not_released`；只有 `released` 取得放行资格，另两种结论继续阻断正常定稿和入库。Quality 不生成本轮建议量、累计建议量或抽检合格率；没有独立剔除数量输入，也不自动把不合格数登记为产品报废。

`RecordFinishedInspectionPayload` 与事实响应分开。请求提交 `inspectionMethod/qualifiedQuantity/unqualifiedQuantity/releaseDecision`，不提交 `coveredQuantity` 或 `inspectedQuantity`；成品事实响应提供 G/F 和只读派生 N，不返回 `coveredQuantity/releasedQuantity/cumulativeSuggestionQuantity`。检验时间、结论和凭据仍必填；`inspectedAt` 须为带 `Z` 或显式时区偏移的 ISO 8601 时间，服务端保存所表示的同一时刻。`normalizeFinishedInspectionFacts` 校验 G/F、方式与结论；写入、读取和 Production 审批解析复用公开纯规则 `evaluateOutputInspection` 核验同一检查事实，不派生整批或放行数量。

产线三项数量和版本保留为登记当时的来源快照，只供识别与核对；不限制实际检查总数，也不自动改变 G/F。例如产线原申报 10，全检填写合格 11、不合格 1，则 N=12；抽检填写样本合格 4、不合格 1，则 N=5。抽检 N=5 不说明整批只有 5 件或其余全部合格。产线管理员独立核对和修正计划内、计划外及实际报废，主动引用适用检验记录送审；质检页面不提示产出数量差异，不合格数不能自动作为已报废数量。

## 成品来源与统一事实

| 字段 | 含义与约束 |
| --- | --- |
| `id` | BIGINT UNSIGNED 主键 |
| `closeout_id / production_batch_id / finished_round_id` | 非空来源；轮次与结案根组合外键保证同一 Production 来源，一轮最多一份 Quality case |
| `declared_version` | 登记时 Production 根版本，非负，不要求等于后来送审版本 |
| `declared_available_quantity / declared_extra_quantity / declared_scrap_quantity` | 当时产线草稿三项参考快照，不由质检修改 |
| `inspection_method` | full / sampling / zero_confirmation |
| `covered_quantity` | 共用表保留的可空列；新成品结果始终为 NULL，不作为整批测量 |
| `qualified_quantity` G | 本次实检合格数；N=G+F只读派生 |
| `unqualified_quantity` F | 本次实检不合格数 |
| `release_decision` | released / pending_reinspection / not_released，必须明确选择 |
| `inspected_at` | 真实检验时间 DATETIME |
| `result_note / evidence_reference` | 结论及凭据，各非空且最多 5000 字 |
| `previous_record_id` | 当前根最新检验前驱；组合 FK 保证同根，不覆盖原记录 |
| `created_by / created_at` | 不可变事实操作者 FK users 与创建时间 |

统一结果只持久化 G/F，成品的 `covered_quantity` 为 NULL；N=G+F 只读派生。成品原申报版本和三项数量保存在 case。成品响应和批准证据不含整批 C、本次 R、累计 S 或抽检合格率，不建立重复物理计数。字段及组合 FK 见[数据库](database.md)。

**当前定稿规则**：Production 管理员决定计划内累计目标 A、计划外累计目标 E 及新增报废。仅在定稿引用的检验为 `full + released` 时，Production 计算 `A+E−原引用检验轮固定计划内已入−原引用检验轮固定计划外已入−G`，显示非阻断核对提示；抽检和零量核实不作整批数量差异提示。差异不阻断保存、送审或批准，不新增强制说明或额外审批；原有产出说明、更正原因、物料安排及负责人审批保留。`A<=任务计划`、计划内外各自不低于历史已入量、整数与存储上限继续校验；不合格不自动转报废。

本轮建立时 Production 固定计划内与计划外历史已入基准，供后续授权计算和上述全检定稿提示使用。提示采用**原引用检验轮**的基准；纯定稿更正沿用旧检验时，不改用新定稿轮的基准。该基准是来源历史已入事实快照，不由库存批次余额、当前目标批次或后续领用推算；首次轮两项均为零。Quality 不计算或展示累计建议。

## 部分已入后的复检与固定范围

首次轮由 Production 保存产出草稿时建立，`POST /quality/finished-inspections/:batchId/actions/start` 将现有待检轮推进 `inspecting`。`POST /quality/finished-inspections/:batchId/actions/reinspect` 提交 `version/currentRevisionId/reason`，Production 来源在同一事务锁定结案根、核对批准版和真实已入，建立后续轮并直接推进 `inspecting`；不能重复执行首次开始。新轮固定当时计划内／计划外历史已入基准及申报剩余量，旧轮与剩余授权立即失效；旧批准版、旧检验和旧入库事实保留。新的检查覆盖该任务全部剩余送检实物，排除已入和已独立处置报废，不按库存批次拆检验范围。无剩余实物时不能发起复检；已批准清单进入更正后，如当前草稿新增了尚未入库的真实实物，按草稿累计目标减历史已入核对本次范围。连续复检无需先取消更正。

Quality 只在 Production 准备的当前有效轮次执行 record 时一并创建一份 completed case/record，`finished_round_id` 明确关联来源轮次；同轮重复登记拒绝，必须由来源发起下一轮复检。全检／抽检均记录 G/F，普通检查要求 `0<G+F≤99999999`；零产出核实要求 G=F=0 且明确 `released`。Quality 不测整批量、推算抽检整批差异或决定类别分配、报废及入库目标。已入下限、任务上限及有效授权由 Production 和 Inventory 各自校验；Production 的全检定稿提示见上节。

本轮待复检或不放行继续阻断正常定稿和入库；新检查完成本身不恢复旧授权。产线管理员核对清单并经负责人批准后，来源按新有效授权恢复剩余执行。纯分配更正可引用仍适用的旧检验依据，不新增一份同轮检查；后续执行不更新原检验轮基准。已入 10、剩余全检 G=2/F=0 时，Production 可对新累计目标与原检验轮固定基准 10 加 G=2 的差额作定稿提示；历史 10 件仍引用其原依据。

## 不可变记录与事务

历史分页接口 `GET /api/quality/finished-inspections/:batchId/records` 按记录 ID 倒序读取；精确接口 `GET /api/quality/finished-inspections/:batchId/records/:recordId` 只返回该任务所属的一条既存成品记录，复用同一事实映射和检验人展示名。两者均要求 `quality:finished-inspections:view`。记录不存在、属于其他任务或不是成品来源时，精确接口统一返回 `NOT_FOUND`，不回退读取最新记录。返回的原申报与轮次固定已入基准属于该记录发生时的历史来源，不随任务后续复检或入库重算。

每次新记录归属于当前成品轮次的全部剩余送检范围；抽检 G/F 只描述实际样本，不证明整批数量。新轮复检追加记录并关联同来源前驱，只采用当前轮有效依据，不叠加历史检查数量。固定范围与开始冻结见上节，不用动态库存余额补造基准。是否仍适用由管理员核实并主动选择引用，需要复检时走已有显式复检入口；不自动检测新增产出或按数量变化强制换轮。

任务[撤回结束](../../production/docs/database/production-termination.md#撤回结束与再次收尾)后，保留检验记录、引用和轮次，执行期间暂停开始、登记及复检；列表不得继续将该任务列为可办理待检，历史仍可查看。重新进入结案后，按当前阶段、审批、轮次及草稿资格办理，不因再次收尾自动作废原检验。既有明确复检、定稿更正的轮次切换规则保持。

开始、复检及登记命令分别通过 Production 注册来源能力在同池事务锁定工单→任务→结案根，核对来源版本、当前轮次及草稿资格；首次轮于草稿保存时固定基准，复检新轮于确认时固定基准，登记只在该轮生成一次检查事实。Quality 读取当前前驱、追加记录、写审计，Production 自身能力推进根版本。开始、复检与登记分别使用 `quality.finished-inspection.start.v1`、`quality.finished-reinspection.begin.v1` 与 `quality.finished-inspection.record.v3` 幂等 namespace；复检指纹包含版本、批准版指针和去首尾空白的原因，登记指纹包含规范化后的 G/F 与派生 N、方式、决定、来源版本、时间和去首尾空白的说明／凭据，不含旧整批 C。开始与复检结果为 batchId、roundId、version；登记结果为 batchId、inspectionId、version。

Quality 不写 Production 表。Production 送审和最终批准通过 Quality public 当前共享读重新核对联合指纹、最新记录与快照；`readForCloseout` 的锁内读只锁 Quality case/record，Production 轮次基准关联仅供展示，不借该读路径锁定来源轮次。UPDATE／DELETE 触发器禁止改写事实；保留 `(id,closeout_id)` 引用唯一键及 case的 `(closeout_id,id)` 与结果的 `(production_batch_id,id)` 查询索引。

`QualityFinishedInspectionQuery.hasForCloseout` 仅返回同一结案根与任务是否已有检验记录，供 Production 的复检只读预览使用；它不加载历史记录内容、不判断最新放行资格，也不代替 `readForCloseout` 的锁内依据核验。详情通过来源 `previewReinspection` 获取五项复检预览字段，Production 使用[专门读取与共享纯规则](../../production/docs/database/production-termination.md#api权限与事务)，不再为此构造完整产出详情；HTTP 返回字段与权限不变。

## 迁移保护

`202610080001-finished-inspection-measurements` 成对迁移将新成品检验的 `covered_quantity` 约束改为 NULL、普通 G+F>0、零产出 G=F=0 且明确放行；保留共用列，来料同样写 NULL。上下行在首个永久 DDL 前拒绝已有成品检验、批准版、结案审批记录或根冻结快照，不改写旧事实。迁移及应用切换期间暂停 Quality、Production 结案和相关 Approval 写入，失败后先核对真实结构再恢复。执行细则由[迁移安全](../../../../../../packages/database/docs/migration-safety.md)维护。

既有 `202609200007-quality-finished-inspection-quantities` 和 `202609210001` 迁移保留原文件，不反向修改；开发数据按统一初始化入口重建。审批快照版本由 [Production 结案设计](../../production/docs/database/production-termination.md)维护，成品 record 幂等 namespace 为 `quality.finished-inspection.record.v3`；旧快照和旧幂等结果不按新数量语义解释。
