# 任务结案、质检记录与产出清单

Production 所有结案、产出草稿和批准清单；质检记录由 Quality 所有，Production 只保存引用。正常生产、短产、提前停止和研发任务共用同一结案流程。长期决策见 [ADR-0011](../../../../../../../docs/adr/0011-task-closeout-output-list-and-finished-goods-inbound.md)；需求纠错见[需求设计](demand-allocation-and-outbound.md#正式需求更正与替代)。

**产线草稿 → 质检留存当次记录 → 产线管理员核对清单 → 所属工单负责人结案审批 → 仓管依据批准清单办理入库。** 质检记录是业务事实，不是通用审批的一层；质检无权改写产线草稿，产线管理员也不能覆盖质检记录。成品入库由[独立入库用例](finished-goods-inbound.md)办理，批准不增加库存。

## 流程与状态

- 未领料、未开工任务使用取消，保留原取消资格校验。
- 批量正常执行完成校验全部工序、需求、补料和末工序数量；研发正常结束不检查工序或末道报工，也不要求此时已领齐剩余需求，物料待办在结案中处理。两类任务均记录 `execution_completed_at/by`，由 `doing` 进入 `closing`，建立 `normal` 结案草稿，不在批次表存储报工汇总数量。此时尚未最终结案。
- 提前停止从 `material_partially_outbound/material_outbound/doing` 进入 `closing`，建立 `early` 收尾草稿；先逐项处理未结束事项，再核对物料和产出。在途需求纠错须先撤回或驳回。
- 首份清单末级批准后，`normal` 批次进入 `completed` 并记录最终结案时间／人，`early` 批次进入 `terminated`。正常工序完成后的质检可用量不足计划也按这一次结案审批接受实际结果，不另建短产审批。
- 批准清单更正不重开批次、工序或工单；保留旧版，批准后生成新版并推进唯一有效版本指针。

进入 `closing` 即停止派工、开工、报工、报工更正、返工执行、新增需求、在产损耗登记及普通分配／出库。实际退料仍在退料管理办理；不是要求把所有已领物料退回。管理员核实可退余料、已耗用与损坏情况并留存安排。驳回／撤回只解除本次送审冻结，不恢复已关闭需求、工序或已办理退料。

页面操作使用“提前结束”“继续收尾”“核对产出清单”“查看结案信息”。正常完成执行后直接核对产出，并可进入同一物料核对工作台；没有待处理事项时明确展示空态。

提前结束清单首次批准为 `terminated` 后，原任务计划不再占工单分配额度；`closing` 期间仍占用。原计划、领料及批准产出保留，任务额度及版本边界见[工单设计](work-orders-and-batches.md)。

## 逐项处理

每项确认实际处理说明、核对收尾版本及目标版本，处理结果与不可变行动记录、审计、幂等结果同事务写入。页面按业务类型预填可编辑备注，管理员须核对后确认。相同事项已结束后不得重复处理；物料事实变化后允许追加一次新的实核记录。

收尾工作台按物流与需求、工序、异常与返工分组。物流按整个批次的“待出库单 → 分配 → 活动需求 → 未履约补料单”分阶段解锁；前序模块仍有待办时，后序模块不可操作，后端同样校验此顺序。工序及异常／返工不依赖这条物流链。模块快捷处理只顺序调用已有逐项命令，每次成功重新获取版本与核对令牌；失败、未知结果或目标变化时停止后续处理，保留已经成功的事实，不把多项操作伪装成一次原子提交。

详情额外返回当前 `demands`（含原需求量、已领、保留余量、来源与替代关系）、`pendingItems`（含来源需求及不可操作原因）、`materialReviews`（待核对／已核对／事实变化需重核、说明、人和时间）。这些是现有事实的只读投影，不新增影子表，也不改变原行动快照或已送审批证据。物料实核是否仍有效由后端比较最近行动快照和当前领退料／损耗事实，页面不自行猜测。保存成功有明确反馈和行内结果；打开本项说明时保留核对版本和令牌，刷新不能用新事实悄悄替换原确认依据。

传输及审批证据中的数量统一为数量字符串（产出表单数值字段除外）。数据库驱动或原行动 JSON 返回数值时，由读取映射转换成字符串，不能仅依赖 TypeScript 类型断言，也不回写不可变行动记录。

| 对象 | 处理结果与先后条件 | 保留内容 |
| --- | --- | --- |
| 待出库单 | 仅 `pending_picking → cancelled`，取消来源 `production_termination`；其他未完成状态须先到对应管理页处理 | 已确认出库、整单原明细、库存流水 |
| 分配 | 先处理待出库单，再核对并释放仍有未出库预留的分配；冻结或异常分配即使预留为零也须人工核对处理。`active` 且已全部领料、无未完成出库的分配不列为释放待办 | 原分配量、原库存批次和已领量；只释放尚未出库的预留 |
| 活动需求 | 先处理待出库单、剩余预留及冻结或异常分配，再由统一 Writer 写 `closed / batch_closeout`；已全部领料的正常有效分配不阻断关闭。每次需求关闭推进一次物料计划和批次版本 | 原 `need_number/remaining_number`、已领事实及关闭原因 |
| 未完成工序 | `pending/assigned/doing → terminated`；明确记录终止人、时间、说明和收尾 ID | 原负责人、首次开工和报工事实，处理前状态留于行动快照；不填写正常完工时间 |
| 待处理异常 | `pending_review → terminated`，记录处理人和时间 | 原异常报工及来源，不生成新报废补料事实 |
| 未完成返工 | `pending/doing → cancelled` | 已发生报工与完成返工事实 |
| 未齐套补料单 | 所有活动需求逐项关闭后，`approved → cancelled` | 原补料方案、报废事实和授权；取消不能变成齐套 |
| 物料实核 | 按每条原分配核对领料、退料、损耗及可退上限，填写实物安排 | 不推算现场余额，不自动退料 |

分配待办和需求关闭前置校验使用相同条件。未出库预留按 `max(assigned_number − 已确认出库量, 0)` 计算；待出库单不算已确认出库。零预留的正常有效分配仍保留在物料实核及领料追溯中，不为了清空待办将其改为 `released`。

物料实核锁定及计算的依据仅为 Production 的分配、领料、退料和损耗记录。库存批号、物料编码及精确版本编码通过 Inventory 公开查询装饰历史来源，不在收尾查询中跨模块联表锁库存，也不使用当前库存余额推算已领或可退量。

待确认退料和待确认损耗会阻断送审；先完成或取消对应单据。待确认在产损耗进入收尾后先取消，需要保留的真实损坏再通过结案损坏登记，保留结案来源。可退上限不是现场实存数量，不把损坏实物作为可用余料回仓。

### 收尾物料损坏登记

正常执行完成和提前结束的初次 `closing` 均可登记已领物料损坏；仅送审前开放，当前批准版非空或正在审批时拒绝。已结案后不补登记，也不借成品清单更正修改损坏事实。管理员在物料实核中选择原分配、填写实际损坏数量和原因，明确确认后即写入 `item_scrap(loss_purpose=closeout_record,status=confirmed)`，关联当前 `closeout_id`；审批驳回不撤销这个已确认事实，当前不提供冲销或改量。

独立 `ProductionCloseoutMaterialLossService`／Port／Adapter 承担完整写事务。锁序为工单 → 批次 → 收尾根 → 分配；按当前读核验“已确认领料 − pending/returned 退料 − pending/confirmed 损耗”。原需求已关闭、分配已释放仍可作为真实领料来源，不能以活动状态替代来源校验。不会创建补料需求、补产授权或库存流水，也不推进物料计划版本；仅增加损耗事实、收尾版本、成功审计和幂等结果。

`POST /production/batches/:batchId/closeout/material-losses` 独立要求 `production:tasks:manage-output`。请求为 `version/checkToken/allocationId/scrapQuantity/reason`，不接受用途、物料身份或单位。数量为正整数且不得超过当前可退上限；物料、版本、库存批次、单位均取来源分配。首次确认之后永久占用本来源可退上限，不因关闭补料需求释放。

登记会使相应物料实核快照失效，须刷新并重新核对安排，不能把损坏登记伪装成已经完成实核。`check.lossRecords` 逐笔展示在产损耗和结案损坏，保留取消记录及来源、用途、数量、原因、操作者和时间；这份明细进入审批和批准版快照。原材料损坏不计入成品报废。收尾审批证据包含逐笔损耗，当前结构版本与产出检验规则见下文；开发数据重置后恢复，不补造历史明细。

## 数量、质检与更正

产出草稿仍为任务唯一可编辑 `production_batch_closeout`：`available_quantity`、`extra_quantity` 是拟批准的累计计划内／外目标，`additional_scrap_quantity` 是本次新增成品报废。每字段为 `0..99999999` 整数，计划内不超过任务计划，计划内外累计目标各自不得低于同任务历史真实已入量。历史工序产品报废只读引用；原材料损耗不计入成品报废。计划缺口只比较任务计划与计划内目标，计划外和报废不抵扣。草稿、检验、批准均不直接产生库存流水。

每个 `production_output_round` 在建立时固定前一轮、前批准版、同任务计划内外历史已入基准及申报剩余实物量。首轮在首次保存产出草稿时建立，Quality 明确 `start` 后才能记录；复检由 Quality 入口或保留的 Production 命令共用同一来源写能力，发起时建新轮并直接进入 `inspecting`，无须再执行 `start`。纯定稿更正在发起时建 `pending_inspection` 新轮，可沿用仍适用的旧放行检验。两类新轮都标旧轮 `superseded` 并立即冻结旧剩余授权；复检必须登记新轮检验，同轮检验一条完整范围记录。新检验只覆盖本任务全部尚未入库的送检实物，排除已入和已独立处置报废，不建立范围树。无剩余实物不发起复检；已批准清单更正中如草稿新增未入实物，以当前草稿累计目标减历史已入固定新轮申报剩余量。连续复检无需先取消更正，当前草稿及其原检验引用保留供核对，但旧引用在复检轮无送审资格；新轮明确放行后须由管理员主动改选当前适用记录。取消更正、审批驳回或撤回都不恢复旧授权；可再发起新轮，经原负责人审批取得新授权。

Quality 的全检／抽检仅记录 G/F，N=G+F 自动派生且普通检查 N>0；不核实整批 C、不生成本次放行量或累计建议。零产出专用 `zero_confirmation` 要求 G=F=N=0 且明确 `released`。普通检验可明确选择 `released/pending_reinspection/not_released`，后两种结论阻断送审与批准。仅在 Production 定稿引用 `full+released` 记录时，比较累计目标 `A+E` 与**原引用检验轮**固定计划内／外已入基准加 G，差额只提示，不阻断草稿保存、送审或审批；抽检不外推整批，也不作整批量差异。沿用旧检验时不使用新定稿轮基准。检验不自动产生报废。审批证据保留检验事实、原轮基准、草稿、物料安排和审批人。已入事实从 Inventory 公开能力读取，不从库存批次余额倒推。

负责人末级批准原子追加 `production_output_revision` 和每类正数剩余授权 `production_output_allocation`。某类授权量 = 草稿累计目标 − 本轮该类固定已入基准；为零时没有该类授权行。批准版 API 的累计数从基准＋授权派生，版表不保存第二套累计物理列。`current_revision_id` 只说明最新批准版；仓库可执行资格另要求对应当前轮已定稿。历史批准、授权和入库明细不回挂新版本。批准版工单汇总只取每任务当前版；执行结束、结案审批和实际入库分别展示。正常首次批准使任务 `completed`，提前结束首次批准使任务 `terminated`；后续清单更正不重开生产或工序。

收尾送审仍须逐项处理未决事项、物料实核有效、无待确认退料或损耗，并在锁内冻结当前工单负责人；资格失效不得回退给其他人。仅全检放行的产出数量差异作非阻断定稿提示；任务计划上限、历史已入下限、当前轮放行和负责人审批仍独立强制。完整入库资格和分次消费见[成品入库](finished-goods-inbound.md)。

## 数据结构

### `production_batch_closeout`

一任务一份可变收尾／产出草稿，使用单据审计字段及乐观锁 `version`，无软删除。沿用同一根记录，不新建平行草稿或第二账本。

| 字段 | 约束／含义 |
| --- | --- |
| `id / production_batch_id` | 主键／唯一批次 FK；`UNIQUE(id,production_batch_id)` 校验下属事实归属 |
| `closeout_mode` | `normal/early`，来源正常执行结束或提前停止 |
| `reason` | 建立收尾的原因，与最终产出说明独立 |
| `available_quantity / extra_quantity / additional_scrap_quantity` | 可空无符号整数，未填时同时空，保存后各自不超过字段上限 |
| `output_reason / material_review_note` | 保存草稿时必填的产出原因与物料安排 |
| `inspection_record_id` | 管理员选择的质检记录，与本根组合 FK |
| `approval_instance_id / pending_approval_id` | 最近申请／当前在审指针，后者非空时等于前者 |
| `review_snapshot` | 当前送审证据；历史以 Approval 和不可变批准版本为准 |
| `current_revision_id / current_round_id` | 最新批准版本／当前办理轮次；两者共同判定剩余授权资格 |
| `correction_reason` | 已批准后显式开启更正时填写；无更正草稿时为空 |

展示状态由上述事实推导：在审为 `reviewing`，未有批准版为 `draft`，有批准版且开启更正为 `correcting`，其他为 `approved`。不另写冗余状态列。质检保存推进草稿版本以使旧提交失效，但不修改申报数量或替管理员选择记录。

### `production_batch_closeout_action`

不可变逐项处理事实，UPDATE/DELETE 触发器禁止改写，无 `version/updated_*/is_deleted`。

| 字段 | 类型／约束 | 含义 |
| --- | --- | --- |
| `id / closeout_id` | 自增主键／非空 FK 收尾记录 | 索引 `(closeout_id,id)` |
| `item_kind` | `VARCHAR(30)`，CHECK 封闭枚举 | step、abnormal、rework、supplement、outbound、demand、allocation、material |
| `target_id` | `BIGINT UNSIGNED NOT NULL` | 本模块目标记录；类型与同批次归属锁内校验 |
| `label` | `VARCHAR(200) NOT NULL` | 来源记录标识 |
| `previous_status / resulting_status` | `VARCHAR(40) NOT NULL` | 实际处理前后状态 |
| `reason` | `TEXT NOT NULL`，去空白非空 | 本项说明 |
| `fact_snapshot` | `JSON NOT NULL` | 处理前事项 ID、状态、版本、数量／物料核对依据 |
| `created_by / created_at` | 用户 FK／默认当前时间 | 实际处理人和时间 |

`batch_step_records` 增加 `terminated` 及 `closeout_id/terminated_by/terminated_at/termination_reason`。终止状态必须全部有值且 `completed_at IS NULL`；其他状态这些字段为空；`(closeout_id,production_batch_id)` 组合 FK 校验归属。

### 引用 Quality 的 `quality_inspection_record`

检验表与写事务、DTO、领域放行规则、复检前驱及独立 HTTP 入口均属于 Quality，完整字段约束见[Quality 成品检验专题](../../../quality/docs/finished-inspections.md)。以下仅描述 Production 批准证据引用的契约。Production 通过 Quality public 当前共享读获取同任务记录，不能直接读取或改写其表。Quality 经注册来源回调由 Production 自己锁定并推进结案根，避免循环依赖。

Production 消费 `ProductionOutputInspection` 公开契约：记录 ID、同任务／结案根身份、当时申报版本与三项数量、检验时间、说明／凭据、前驱、操作者，以及 `inspectedQuantity/qualifiedQuantity/unqualifiedQuantity/releaseDecision`。成品契约及审批证据不包含 `coveredQuantity/releasedQuantity/cumulativeSuggestionQuantity`；N=G+F 为只读派生，不重复落表。

Quality case 以 `finished_round_id` 引用实际检查轮次，record 保存 G/F、明确结论和前驱；共用 `covered_quantity` 列对新成品记录为 NULL。Production 只通过 Quality public 读取不可变检验，不直接查询或改写检验表；Quality 经来源 registry 调用 Production 在同事务中校验并推进当前轮。原始申报快照和实际检查轮基准分别保留，检验保存推进结案根版本，不替管理员选择最终依据。说明和凭据去空白非空、各不超过 5000 字；零产出同样适用。

### `production_output_round` 与 `production_output_allocation`

轮次基准、起始身份、前轮和前版不可修改，仅 `status/version` 按命令推进；状态为 `pending_inspection → inspecting → pending_finalization → reviewing → finalized`，开始后续轮次可使旧轮进入 `superseded`。取消或驳回的轮次不恢复为已定稿。每轮至多一版批准，版每类别至多一条正整数授权。授权不可更新或删除，已执行进度按 Inventory 事实派生，不存可变余额。`allocation` 以 `revision_id/round_id/closeout_id` 组合 FK 锚定来源。

### `production_output_revision`

每次最终批准追加一条不可变清单，`UNIQUE(closeout_id,revision_no)`、`UNIQUE(approval_instance_id)` 防重复；一份初版及若干更正版组成链，不修改旧数量。

| 字段 | 约束／含义 |
| --- | --- |
| `id / closeout_id / round_id / production_batch_id` | 清单主键、办理轮次与同任务收尾组合 FK |
| `work_order_id / product_id` | 与任务组合 FK 核对来源 |
| `revision_no / previous_revision_id` | 正整数版本；初版为 1 且无前版，更正版有前版并属于同根 |
| `approval_instance_id / inspection_record_id` | 唯一批准申请、实际采用的同根质检事实 |
| `planned_quantity` | 任务计划快照；累计计划内／外从轮次基准＋该版授权派生 |
| `additional_scrap_quantity / existing_scrap_quantity` | 本次新增与历史工序报废分别保存 |
| `correction_reason / review_snapshot` | 更正原因及完整冻结证据 |
| `created_by / created_at` | 最终批准人和批准时间 |

事实无 version、更新审计或软删除，UPDATE/DELETE 触发器禁止改写。当前版指针和当前已定稿轮次共同决定入库资格；库存入库按明细引用授权及原批准版。旧 `production_batch_termination` 被移除，不双写或迁移旧审批证据。

## API、权限与事务

以下路径以前缀 `/api/production/batches/:batchId` 为准。

| 路径 | 作用／权限 |
| --- | --- |
| `GET /termination-check` | 原逐项核对及批准产出只读投影；tasks:view |
| `GET /closeout` | 收尾事项、需求、物料与行动；无根返回 JSON `null`，不能发送空响应体；tasks:view |
| `POST /closeout/begin` | 提前停止并建立收尾；tasks:terminate |
| `POST /closeout/items` | 带版本和核对令牌处理一项；tasks:terminate |
| `GET /output` | 草稿、质检、批准版本、更正资格和送审阻断；tasks:view |
| `POST /output/material-review` | 固定物料核对，复用原行动 Writer；tasks:manage-output |
| `POST /output/draft` | 保存草稿并选择检验依据；tasks:manage-output |
| `POST /output/submit` | 版本及 submissionToken 送审；tasks:manage-output |
| `POST /output/corrections` | 指定当前批准版并开启纯定稿更正，立即冻结旧剩余授权；tasks:manage-output |
| `POST /output/reinspections` | 产线保留入口，复用同一来源能力发起并直接开始复检；tasks:manage-output |
| `POST /output/corrections/cancel` | 取消未送审更正草稿；tasks:manage-output |

Quality 独立查询路径为 `GET /api/quality/finished-inspections/:batchId`，使用 `quality:finished-inspections:view`；主要复检入口 `POST /api/quality/finished-inspections/:batchId/actions/reinspect` 使用 `quality:finished-inspections:record`，经 Production 来源能力共享事务。Production 的复检命令与该入口同样直接启动新轮，均不要求对方模块的页面权限。

详情的复检预览通过 `ProductionOutputRepository.previewReinspection` 在同一读取事务内加载草稿、当前轮状态、当前批准版累计目标、Quality 检验记录存在性及 Inventory 真实历史已入量，不加载完整收尾事项、历史批准快照或逐授权余额。累计目标仍按批准版自身轮次基准加本版授权派生；更正中优先采用草稿。预览、完整产出详情及复检命令共用 [复检纯规则](../../domain/production-output-reinspection.policy.ts)，阻断优先级和剩余量计算只维护一份；命令继续在来源锁内重新读取事实，不以页面预览作为写入资格。当前批准版引用和历史入库归属仍须有效。

旧 `/closeout/output`、`/closeout/submit` 和 Production 的 `/output/inspections` 写入口删除。写命令均有独立 RBAC、版本和幂等校验，契约见[幂等约定](../../../../../docs/idempotency.md)；质检权限不授予改写草稿的能力。

审批场景沿用 `production.batch.closeout`、对象 `production_batch_closeout`，名称为“生产任务结案”。末节点必须 `business + production.work_order_owner`；前序节点可配置角色或指定用户。事务在工单 → 批次 → 草稿锁序内读取工单负责人，和证据一并交给 Approval；负责人无有效审批资格时拒绝，不回退到提交人或管理员。审批冻结所解析用户，待办和决定实时核对其账号及权限。

当前结案审批证据结构仅接受 `schemaVersion=8`，包含结案模式、前版、更正原因、具体全检／抽检／零量核实 G/F/N 事实、放行结论、原检验轮固定已入基准、产出三项、原收尾处理与逐笔物料损耗证据，以及 `workOrderOwnerEvidence`。解析独立校验 G/F、派生 N、零量放行、计划内上限与来源资格；不含整批 C、本次放行建议、累计建议、抽检整批推算、范围说明或剔除量，不读旧版、不补造缺失快照。写流程另行要求最新适用记录明确 `released`。

审批详情与批准清单响应使用 `BatchCloseoutApprovalDisplaySnapshot`：在解析原快照后，由 Production 按 `closeoutId + previousRevisionId` 读取不可变批准记录的真实 `revision_no`，补充只读 `previousRevisionNo`。完整清单与按 ID 读取的历史清单采用同一映射；不按数组位置、当前版减一或记录 ID 推算版次。没有前版或同根引用无法读取时返回 `null`，调用方结合原 `previousRevisionId` 区分首次结案和引用缺失。登记人名称同样作为只读显示信息解析。展示字段不写回历史 JSON、不参与送审指纹或批准比较，不改变快照结构版本；Approval 通过所属 handler 获取展示信息，不直接读取 Production 表。

初次送审须所有事项处理完、无待确认退料／损耗、物料实核仍有效，并引用最新且明确 `released` 的适用检验；待复检与不放行均阻断。全检产出差异提示不阻止送审或批准。提交令牌包含产出、检验身份和 G/F/N 事实、原检验轮基准、基准版和收尾事实；最终批准重新核对，变化时拒绝且整体回滚。更正沿用原批准的收尾证据，核对当前版、已入事实与本次检验，不能因历史退料后续变化重写原证据。批准节点决定、新版、有效指针、任务终态、审计和通知共享事务。

## 迁移与历史事实保护

运行守卫、停写及 up/down 顺序见[迁移安全](../../../../../../../packages/database/docs/migration-safety.md)。结案／批准清单与检验结构切换不得猜测旧审批、全检方式、范围或放行事实；需要空业务数据的升级与回退均在首个永久 DDL 前检查，开发数据通过统一初始化入口重建。

当前检验引用为 Quality 的 case／record，申报快照与 G/F 检查事实分别留存；Production 只引用同一事实，不复制检验表或恢复旧独立表。`202610080001-finished-inspection-measurements` 成对迁移按空业务守卫切换成品条件约束，详见 [Quality 数据库](../../../quality/docs/database.md)。数据库迁移存在不证明环境已执行。未完成运行验证、正式测试与用户验收统一见[路线图](../../../../../../../docs/roadmap.md)。
