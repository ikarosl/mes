# 任务结案、质检记录与产出清单

Production 所有结案、产出草稿和批准清单；质检记录由 Quality 所有，Production 只保存引用。正常生产、短产、提前停止和研发任务共用同一结案流程。长期决策见 [ADR-0011](../../../../../../../docs/adr/0011-task-closeout-output-list-and-finished-goods-inbound.md)；需求纠错见[需求设计](demand-allocation-and-outbound.md#正式需求更正与替代)。

产出详情、收尾检查／详情和撤回核对由生产任务页与生产报工记录页共用，读取权限见[生产执行接口矩阵](execution-traceability-quality.md#http-读取权限与消费者)。页面查看不授予写入资格：进入／逐项处理／撤回收尾仍要求 `production:tasks:terminate`，产出草稿、物料实核及送审等仍要求 `production:tasks:manage-output`，审批决定仍由 Approval 独立鉴权。

**产线草稿 → 质检留存当次记录 → 产线管理员核对清单 → 所属工单负责人结案审批 → 仓管依据批准清单办理入库。** 质检记录是业务事实，不是通用审批的一层；质检无权改写产线草稿，产线管理员也不能覆盖质检记录。成品入库由[独立入库用例](finished-goods-inbound.md)办理，批准不增加库存。

## 流程与状态

- 未领料、未开工任务使用取消，保留原取消资格校验。
- 批量正常执行完成只校验全部工序明确完成，不要求报工量达标、需求领齐或补料履约；研发不检查工序。两类任务记录 `execution_completed_at/by`，由 `doing` 进入 `closing`，创建或复用唯一 `normal` 结案主记录；剩余物料事项在送审前处理。
- 提前停止从 `material_partially_outbound/material_outbound/doing` 进入 `closing`，建立 `early` 收尾草稿；先逐项处理未结束事项，再核对物料和产出。在途需求纠错须先撤回或驳回。
- 首份清单末级批准后，`normal` 批次进入 `completed` 并记录最终结案时间／人，`early` 批次进入 `terminated`。正常工序完成后的质检可用量不足计划也按这一次结案审批接受实际结果，不另建短产审批。
- 批准清单更正不重开批次、工序或工单；保留旧版，批准后生成新版并推进唯一有效版本指针。

进入 `closing` 即停止派工、实际开工、返工执行、新增需求、在产损耗登记及普通分配／出库；员工状态与报工只读。管理员当前无在审申请时可办理限定的普通正常报工历史纠错，不恢复执行或改派资格，不改原批准证据、批准产出或库存；初次结案和后续产出更正在审均冻结写入。状态历史只读，不开放历史状态更正或撤销误开工；保留工序状态及未完成工序逐项终止，完整边界见[执行与纠错权限](execution-traceability-quality.md#执行结案与纠错权限已确认)。实际退料仍在退料管理办理；不是要求把所有已领物料退回。管理员核实可退余料、已耗用与损坏情况并留存安排。审批驳回／撤回只解除本次送审冻结，不恢复已关闭需求、工序执行资格、员工写入或已办理退料。

提前结束清单首次批准为 `terminated` 后，原任务计划不再占工单分配额度；`closing` 期间仍占用。原计划、领料及批准产出保留，任务额度及版本边界见[工单设计](work-orders-and-batches.md)。

## 撤回结束与再次收尾

管理员发现遗漏需求、分配、领料或报工时，可在 `closing` 且尚无批准版本、无当前在审申请时执行“撤回结束”。在审先由审批原入口撤回／驳回。请求同时携带任务与结案版本及原因，恢复阶段由服务端读取本次进入行动决定，不接受任意目标状态。

已开工任务恢复 `doing`，保留首次任务开工信息；未开工任务恢复原准备阶段。当前 `execution_completed_at/by` 清空，原完成时点进入历史。工单不随任务撤回倒退。已关闭需求、释放预留、取消单据／补料／返工、终止工序、检验及库存事实不恢复；需要时通过各自已有能力补建、办理或纠错。任务回到执行中会恢复员工原执行权限，已完成工序仍须明确重开才能新增报工。

正常与提前结束均复用 `production_batch_closeout` 唯一根，重入更新本次模式、原因和版本，追加进入行动；历史行动与原审批申请保留。再次送审根据当前事实生成新快照。物料实核继续按实际事实变化判断是否需要重核，不因一次撤回全部失效。

撤回不检查报工完整性、不推断新产出、不判断原检验实物范围，不自动清除检验引用或改变轮次。管理员判断是否继续引用；原显式复检、定稿更正和引用资格规则继续有效。任务恢复执行期间停止产出及 Quality 写入，读取资格也按当前任务阶段返回。

进入／撤回在工单→任务→结案根锁序下，与版本、成功审计及幂等结果同事务完成。行动复用 `production_batch_closeout_action`：`item_kind=task`、`target_id` 为任务 ID，前后状态为真实变更；`fact_snapshot` 保存 `actionType`、进入前状态、模式及完成时点，撤回关联 `entryActionId`。历史行动种类包含 task，但逐项处理接口只接受原子事项种类，不能借该接口调整任务状态。

## 逐项处理

每项确认实际处理说明、核对收尾版本及目标版本，处理结果与不可变行动记录、审计、幂等结果同事务写入。页面按业务类型预填可编辑备注，管理员须核对后确认。相同事项已结束后不得重复处理；物料事实变化后允许追加一次新的实核记录。

收尾工作台按物流与需求、工序、异常与返工分组。物流按整个批次的“待出库单 → 分配 → 活动需求 → 未履约补料单”分阶段解锁；前序模块仍有待办时，后序模块不可操作，后端同样校验此顺序。工序及异常／返工不依赖这条物流链。模块快捷处理只顺序调用已有逐项命令，每次成功重新获取版本与核对令牌；失败、未知结果或目标变化时停止后续处理，保留已经成功的事实，不把多项操作伪装成一次原子提交。

详情额外返回当前 `demands`（含原需求量、已领、保留余量、来源与替代关系）、`pendingItems`（含来源需求及不可操作原因）、`materialReviews`（待核对／已核对／事实变化需重核、说明、人和时间）。这些是现有事实的只读投影，不新增影子表，也不改变原行动快照或已送审批证据。物料实核是否仍有效由后端比较最近行动快照和当前领退料／损耗事实，页面不自行猜测。打开本项说明时保留核对版本和令牌，刷新不能用新事实悄悄替换原确认依据。

收尾读取与审批证据的数量使用字符串，产出表单数值字段除外；规范化展示不回写原行动快照。

| 对象 | 处理结果与先后条件 | 保留内容 |
| --- | --- | --- |
| 待出库单 | 仅 `pending_picking → cancelled`，取消来源 `production_termination`；其他未完成状态须先到对应管理页处理 | 已确认出库、整单原明细、库存流水 |
| 分配 | 先处理待出库单，再核对并释放仍有未出库预留的分配；冻结或异常分配即使预留为零也须人工核对处理。`active` 且已全部领料、无未完成出库的分配不列为释放待办 | 原分配量、原库存批次和已领量；只释放尚未出库的预留 |
| 活动需求 | 先处理待出库单、剩余预留及冻结或异常分配，再由统一 Writer 写 `closed / batch_closeout`；已全部领料的正常有效分配不阻断关闭。每次需求关闭推进一次任务版本 | 原 `need_number/remaining_number`、已领事实及关闭原因 |
| 未完成工序 | `pending/assigned/doing → terminated`；明确记录终止人、时间、说明和收尾 ID | 原负责人、首次开工和报工事实，处理前状态留于行动快照；不填写正常完工时间 |
| 待处理异常 | `pending_review → terminated`，记录处理人和时间 | 原异常报工及来源，不生成新报废补料事实 |
| 未完成返工 | `pending/doing → cancelled` | 已发生报工与完成返工事实 |
| 未齐套补料单 | 所有活动需求逐项关闭后，`approved → cancelled` | 原补料方案、报废事实和授权；取消不能变成齐套 |
| 物料实核 | 按每条原分配核对领料、退料、损耗及可退上限，填写实物安排 | 不推算现场余额，不自动退料 |

分配待办和需求关闭前置校验使用相同条件。未出库预留按 `max(assigned_number − 已确认出库量, 0)` 计算；待出库单不算已确认出库。零预留的正常有效分配仍保留在物料实核及领料追溯中，不为了清空待办将其改为 `released`。

物料实核和送审批依据由 Production 自有分配、需求、损耗，与 Inventory 公共实际领退料共同组成。写命令只锁 Production 自有事实，经 `InventoryProductionDocumentCommand.facts` 当前读实际 `production_material/return_inbound` 单据；待出库取消也通过 Inventory 窄命令，不直接写或锁公共主从。人工其他出入库不参与原需求、补料或物料实核。库存批号、物料编码及精确版本编码通过公开查询装饰历史来源，不因展示联查锁库存，也不使用当前库存余额推算已领或可退量。

待确认退料和待确认损耗会阻断送审；先完成或取消对应单据。待确认在产损耗进入收尾后先取消，需要保留的真实损坏再通过结案损坏登记，保留结案来源。可退上限不是现场实存数量，不把损坏实物作为可用余料回仓。

### 收尾物料损坏登记

正常执行完成和提前结束的初次 `closing` 均可登记已领物料损坏；仅送审前开放，当前批准版非空或正在审批时拒绝。已结案后不补登记，也不借成品清单更正修改损坏事实。管理员在物料实核中选择原分配、填写实际损坏数量和原因，明确确认后即写入 `item_scrap(loss_purpose=closeout_record,status=confirmed)`，关联当前 `closeout_id`；审批驳回不撤销这个已确认事实，当前不提供冲销或改量。

先锁工单 → 批次 → 收尾根 → 分配，按公开当前读核验“已完成生产领料 − pending/completed 生产退料 − pending/confirmed 损耗”。原需求已关闭、分配已释放仍可作为真实领料来源，不能以活动状态替代来源校验。不会创建补料需求、补产授权或库存流水；仅增加损耗事实、收尾版本、成功审计和幂等结果。

`POST /production/batches/:batchId/closeout/material-losses` 独立要求 `production:tasks:manage-output`。请求为 `version/checkToken/allocationId/scrapQuantity/reason`，不接受用途、物料身份或单位。数量为正整数且不得超过当前可退上限；物料、版本、库存批次、单位均取来源分配。首次确认之后永久占用本来源可退上限，不因关闭补料需求释放。

登记会使相应物料实核快照失效，须刷新并重新核对安排，不能把损坏登记伪装成已经完成实核。`check.lossRecords` 逐笔展示在产损耗和结案损坏，保留取消记录及来源、用途、数量、原因、操作者和时间；这份明细进入审批和批准版快照。原材料损坏不计入成品报废。收尾审批证据包含逐笔损耗，当前结构版本与产出检验规则见下文；开发数据重置后恢复，不补造历史明细。

## 数量、质检与更正

产出草稿仍为任务唯一可编辑 `production_batch_closeout`：`available_quantity`、`extra_quantity` 是拟批准的累计计划内／外目标，`additional_scrap_quantity` 是本次新增成品报废。计划内不超过任务计划，计划内外累计目标各自不得低于同任务历史真实已入量。历史工序产品报废只读引用；原材料损耗不计入成品报废，结案新增产品报废也不证明实物已销毁。工序正常报工数量按各工序独立事实追溯，结案核对、批准证据和产出更正不使用工序正常报工汇总或差额。计划缺口只比较任务计划与计划内目标，计划外和报废不抵扣。草稿、检验、批准均不直接产生库存流水。

成品检验的可办理阶段由 Production 控制：首次结案送审前可按轮次资格复检，结案或清单更正送审后冻结开始、登记及复检；撤回或驳回恢复本次草稿办理。已有批准版时，必须先由产线管理员显式开启清单更正，质检才可重新办理；Quality 与 Production 的复检命令均不能隐式开启更正。取消更正后同样关闭检验写入，须重新显式开启更正。清单更正原因属于本次生产更正，后续复检只记录各轮原因，不覆盖根更正原因。

每个 `production_output_round` 在建立时固定前一轮、前批准版、同任务计划内外历史已入基准及申报剩余实物量。首轮在首次保存产出草稿时建立，Quality 明确 `start` 后才能记录；复检由 Quality 入口或保留的 Production 命令共用同一来源写能力，发起时建新轮并直接进入 `inspecting`，无须再执行 `start`。清单更正在发起时建 `pending_inspection` 新轮，可沿用仍适用的旧放行检验，也可按前述资格重新检验。两类新轮都标旧轮 `superseded` 并立即冻结旧剩余授权；复检必须登记新轮检验，同轮检验一条完整范围记录。新检验只覆盖本任务全部尚未入库的送检实物，排除已入和已独立处置报废，不建立范围树。无剩余实物不发起复检；已批准清单更正中如草稿新增未入实物，以当前草稿累计目标减历史已入固定新轮申报剩余量。连续复检无需先取消更正，当前草稿及其原检验引用保留供核对，但旧引用在复检轮无送审资格；新轮明确放行后须由管理员主动改选当前适用记录。取消更正、审批驳回或撤回都不恢复旧授权；后续按当前办理资格经原负责人审批取得新授权。

检查方式、G/F/N 和零产出事实规则由 [Quality](../../../quality/docs/finished-inspections.md#数量输入与放行)维护。Production 只消费明确 released 的适用记录；pending_reinspection、not_released 均阻断送审与批准。仅在定稿引用 `full+released` 记录时，比较累计目标 `A+E` 与**原引用检验轮**固定计划内／外已入基准加 G，差额只提示，不阻断草稿保存、送审或审批；抽检不外推整批，也不作整批量差异。沿用旧检验时不使用新定稿轮基准。审批证据保留检验事实、原轮基准、草稿、物料安排和审批人。已入事实从 Inventory 公开能力读取，不从库存批次余额倒推。

负责人末级批准原子追加 `production_output_revision` 和每类正数剩余授权 `production_output_allocation`。某类授权量 = 草稿累计目标 − 本轮该类固定已入基准；为零时没有该类授权行。批准版 API 的累计数从基准＋授权派生，版表不保存第二套累计物理列。`current_revision_id` 只说明最新批准版；仓库可执行资格另要求对应当前轮已定稿。历史批准、授权和入库明细不回挂新版本。批准版工单汇总只取每任务当前版；执行结束、结案审批和实际入库分别展示。正常首次批准使任务 `completed`，提前结束首次批准使任务 `terminated`；后续清单更正不重开生产或工序。

收尾送审仍须逐项处理未决事项、物料实核有效、无待确认退料或损耗，并在锁内冻结当前工单负责人；资格失效不得回退给其他人。仅全检放行的产出数量差异作非阻断定稿提示；任务计划上限、历史已入下限、当前轮放行和负责人审批仍独立强制。完整入库资格和分次消费见[成品入库](finished-goods-inbound.md)。

## 数据结构

下表按当前 migration 列出物理类型；收尾及批准版部分单条数量使用 `BIGINT UNSIGNED`，与公共 `INT` 约定的差异待 [CO-12](../../../../../../../docs/documentation-conflicts.md#co-12)裁决。

### `production_batch_closeout`

一任务一份可变收尾／产出草稿。沿用同一根记录，不新建平行草稿或第二账本。

产出三项数量未填写时同时为空，保存时必须说明产出原因和物料安排；建立收尾的原因与最终产出说明分别保存。无更正草稿时不填写更正原因。

最近申请与当前在审申请分别记录，后者非空时必须指向最近申请。根只保留当前送审证据，历史证据以 Approval 和不可变批准版为准。

展示状态由上述事实推导：在审为 `reviewing`，未有批准版为 `draft`，有批准版且开启更正为 `correcting`，其他为 `approved`。不另写冗余状态列。质检保存推进草稿版本以使旧提交失效，但不修改申报数量或替管理员选择记录。

**`production_batch_closeout` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY` | 主键，自增 |
| `production_batch_id` | `BIGINT UNSIGNED NOT NULL` | 一任务一份收尾／产出根 |
| `closeout_mode` | `VARCHAR(20) NOT NULL` | `normal/early`，来源正常执行结束或提前停止 |
| `reason` | `TEXT NOT NULL` | 建立收尾的原因，与最终产出说明独立 |
| `available_quantity` | `BIGINT UNSIGNED NULL` | 拟批准的累计计划内目标；未填写产出时为空 |
| `extra_quantity` | `BIGINT UNSIGNED NULL` | 拟批准的累计计划外目标；未填写产出时为空 |
| `additional_scrap_quantity` | `BIGINT UNSIGNED NULL` | 本次新增成品报废数量；未填写产出时为空 |
| `output_reason` | `TEXT NULL` | 保存产出草稿时填写的产出原因 |
| `material_review_note` | `TEXT NULL` | 保存产出草稿时填写的物料安排 |
| `inspection_record_id` | `BIGINT UNSIGNED NULL` | 管理员选择的质检记录，与本根组合 FK |
| `approval_instance_id` | `BIGINT UNSIGNED NULL` | 最近一次结案或清单更正申请 |
| `pending_approval_id` | `BIGINT UNSIGNED NULL` | 当前在审申请；非空时等于最近申请 |
| `review_snapshot` | `JSON NULL` | 当前送审证据；历史以 Approval 和不可变批准版本为准 |
| `current_revision_id` | `BIGINT UNSIGNED NULL` | 最新不可变批准版 |
| `current_round_id` | `BIGINT UNSIGNED NULL` | 当前办理轮次，与批准版共同判定剩余授权资格 |
| `correction_reason` | `TEXT NULL` | 已批准后显式开启更正时填写；无更正草稿时为空 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 创建人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_by` | `BIGINT UNSIGNED NULL` | 最近修改人 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间 |
| `version` | `INT NOT NULL DEFAULT 0` | 乐观锁版本 |

**`production_batch_closeout` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_closeout_batch FOREIGN KEY (production_batch_id) REFERENCES production_batches(id)` |
| 外键 | `CONSTRAINT fk_closeout_approval FOREIGN KEY (approval_instance_id) REFERENCES approval_instances(id)` |
| 外键 | `CONSTRAINT fk_closeout_pending FOREIGN KEY (pending_approval_id) REFERENCES approval_instances(id)` |
| 外键 | `CONSTRAINT fk_closeout_creator FOREIGN KEY (created_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_closeout_updater FOREIGN KEY (updated_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_closeout_current_revision FOREIGN KEY (current_revision_id,id) REFERENCES production_output_revision(id,closeout_id)` |
| 外键 | `CONSTRAINT fk_closeout_inspection FOREIGN KEY(inspection_record_id,id) REFERENCES quality_inspection_record(id,closeout_id)` |
| 外键 | `CONSTRAINT fk_closeout_current_round FOREIGN KEY(current_round_id,id) REFERENCES production_output_round(id,closeout_id)` |
| 唯一键 | `UNIQUE KEY uk_closeout_batch (production_batch_id)` |
| 唯一键 | `UNIQUE KEY uk_closeout_reference (id,production_batch_id)` |
| CHECK | `CONSTRAINT chk_closeout_reason CHECK (CHAR_LENGTH(TRIM(reason))>0)` |
| CHECK | `CONSTRAINT chk_closeout_version CHECK (version>=0)` |
| CHECK | `CONSTRAINT chk_closeout_mode CHECK (closeout_mode IN ('normal','early'))` |
| CHECK | `CONSTRAINT chk_closeout_output CHECK ( (available_quantity IS NULL AND extra_quantity IS NULL AND additional_scrap_quantity IS NULL AND material_review_note IS NULL AND output_reason IS NULL AND inspection_record_id IS NULL) OR (available_quantity IS NOT NULL AND extra_quantity IS NOT NULL AND additional_scrap_quantity IS NOT NULL AND available_quantity<=99999999 AND extra_quantity<=99999999 AND additional_scrap_quantity<=99999999 AND material_review_note IS NOT NULL AND CHAR_LENGTH(TRIM(material_review_note))>0 AND output_reason IS NOT NULL AND CHAR_LENGTH(TRIM(output_reason))>0) )` |
| CHECK | `CONSTRAINT chk_closeout_correction CHECK (correction_reason IS NULL OR (current_revision_id IS NOT NULL AND CHAR_LENGTH(TRIM(correction_reason))>0))` |
| CHECK | `CONSTRAINT chk_closeout_pending CHECK (pending_approval_id IS NULL OR (approval_instance_id IS NOT NULL AND pending_approval_id=approval_instance_id AND review_snapshot IS NOT NULL AND available_quantity IS NOT NULL AND inspection_record_id IS NOT NULL AND (current_revision_id IS NULL OR correction_reason IS NOT NULL)))` |

### `production_batch_closeout_action`

不可变任务生命周期与逐项处理事实。

行动关联同一任务的收尾根及处理目标，记录实际前后状态、本项说明和处理前的身份、版本、数量及物料核对依据；目标类型与归属须锁内校验。

`batch_step_records` 增加 `terminated` 及 `closeout_id/terminated_by/terminated_at/termination_reason`。终止状态必须全部有值且 `completed_at IS NULL`；其他状态这些字段为空；`(closeout_id,production_batch_id)` 组合 FK 校验归属。

**`production_batch_closeout_action` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY` | 主键，自增 |
| `closeout_id` | `BIGINT UNSIGNED NOT NULL` | 所属收尾根 |
| `item_kind` | `VARCHAR(30) NOT NULL` | task、step、abnormal、rework、supplement、outbound、demand、allocation、material |
| `target_id` | `BIGINT UNSIGNED NOT NULL` | 本模块目标记录；类型与同批次归属锁内校验 |
| `label` | `VARCHAR(200) NOT NULL` | 来源记录标识 |
| `previous_status` | `VARCHAR(40) NOT NULL` | 实际处理前状态 |
| `resulting_status` | `VARCHAR(40) NOT NULL` | 实际处理后状态 |
| `reason` | `TEXT NOT NULL` | 本项说明 |
| `fact_snapshot` | `JSON NOT NULL` | 处理前事项 ID、状态、版本、数量／物料核对依据 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 逐项处理或进入／撤回的实际操作者 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 行动发生的记录时间 |

**`production_batch_closeout_action` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_closeout_action_source FOREIGN KEY (closeout_id) REFERENCES production_batch_closeout(id)` |
| 外键 | `CONSTRAINT fk_closeout_action_actor FOREIGN KEY (created_by) REFERENCES users(id)` |
| 索引 | `KEY idx_closeout_action (closeout_id,id)` |
| CHECK | `CONSTRAINT chk_closeout_action_reason CHECK (CHAR_LENGTH(TRIM(reason))>0)` |
| CHECK | `CONSTRAINT chk_closeout_action_kind CHECK ( item_kind IN ('task','step','abnormal','rework','supplement','outbound','demand','allocation','material') )` |

**`production_batch_closeout_action` 数据库触发器**

| 触发器 | 时机 | 保护或维护范围 |
| --- | --- | --- |
| [trg_closeout_action_no_update](../../../../../../../packages/database/migrations/202609150001-production-demand-correction-and-closeout.up.sql) | `BEFORE UPDATE` | 收尾行动事实不可改写 |
| [trg_closeout_action_no_delete](../../../../../../../packages/database/migrations/202609150001-production-demand-correction-and-closeout.up.sql) | `BEFORE DELETE` | 收尾行动事实不可删除 |

### 引用 Quality 的 `quality_inspection_record`

检验身份与字段由 [Quality 成品检验](../../../quality/docs/finished-inspections.md)维护。Production 只通过公开能力读取同任务的不可变记录；Quality 经来源能力在同事务核验并推进当前轮，不能替管理员选择最终依据。

Production 保存原始申报快照、检验身份和实际检查轮基准。检验保存使旧草稿版本失效，但不修改申报数量；原检验轮与当前定稿轮不能混用。G/F、放行及数量差异的消费规则见[数量、质检与更正](#数量质检与更正)。

### `production_output_round` 与 `production_output_allocation`

轮次是可变单据，授权是不可变事实，公共字段遵守[数据库约定](../../../../../../../docs/database-conventions.md)。数量和授权语义见[数量、质检与更正](#数量质检与更正)。

`production_output_round` 的同根轮号唯一递增，前轮和前批准版均须属于同一收尾根。第 1 轮没有前轮或前批准版；后续轮必须有前轮，是否可引用前批准版由具体命令校验。

轮次来源、触发原因、建轮时草稿版本及三个起始数量创建后不可改写；只由命令推进办理状态。正常状态路径为 `pending_inspection → inspecting → pending_finalization → reviewing → finalized`，开始后续轮次可使旧轮进入 superseded。取消或驳回不恢复旧轮的已定稿资格，每轮至多一份批准版由 revision 的唯一约束保证。

`production_output_allocation` 必须与批准版、办理轮及收尾根同源，每版每类最多一行。授权不可覆盖或删除；已执行进度沿 Inventory 事实派生，不存可变余额。

**`production_output_round` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY` | 主键，自增 |
| `closeout_id` | `BIGINT UNSIGNED NOT NULL` | 所属收尾根 |
| `round_no` | `INT NOT NULL` | 同根递增轮号 |
| `previous_round_id` | `BIGINT UNSIGNED NULL` | 同根前轮，组合自 FK |
| `trigger_type` | `VARCHAR(30) NOT NULL` | 初轮、复检或清单更正 |
| `base_revision_id` | `BIGINT UNSIGNED NULL` | 建轮时前批准版，与 closeout_id 组合 FK production_output_revision |
| `source_version` | `INT NOT NULL` | 建轮时产出草稿版本快照 |
| `baseline_planned_received` | `INT NOT NULL` | 建轮时同任务计划内真实已入基准 |
| `baseline_extra_received` | `INT NOT NULL` | 建轮时同任务计划外真实已入基准 |
| `starting_declared_remaining` | `INT NOT NULL` | 建轮时申报剩余实物量快照 |
| `status` | `VARCHAR(30) NOT NULL` | pending_inspection／inspecting／pending_finalization／reviewing／finalized／superseded |
| `reason` | `TEXT NULL` | 本轮原因，不覆盖根清单更正原因 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 建轮人 |
| `updated_by` | `BIGINT UNSIGNED NOT NULL` | 最近修改人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 建轮时间 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间 |
| `version` | `INT NOT NULL DEFAULT 0` | 本轮乐观锁 |

**`production_output_round` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_output_round_closeout FOREIGN KEY(closeout_id) REFERENCES production_batch_closeout(id)` |
| 外键 | `CONSTRAINT fk_output_round_previous FOREIGN KEY(previous_round_id,closeout_id) REFERENCES production_output_round(id,closeout_id)` |
| 外键 | `CONSTRAINT fk_output_round_base FOREIGN KEY(base_revision_id,closeout_id) REFERENCES production_output_revision(id,closeout_id)` |
| 外键 | `CONSTRAINT fk_output_round_creator FOREIGN KEY(created_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_output_round_updater FOREIGN KEY(updated_by) REFERENCES users(id)` |
| 唯一键 | `UNIQUE KEY uk_output_round_no(closeout_id,round_no)` |
| 唯一键 | `UNIQUE KEY uk_output_round_closeout(id,closeout_id)` |
| 索引 | `KEY idx_output_round_status(closeout_id,status,id)` |
| CHECK | `CONSTRAINT chk_output_round_no CHECK(round_no>0 AND source_version>=0 AND version>=0)` |
| CHECK | `CONSTRAINT chk_output_round_trigger CHECK(trigger_type IN('initial','reinspection','finalization_correction'))` |
| CHECK | `CONSTRAINT chk_output_round_status CHECK(status IN('pending_inspection','inspecting','pending_finalization','reviewing','finalized','superseded'))` |
| CHECK | `CONSTRAINT chk_output_round_quantities CHECK(baseline_planned_received BETWEEN 0 AND 99999999 AND baseline_extra_received BETWEEN 0 AND 99999999 AND starting_declared_remaining BETWEEN 0 AND 99999999)` |
| CHECK | `CONSTRAINT chk_output_round_lineage CHECK((round_no=1 AND previous_round_id IS NULL AND base_revision_id IS NULL) OR (round_no>1 AND previous_round_id IS NOT NULL))` |
| CHECK | `CONSTRAINT chk_output_round_reason CHECK(reason IS NULL OR CHAR_LENGTH(TRIM(reason))>0)` |

**`production_output_round` 数据库触发器**

| 触发器 | 时机 | 保护或维护范围 |
| --- | --- | --- |
| [trg_output_round_identity_update](../../../../../../../packages/database/migrations/202609240001-unified-inbound-allocation-target.up.sql) | `BEFORE UPDATE` | 冻结轮次来源、建轮草稿版本、起始数量与创建事实 |

**`production_output_allocation` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY` | 主键，自增 |
| `revision_id` | `BIGINT UNSIGNED NOT NULL` | 产生本授权的批准版 |
| `round_id` | `BIGINT UNSIGNED NOT NULL` | 批准版所属办理轮 |
| `closeout_id` | `BIGINT UNSIGNED NOT NULL` | 同任务收尾根 |
| `category` | `VARCHAR(30) NOT NULL` | 计划内／计划外成品授权类别 |
| `quantity` | `INT NOT NULL` | 批准时该类别剩余授权，零量不建行 |
| `remark` | `TEXT NULL` | 批准授权说明 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 最终批准人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 授权创建时间 |

**`production_output_allocation` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_output_allocation_revision FOREIGN KEY(revision_id,round_id,closeout_id) REFERENCES production_output_revision(id,round_id,closeout_id)` |
| 外键 | `CONSTRAINT fk_output_allocation_creator FOREIGN KEY(created_by) REFERENCES users(id)` |
| 唯一键 | `UNIQUE KEY uk_output_allocation_category(revision_id,category)` |
| 唯一键 | `UNIQUE KEY uk_output_allocation_source(id,revision_id,closeout_id,category)` |
| 索引 | `KEY idx_output_allocation_round(round_id,closeout_id,id)` |
| CHECK | `CONSTRAINT chk_output_allocation_category CHECK(category IN('self_made','production_extra'))` |
| CHECK | `CONSTRAINT chk_output_allocation_quantity CHECK(quantity BETWEEN 1 AND 99999999)` |
| CHECK | `CONSTRAINT chk_output_allocation_remark CHECK(remark IS NULL OR CHAR_LENGTH(TRIM(remark))>0)` |

**`production_output_allocation` 数据库触发器**

| 触发器 | 时机 | 保护或维护范围 |
| --- | --- | --- |
| [trg_output_allocation_no_update](../../../../../../../packages/database/migrations/202609240001-unified-inbound-allocation-target.up.sql) | `BEFORE UPDATE` | 批准授权不可改写 |
| [trg_output_allocation_no_delete](../../../../../../../packages/database/migrations/202609240001-unified-inbound-allocation-target.up.sql) | `BEFORE DELETE` | 批准授权不可删除 |

### `production_output_revision`

每次最终批准追加一条不可变清单；同根版本号与批准申请分别防重。一份初版及若干更正版组成链，不修改旧数量。

批准版、办理轮、收尾根、任务、工单与成品必须同源，引用实际采用的同根检验。初版编号为 1 且无前版，更正版关联同根前版。

批准版冻结任务计划和完整受审证据，分别保存历史工序报废与本次新增报废。

批准事实不可改写。当前版指针和当前已定稿轮次共同决定入库资格；库存入库按明细引用授权及原批准版。旧 `production_batch_termination` 被移除，不双写或迁移旧审批证据。

**`production_output_revision` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY` | 主键，自增 |
| `closeout_id` | `BIGINT UNSIGNED NOT NULL` | 所属收尾根 |
| `round_id` | `BIGINT UNSIGNED NOT NULL` | 本次批准的办理轮 |
| `production_batch_id` | `BIGINT UNSIGNED NOT NULL` | 同源生产任务 |
| `work_order_id` | `BIGINT UNSIGNED NOT NULL` | 所属工单，与任务一致 |
| `product_id` | `BIGINT UNSIGNED NOT NULL` | 批准成品，与任务一致 |
| `revision_no` | `INT NOT NULL` | 同根递增版本号，初版为 1 |
| `previous_revision_id` | `BIGINT UNSIGNED NULL` | 同根前版，初版为空 |
| `approval_instance_id` | `BIGINT UNSIGNED NOT NULL` | 产生本批准版的唯一审批申请 |
| `inspection_record_id` | `BIGINT UNSIGNED NOT NULL` | 实际引用的同根不可变检验 |
| `planned_quantity` | `BIGINT UNSIGNED NOT NULL` | 任务计划快照；累计计划内／外从轮次基准＋该版授权派生 |
| `additional_scrap_quantity` | `BIGINT UNSIGNED NOT NULL` | 本次结案新增产品报废 |
| `existing_scrap_quantity` | `BIGINT UNSIGNED NOT NULL` | 冻结的历史工序产品报废 |
| `correction_reason` | `TEXT NULL` | 更正版的更正原因 |
| `review_snapshot` | `JSON NOT NULL` | 完整冻结的受审证据 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 最终批准人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 批准时间 |

**`production_output_revision` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_output_revision_source FOREIGN KEY (closeout_id,production_batch_id) REFERENCES production_batch_closeout(id,production_batch_id)` |
| 外键 | `CONSTRAINT fk_output_revision_order FOREIGN KEY (production_batch_id,work_order_id) REFERENCES production_batches(id,work_order_id)` |
| 外键 | `CONSTRAINT fk_output_revision_product FOREIGN KEY (production_batch_id,product_id) REFERENCES production_batches(id,product_id)` |
| 外键 | `CONSTRAINT fk_output_revision_previous FOREIGN KEY (previous_revision_id,closeout_id) REFERENCES production_output_revision(id,closeout_id)` |
| 外键 | `CONSTRAINT fk_output_revision_approval FOREIGN KEY (approval_instance_id) REFERENCES approval_instances(id)` |
| 外键 | `CONSTRAINT fk_output_revision_actor FOREIGN KEY (created_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_output_revision_inspection FOREIGN KEY(inspection_record_id,closeout_id) REFERENCES quality_inspection_record(id,closeout_id)` |
| 外键 | `CONSTRAINT fk_output_revision_round FOREIGN KEY(round_id,closeout_id) REFERENCES production_output_round(id,closeout_id)` |
| 唯一键 | `UNIQUE KEY uk_output_revision_no (closeout_id,revision_no)` |
| 唯一键 | `UNIQUE KEY uk_output_revision_approval (approval_instance_id)` |
| 唯一键 | `UNIQUE KEY uk_output_revision_reference (id,closeout_id)` |
| 唯一键 | `UNIQUE KEY uk_output_revision_batch (id,production_batch_id)` |
| 唯一键 | `UNIQUE KEY uk_output_revision_finished_source (id,production_batch_id,work_order_id,product_id)` |
| 唯一键 | `UNIQUE KEY uk_output_revision_round(round_id)` |
| 唯一键 | `UNIQUE KEY uk_output_revision_round_closeout(id,round_id,closeout_id)` |
| 索引 | `KEY idx_output_revision_order (work_order_id,created_at,id)` |
| CHECK | `CONSTRAINT chk_output_revision_no CHECK (revision_no>0)` |
| CHECK | `CONSTRAINT chk_output_revision_correction CHECK ( (previous_revision_id IS NULL AND revision_no=1 AND correction_reason IS NULL) OR (previous_revision_id IS NOT NULL AND revision_no>1 AND correction_reason IS NOT NULL AND CHAR_LENGTH(TRIM(correction_reason))>0) )` |
| CHECK | `CONSTRAINT chk_output_revision_quantities CHECK(planned_quantity>0 AND planned_quantity<=99999999 AND additional_scrap_quantity<=99999999)` |

**`production_output_revision` 数据库触发器**

| 触发器 | 时机 | 保护或维护范围 |
| --- | --- | --- |
| [trg_output_revision_no_update](../../../../../../../packages/database/migrations/202609170001-production-output-revisions.up.sql) | `BEFORE UPDATE` | 批准版不可改写 |
| [trg_output_revision_no_delete](../../../../../../../packages/database/migrations/202609170001-production-output-revisions.up.sql) | `BEFORE DELETE` | 批准版不可删除 |

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
| `POST /output/corrections` | 指定当前批准版并显式开启清单更正，立即冻结旧剩余授权；tasks:manage-output |
| `POST /output/reinspections` | 产线保留入口，复用同一来源能力发起并直接开始复检；tasks:manage-output |
| `POST /output/corrections/cancel` | 取消未送审更正草稿；tasks:manage-output |

Quality 独立查询路径为 `GET /api/quality/finished-inspections/:batchId`，使用 `quality:finished-inspections:view`；主要复检入口 `POST /api/quality/finished-inspections/:batchId/actions/reinspect` 使用 `quality:finished-inspections:record`，经 Production 来源能力共享事务。Production 的复检命令与该入口同样直接启动新轮，均不要求对方模块的页面权限。

复检预览与完整产出详情使用同一[复检规则](../../domain/production-output-reinspection.policy.ts)：更正中优先采用草稿，否则使用当前批准版的累计目标；当前批准引用及历史入库归属必须有效。预览不授予办理资格，复检命令须在来源锁内重新读取事实并核验。

质检权限不授予改写生产草稿的能力；写命令的幂等范围见[应用契约](../../application/idempotency/production-idempotency-scopes.contract.ts)。

审批场景沿用 `production.batch.closeout`、对象 `production_batch_closeout`，名称为“生产任务结案”。末节点必须 `business + production.work_order_owner`；前序节点可配置角色或指定用户。事务在工单 → 批次 → 草稿锁序内读取工单负责人，和证据一并交给 Approval；负责人无有效审批资格时拒绝，不回退到提交人或管理员。审批冻结所解析用户，待办和决定实时核对其账号及权限。

当前结案审批证据只接受[快照契约](../../application/production-approval-snapshot.schema.ts)声明的版本，包含任务进入／撤回行动、结案模式、前版、更正原因、具体全检／抽检／零量核实 G/F/N 事实、放行结论、原检验轮固定已入基准、产出三项、原收尾处理与逐笔物料损耗证据，以及 `workOrderOwnerEvidence`。解析独立校验 G/F、派生 N、零量放行、计划内上限与来源资格；不含整批 C、本次放行建议、累计建议、抽检整批推算、范围说明或剔除量，不读旧版、不补造缺失快照。写流程另行要求最新适用记录明确 `released`。

审批详情与批准清单响应使用 `BatchCloseoutApprovalDisplaySnapshot`：在解析原快照后，由 Production 按 `closeoutId + previousRevisionId` 读取不可变批准记录的真实 `revision_no`，补充只读 `previousRevisionNo`。完整清单与按 ID 读取的历史清单采用同一映射；不按数组位置、当前版减一或记录 ID 推算版次。没有前版或同根引用无法读取时返回 `null`，调用方结合原 `previousRevisionId` 区分首次结案和引用缺失。登记人名称同样作为只读显示信息解析。展示字段不写回历史 JSON、不参与送审指纹或批准比较，不改变快照结构版本；Approval 通过所属 handler 获取展示信息，不直接读取 Production 表。

初次送审须所有事项处理完、无待确认退料／损耗、物料实核仍有效，并引用最新且明确 `released` 的适用检验；待复检与不放行均阻断。全检产出差异提示不阻止送审或批准。提交令牌包含产出、检验身份和 G/F/N 事实、原检验轮基准、基准版和收尾事实；最终批准重新核对，变化时拒绝且整体回滚。更正沿用原批准的收尾证据，核对当前版、已入事实与本次检验，不能因历史退料后续变化重写原证据。批准节点决定、新版、有效指针、任务终态、审计和通知共享事务。

## 迁移与历史事实保护

运行守卫、停写及 up/down 顺序见[迁移安全](../../../../../../../packages/database/docs/migration-safety.md)。结案／批准清单与检验结构切换不得猜测旧审批、全检方式、范围或放行事实；需要空业务数据的升级与回退均在首个永久 DDL 前检查，开发数据通过统一初始化入口重建。审批快照结构升级不改变物理表，不改写已保存的不可变证据。Approval 按保存的显式版号校验，旧版结案审批仍受现有版本拒绝机制约束；批准清单自身无快照版号列，沿用既有读取路径，仅投影当前契约字段，不补造或迁移历史 JSON。未送审草稿依据当前事实生成当前版证据。

当前检验引用为 Quality 的 case／record，申报快照与 G/F 检查事实分别留存；Production 只引用同一事实，不复制检验表或恢复旧独立表。`202610080001-finished-inspection-measurements` 成对迁移按空业务守卫切换成品条件约束，详见 [Quality 数据库](../../../quality/docs/database.md)。数据库迁移存在不证明环境已执行。未完成运行验证、正式测试与用户验收统一见[路线图](../../../../../../../docs/roadmap.md)。
