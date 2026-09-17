# 任务结案、质检记录与产出清单

Production 所有本章数据，正常生产、短产、提前停止和研发任务共用同一结案流程。长期决策见 [ADR-0011](../../../../../../../docs/adr/0011-task-closeout-output-list-and-finished-goods-inbound.md)；需求纠错见[需求设计](demand-allocation-and-outbound.md#正式需求更正与替代)。

**产线草稿 → 质检留存当次记录 → 产线管理员核对清单 → 所属工单负责人结案审批 → 仓管依据批准清单办理入库。** 质检记录是业务事实，不是通用审批的一层；质检无权改写产线草稿，产线管理员也不能覆盖质检记录。成品入库由[独立入库用例](finished-goods-inbound.md)办理，批准不增加库存。

## 流程与状态

- 未领料、未开工任务使用取消，保留原取消资格校验。
- 正常执行完成仍校验全部工序、需求、补料和末工序数量；记录 `completed_quantity` 与 `execution_completed_at/by`，由 `doing` 进入 `closing`，建立 `normal` 结案草稿。此时尚未最终结案。
- 提前停止从 `material_partially_outbound/material_outbound/doing` 进入 `closing`，建立 `early` 收尾草稿；先逐项处理未结束事项，再核对物料和产出。在途需求纠错须先撤回或驳回。
- 首份清单末级批准后，`normal` 批次进入 `completed` 并记录最终结案时间／人，`early` 批次进入 `terminated`。正常工序完成后的质检可用量不足计划也按这一次结案审批接受实际结果，不另建短产审批。
- 批准清单更正不重开批次、工序或工单；保留旧版，批准后生成新版并推进唯一有效版本指针。

进入 `closing` 即停止派工、开工、报工、报工更正、返工执行、新增需求、损耗补料及普通分配／出库。实际退料仍在退料管理办理；不是要求把所有已领物料退回。管理员核实可退余料、已耗用与损坏情况并留存安排。驳回／撤回只解除本次送审冻结，不恢复已关闭需求、工序或已办理退料。

页面操作使用“提前结束”“继续收尾”“核对产出清单”“查看结案信息”。正常完成执行后直接核对产出，并可进入同一物料核对工作台；没有待处理事项时明确展示空态。

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

待确认退料和待确认损耗会阻断送审；先完成或取消对应单据。待确认在产损耗进入收尾后先取消，需要保留的真实损坏再通过独立“不补料”登记，不调用会生成补料的确认命令。可退上限不是现场实存数量，不把损坏实物作为可用余料回仓。

### 收尾物料损坏登记

正常执行完成和提前结束的初次 `closing` 均可登记已领物料损坏；仅送审前开放，当前批准版非空或正在审批时拒绝。已结案后不补登记，也不借成品清单更正修改损坏事实。管理员在物料实核中选择原分配、填写实际损坏数量和原因，明确确认后即写入 `item_scrap(loss_purpose=closeout_record,status=confirmed)`，关联当前 `closeout_id`；审批驳回不撤销这个已确认事实，当前不提供冲销或改量。

独立 `ProductionCloseoutMaterialLossService`／Port／Adapter 承担完整写事务。锁序为工单 → 批次 → 收尾根 → 分配；按当前读核验“已确认领料 − pending/returned 退料 − pending/confirmed 损耗”。原需求已关闭、分配已释放仍可作为真实领料来源，不能以活动状态替代来源校验。不会创建补料需求、补产授权或库存流水，也不推进物料计划版本；仅增加损耗事实、收尾版本、成功审计和幂等结果。

`POST /production/batches/:batchId/closeout/material-losses` 独立要求 `production:tasks:manage-output`。请求为 `version/checkToken/allocationId/scrapQuantity/reason`，不接受用途、物料身份或单位。数量为正整数且不得超过当前可退上限；物料、版本、库存批次、单位均取来源分配。首次确认之后永久占用本来源可退上限，不因关闭补料需求释放。

登记会使相应物料实核快照失效，须刷新并重新核对安排，不能把损坏登记伪装成已经完成实核。`check.lossRecords` 逐笔展示在产补料损耗和结案不补料损坏，保留取消记录及来源、用途、数量、原因、操作者和时间；这份明细进入审批和批准版快照。原材料损坏不计入成品报废。收尾审批证据使用结构版本 4，迁移 `202609170006` 拒绝已有旧收尾审批／批准证据，按开发约定重置，不补造历史明细。

## 数量、质检与更正

- 计划内可用产出 `available_quantity` 为非负整数且不超过任务计划；计划外产出 `extra_quantity` 与本次新增报废各自为非负整数，不按计划量或三者总数封顶，单字段存储上限为 `99999999`。
- 已确认工序产品报废只读引用；累计产品报废 = 历史工序报废 + 本次新增报废。原材料领料损耗不计入产品报废。
- 计划缺口 = 计划量 − 计划内可用量。额外产出、报废均不冲抵缺口，也不推算未用物料。例如计划 10、可用 8、报废 2，缺口仍为 2。
- `completed_quantity` 保留末工序报工事实，管理员最终数量不改报工、质量合格量或补产授权。新增报废只记录，不触发补料、补产或库存流水。零产出、全部报废可按实际结案。
- 每任务只有一个可修改草稿。质检保存当时草稿版本及申报数量、实际检验数量、时间、结果和凭据；复检新增记录并关联上一条，不能覆盖旧记录。
- 管理员核对草稿并选择最新检验记录；送审时三项数量须与该记录实际数量相同。质检时的申报版本用于追溯，不要求管理员修正后草稿版本仍等于质检前版本。
- 送审冻结草稿及选用的检验事实。批准追加不可变清单，查询与打印明确具体版本及批准信息；仓库接收数量另行展示，不以库存余额倒推。
- 更正须显式开启并填写原因，再走同一负责人审批；草稿可取消，驳回／撤回保留可修正草稿。更正首次批准证据中的物料处理记录不要求重新做不可编辑的历史收尾。
- 已确认入库类别的批准数量不可改；未入库类别可更正。在审清单与入库的联动由独立入库用例按工单 → 批次 → 草稿的共同锁序检查。更正不写库存、不伪造退库或重开生产。

工单 `finalOutput` 只累计每个任务当前有效批准清单，计划内、额外、报废分别汇总，不将历史版本重复相加。收尾中未审定量单列；工单足量完工只比较计划内批准量，额外量不填补计划缺口。全部批次终态后才可完工或关闭工单；正常结案但产出不足可按不足量结案，含提前结束任务仍归结束生产结案。

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
| `current_revision_id` | 当前有效批准版本，组合 FK 保证所属任务一致 |
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

### `production_output_inspection`

不可变质检记录，`id` 主键；`closeout_id/production_batch_id` 组合 FK 指向草稿。保存 `declared_version`、三项 `declared_*` 申报数量及实际 `available_quantity/extra_quantity/additional_scrap_quantity`、`inspected_at/result_note/evidence_reference`、`previous_inspection_id`、`created_by/created_at`。上一记录与本根组成 FK；UPDATE/DELETE 触发器阻止覆盖和删除。数字不带对计划总量的约束；可用量与任务计划的业务校验由命令完成。

### `production_output_revision`

每次最终批准追加一条不可变清单，`UNIQUE(closeout_id,revision_no)`、`UNIQUE(approval_instance_id)` 防重复；一份初版及若干更正版组成链，不修改旧数量。

| 字段 | 约束／含义 |
| --- | --- |
| `id / closeout_id / production_batch_id` | 清单主键与同任务收尾组合 FK |
| `work_order_id / product_id` | 与任务组合 FK 核对来源 |
| `revision_no / previous_revision_id` | 正整数版本；初版为 1 且无前版，更正版有前版并属于同根 |
| `approval_instance_id / inspection_record_id` | 唯一批准申请、实际采用的同根质检事实 |
| `planned_quantity / available_quantity / extra_quantity` | 计划及计划内外可用量快照；计划内不超过计划 |
| `additional_scrap_quantity / existing_scrap_quantity` | 本次新增与历史工序报废分别保存 |
| `correction_reason / review_snapshot` | 更正原因及完整冻结证据 |
| `created_by / created_at` | 最终批准人和批准时间 |

事实无 version、更新审计或软删除，UPDATE/DELETE 触发器禁止改写。有效版本只由草稿根 `current_revision_id` 指向，库存入库引用办理时实际采用的版本。旧 `production_batch_termination` 被移除，不双写或迁移旧审批证据。

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
| `POST /output/inspections` | 保存不可变当次质检事实；tasks:record-inspection |
| `POST /output/submit` | 版本及 submissionToken 送审；tasks:manage-output |
| `POST /output/corrections` | 指定当前批准版并开启更正；tasks:manage-output |
| `POST /output/corrections/cancel` | 取消未送审更正草稿；tasks:manage-output |

旧 `/closeout/output` 和 `/closeout/submit` 写入口删除。写命令均有独立 RBAC、版本和幂等校验，契约见[幂等约定](../../../../../docs/idempotency.md)；质检权限不授予改写草稿的能力。

审批场景沿用 `production.batch.closeout`、对象 `production_batch_closeout`，名称为“生产任务结案”。末节点必须 `business + production.work_order_owner`；前序节点可配置角色或指定用户。事务在工单 → 批次 → 草稿锁序内读取工单负责人，和证据一并交给 Approval；负责人无有效审批资格时拒绝，不回退到提交人或管理员。审批冻结所解析用户，待办和决定实时核对其账号及权限。

当前审批证据结构仅接受版本 `3`，包含结案模式、前版、更正原因、具体质检事实、产出三项、原收尾处理与物料证据，以及 `workOrderOwnerEvidence`。不读旧版、不补造缺失快照；开发数据允许重置。

初次送审须所有事项处理完、无待确认退料／损耗、物料实核仍有效、最新质检和草稿数量一致。提交令牌包含产出、质检、基准版和收尾事实；最终批准重新核对，变化时拒绝且整体回滚。更正沿用原批准的收尾证据，核对当前版、收货事实与本次检验，不能因历史退料后续变化重写原证据。批准节点决定、新版、有效指针、任务终态、审计和通知共享事务。

结构由追加迁移 `202609170001-production-output-revisions` 提供。旧收尾／终止／审批数据须通过开发重置清理，新结构不兼容读取旧记录。回退只允许尚无新业务事实的空结构；守卫和顺序见[迁移安全](../../../../../../../packages/database/docs/migration-safety.md)。正式测试集按用户要求暂缓，验收事项保留于路线图。
