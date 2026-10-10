# 生产报工、追溯与质量边界

> [返回 Production 数据库设计](README.md)。

本章所有计划、报工、异常、报废、补产授权与返工数量均为整数。普通正向事实的正常与异常数量可以分别为 `0`，但合计必须是 `1..99999999` 的整数；数据库以整数 `CHECK` 拒绝小数，路线放行、比较和累计只做整数运算，不使用缩放小数或误差阈值。

本章将“分批报工事实、异常整体处置、最小返工和报废补料”固化为当前可实施设计。异常处置仍以一次有效异常报工为最小审批对象，不拆分数量；返工以来源异常数量整体执行，完成时在同一事务内分别追加非零正常恢复与再次异常事实；报废补料由管理员从当前批次完整 BOM 基础中选择启用的精确物料版本并人工填量，同一审批事务生成工序报废、补产授权、补料单和追加需求。在线过程质检、自动质量放行和返工报工的部分完成仍不在当前范围；线下质检留存、正常或提前结束的实际产出审批遵守[结案设计](production-termination.md)，不改变本章的工序报工数量规则。

> CP-01 按已确认口径整改：报工承担执行记录与差异追溯，各道独立使用统一首工上限，执行状态由明确动作维护。下文统一维护目标规则，代码集成及验证状态见[路线图](../../../../../../../docs/roadmap.md#cp-01报工数量解耦与管理员批量冲销整改)；文档同步不表示用户验收或正式测试通过。

## 4.1 `batch_step_records`

职责：作为生产批次内每道路线工序的执行节点，保存路线快照、派工、开工、完工和现场覆盖信息。它是可变的执行状态载体，不再保存累计报工数量；每次报工事实由 `batch_step_reports` 独立记录。

| 字段                                   | 类型              | 说明                                                    |
| -------------------------------------- | ----------------- | ------------------------------------------------------- |
| `id`                                   | `BIGINT UNSIGNED` | 主键，自增                                              |
| `production_batch_id`                  | `BIGINT UNSIGNED` | 生产批次 ID                                             |
| `route_step_id`                        | `BIGINT UNSIGNED` | 路线步骤 ID                                             |
| `step_order_snapshot`                  | `INT`             | 工序顺序快照                                            |
| `step_code_snapshot`                   | `VARCHAR(100)`    | 工序编码快照                                            |
| `step_name_snapshot`                   | `VARCHAR(100)`    | 工序名称快照                                            |
| `sop_file_id_snapshot`                 | `BIGINT UNSIGNED` | 路线默认 SOP 文件 ID 快照，可为空                       |
| `sop_file_name_snapshot`               | `VARCHAR(255)`    | 路线默认 SOP 文件名快照                                 |
| `sop_object_key_snapshot`              | `VARCHAR(500)`    | 路线默认 SOP 对象键快照                                 |
| `sop_version_no_snapshot`              | `VARCHAR(64)`     | 路线默认 SOP 版本号快照                                 |
| `default_responsible_user_id_snapshot` | `BIGINT UNSIGNED` | 路线默认负责人快照，可为空；仅作为派工建议              |
| `actual_sop_file_id`                   | `BIGINT UNSIGNED` | 现场实际 SOP 文件 ID；为空时使用默认快照                |
| `actual_sop_file_name_snapshot`        | `VARCHAR(255)`    | 现场实际 SOP 文件名快照                                 |
| `actual_sop_object_key_snapshot`       | `VARCHAR(500)`    | 现场实际 SOP 对象键快照                                 |
| `actual_sop_version_no_snapshot`       | `VARCHAR(64)`     | 现场实际 SOP 版本号快照                                 |
| `responsible_user_id`                  | `BIGINT UNSIGNED` | 管理员确认派工后的现场实际负责人；待派工时为空          |
| `need_inspection_snapshot`             | `TINYINT`         | 创建时冻结的必须检验标志，默认 `0`                      |
| `status`                               | `VARCHAR(30)`     | 工序执行状态：`pending`、`assigned`、`doing`、`completed`、`terminated` |
| `started_at`                           | `DATETIME`        | 开工时间                                                |
| `completed_at`                         | `DATETIME`        | 完工时间                                                |
| `unit_snapshot`                        | `VARCHAR(20)`     | 本工序默认报工单位快照                                  |
| `remark`                               | `TEXT`            | 工序执行备注，不是单次报工备注                          |
| `version`                              | `INT`             | 乐观锁版本号，默认 `0`                                  |
| 业务审计字段                           | 见统一规则        | 可变执行节点审计字段                                    |

约束：

- `production_batch_id -> production_batches.id`
- `route_step_id -> process_route_steps.id`
- `default_responsible_user_id_snapshot -> users.id ON DELETE SET NULL`
- `responsible_user_id -> users.id ON DELETE SET NULL`
- `actual_sop_file_id -> technical_files.id ON DELETE SET NULL`
- `UNIQUE (production_batch_id, route_step_id)`
- `UNIQUE (id, production_batch_id)`，供报工事实使用组合外键，数据库层阻止跨批次挂错工序
- 快照字段 `need_inspection_snapshot` 只允许 `0` 或 `1`
- 当前状态检查：`CHECK (status IN ('pending', 'assigned', 'doing', 'completed', 'terminated'))`
- 完工时必须存在 `started_at`、`completed_at`，并满足 `completed_at >= started_at`

创建生产批次时按路线步骤生成记录并复制默认快照（SOP、负责人、工序信息、必须检验标志），所有记录均以 `pending` 创建，且 `responsible_user_id` 为空。`default_responsible_user_id_snapshot` 只用于在管理员派工界面预选负责人，不代表已经派工；管理员明确确认后才把所选用户写入 `responsible_user_id` 并把该工序转为 `assigned`。后续修改工序或路线不得回写已生成记录。现场可仅覆盖已生成步骤的实际 SOP 与实际负责人，不能增删或重排工序；实际 SOP 变更必须同步冻结文件名、对象键与版本号快照，并以工序记录 `version` 乐观锁更新。

`batch_step_records.status` 只表达工序执行进度，不表达异常审批进度。工序可以保持 `doing`，同时具有待处理异常；页面上的“存在待处理异常”“返工处理中”等标志必须从 `batch_step_abnormal_dispositions` 和返工数据派生，不得复用执行状态。追加 migration、共享常量和契约已移除历史兼容值 `abnormal`；如升级前真实数据仍存在该值，migration 必须在首个永久 DDL 前失败，由部署人员先根据实际进度更正为执行状态，不得由 migration 猜测。

收尾时未完成工序使用 `terminated`，新增 `closeout_id/terminated_by/terminated_at/termination_reason`，组合 FK 校验与收尾批次一致；终止须有完整事实且正常完成时间为空，其他状态这些字段为空。处理前状态留在不可变收尾行动中，原负责人和报工不改写。任务进入结案后员工只读，不再允许派工和实际开工／返工执行；管理员无在审申请时可按本章办理限定的历史更正。具体字段及操作见[收尾设计](production-termination.md)。

### 4.1.1 派工与执行状态机

| 状态 | 业务含义 | 进入条件 |
| --- | --- | --- |
| `pending` | 等待管理员确认当前办理人 | 创建任务，或尚未开工且无报工历史时撤回派工 |
| `assigned` | 已派工，尚未开始 | 明确派工；不开放撤销误开工退回此状态 |
| `doing` | 当前工序作业进行中 | 明确开始，或执行期间明确重开 |
| `completed` | 当前工序作业已明确结束 | 当前办理人或管理员明确完成，不按数量推断 |
| `terminated` | 随任务提前结束而停止执行 | 收尾逐项终止，保留原报工和终止说明 |

普通状态转换为 `pending -> assigned -> doing -> completed`，执行期间允许 `completed -> doing` 明确重开；收尾可将 `pending/assigned/doing` 逐项终止。报工、冲销、替代更正、返工完成及补产授权生效均不隐式改变工序状态。

- 派工、撤回与改派使用明确命令；当前负责人不是批次负责人或路线默认负责人。执行中改派、结案冻结及撤回条件统一见下方“派工边界”。
- 第一次首工开工继续检查领料／短批资格，并推进任务和工单、记录首次开工及消费短批授权。已开始任务内的后续工序只检查任务可执行和当前派工，不依赖前工序正常数量；不提供撤销误开工或回滚首次任务开工／授权消费的入口。
- 普通新增报工只允许任务执行中的 `doing` 工序，完成后须明确重开才能继续新增。已有报工的冲销及更正按独立资格办理，不要求先重开；完整门禁见下方[执行、结案与纠错权限](#执行结案与纠错权限已确认)。
- 完成与重开分别记录实际操作者、记录时间和状态前后值。报工时间不代替开完工时间，也不开放任意目标状态更新。
- 任务物料状态与工序执行状态独立；`material_assigned` 不会将工序自动派工。

#### 4.1.2 工序完工规则

完成表示该道作业已经结束，正常目标和报工百分比仅辅助核对。即使报工比例低于 100% 也可以明确完成；任务正常结束仍核对全部工序明确完成和所属物料规则。研发无路线工序，继续使用任务级开始／结束，不伪造免报工节点。

### 工序命令与 SOP 权限

派工、撤回、改派、开始、完成及重开均以任务／工序双重上下文定位并提交工序 `version`；派工／改派明确 `responsibleUserId`，重开填写原因。状态命令使用原状态校验与乐观锁，禁止发送 `Idempotency-Key`；完成／重开请求结果未知时先刷新核对，不能假定重复请求会重放旧结果。派工权限为 `production:steps:assign`；员工开始／完成／重开复用 `production:steps:start`，另核当前任务阶段和办理人；管理员代办使用 `production:steps:manage-execution`。不开放状态历史更正或撤销误开工写命令。报工命令的幂等规则独立维护。

SOP 内容从任务工序的默认或现场实际快照解析文件名、对象键及版本，不能读取当前工序配置替代历史快照。管理端采用 `production:tasks:view`；员工端采用 `production:worker-tasks:view`，且查询强制 `responsible_user_id` 为当前用户。其他消费页面须有匹配自身查看权限的端点并复用同一快照服务，不得扩大员工接口数据范围。

### `batch_step_execution_actions`

职责：不可变的工序执行动作事实，由明确开始、完成及重开追加；工序详情直接分页读取，不从全局审计还原。既有状态历史更正事实保留只读，不代表当前仍开放该命令。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | 主键 |
| `production_batch_id` / `batch_step_record_id` | `BIGINT UNSIGNED` | 所属任务、工序，组合外键保证同源 |
| `action_type` | `VARCHAR(30)` | 当前写入 `start/complete/reopen`；`correct_history` 仅保留既有历史读取 |
| `correction_type` | `VARCHAR(30)` | 当前写入为空；既有历史更正保留 `undo_start/complete/reopen` |
| `before_status` / `after_status` | `VARCHAR(30)` | 动作前后状态 |
| `before_started_at` / `after_started_at` | `DATETIME` | 动作前后开工时间，可空 |
| `before_completed_at` / `after_completed_at` | `DATETIME` | 动作前后完工时间，可空 |
| `reason` | `VARCHAR(1000)` | 重开必填；普通开始／完成为空；既有历史更正原因只读保留 |
| `step_version` | `INT` | 动作后的工序版本，大于零 |
| `created_by` / `created_at` | `BIGINT UNSIGNED` / `DATETIME` | 实际操作者和真实记录时间，均非空 |

`UNIQUE(batch_step_record_id,step_version)` 防止同一次状态变更重复记账；工序／任务组合引用和操作者引用由外键保护。CHECK 限定明确的动作转换、原因与更正类型及时间先后，触发器拒绝 UPDATE/DELETE。工序变更、动作事实和成功审计同事务提交；失败不留履历。旧工序没有动作事实时只显示已保存的当前状态，不猜造历史。既有逐项终止直接组合收尾行动事实显示，不在本表复制终止记录。

## 4.2 `batch_step_reports`

职责：记录每一次报工事实。同一工序允许分多次报工；已落库事实不得更新或删除，错误报工通过一条等量冲销事实撤回。有权操作者更正必须在一个命令和一个数据库事务内同时写入“原记录冲销 + 更正后的新记录”。

| 字段                     | 类型              | 说明                                                                 |
| ------------------------ | ----------------- | -------------------------------------------------------------------- |
| `id`                     | `BIGINT UNSIGNED` | 主键，自增                                                           |
| `report_no`              | `VARCHAR(100)`    | 报工事实编号，唯一                |
| `production_batch_id`    | `BIGINT UNSIGNED` | 生产批次 ID                                                          |
| `batch_step_record_id`   | `BIGINT UNSIGNED` | 工序执行节点 ID                                                      |
| `report_type`            | `VARCHAR(20)`     | `normal` 正向报工事实、`reversal` 冲销事实；不表示正常品/异常品分类  |
| `reversal_of_report_id`  | `BIGINT UNSIGNED` | 冲销的原报工 ID；普通报工为空                                       |
| `replaces_report_id`     | `BIGINT UNSIGNED` | 更正后的普通报工所替代的原报工 ID；非更正报工为空                    |
| `reported_quantity`      | `INT`   | 本事实的报工总数，必须大于 `0`                                      |
| `normal_quantity`        | `INT`   | 本事实中工序层面的正常数量，不等同于质检合格数量                     |
| `abnormal_quantity`      | `INT`   | 本事实中工序层面的异常数量；异常不自动等同于报废                     |
| `abnormal_origin`        | `VARCHAR(30)`     | 有异常时必填：`current_step` 当前工序异常、`previous_step` 前置异常  |
| `unit_snapshot`          | `VARCHAR(20)`     | 本次报工单位快照                                                     |
| `remark`                 | `TEXT`            | 本次报工、冲销或更正原因                                             |
| `created_by`             | `BIGINT UNSIGNED` | 实际提交该事实的用户                                                 |
| `created_at`             | `DATETIME`        | 事实创建时间                                                         |

数据库约束：

- `UNIQUE (report_no)`
- `(batch_step_record_id, production_batch_id) -> batch_step_records(id, production_batch_id)`
- 冲销和替代引用也使用 `(id, batch_step_record_id, production_batch_id)` 组合外键，禁止跨工序或跨批次关联
- `UNIQUE (reversal_of_report_id)`：一条事实最多被冲销一次
- `UNIQUE (replaces_report_id)`：一条事实最多被一条更正事实替代
- `normal_quantity >= 0`、`abnormal_quantity >= 0`
- `reported_quantity > 0`
- `normal_quantity + abnormal_quantity = reported_quantity`
- `abnormal_quantity = 0` 时 `abnormal_origin IS NULL`；大于 `0` 时来源必须是 `current_step/previous_step`
- `normal` 的 `reversal_of_report_id` 必须为空；`reversal` 必须引用原事实且不得再填写 `replaces_report_id`
- 表只保存 `created_by/created_at`，不提供更新、软删除或删除审计字段

### 4.2.1 有效数量

冲销行保存与原事实完全相同的三个绝对数量，查询时按类型决定正负号。下式中的 `normal` 指 `report_type = 'normal'` 的正向报工事实，包含直接正常、直接异常、混合及返工完成报工，不表示正常品：

```text
effective_reported = SUM(normal.reported_quantity) - SUM(reversal.reported_quantity)
effective_normal   = SUM(normal.normal_quantity)   - SUM(reversal.normal_quantity)
effective_abnormal = SUM(normal.abnormal_quantity) - SUM(reversal.abnormal_quantity)
```

以上是包含直接报工和返工完成的全部净量。直接正常／异常净量分别记为 `DN/DA`，返工完成正常／再次异常净量分别记为 `RN/RA`；每项均按所属正向事实减去对应冲销计算。直接净量须排除 `rework_records.completed_normal_report_id`、`completed_abnormal_report_id` 指向的两类结果报工及以任一结果为原单的冲销，不能仅按报工类型或数量判断来源：

```text
D  = DN + DA                  // 直接报工净量
N  = DN + RN = effective_normal
A  = DA + RA = effective_abnormal
E  = D + RN + RA = effective_reported
RN = N - DN                   // 跨轮返工恢复正常净量
```

工序“已报”与统一上限比较时使用 `D`，见[统一首工上限](#统一首工上限已确认)。异常处置摘要的累计直接异常使用 `DA`；`A` 还包含各轮返工再次异常的登记净量，不能当作待处理数量或唯一异常对象数量。返工恢复不自动扣除来源异常事实，待处理量必须按处置／返工当前状态另行读取。

`batch_step_records` 不缓存这些汇总。列表、详情和校验必须从 `batch_step_reports` 聚合；如以后为性能增加汇总视图，它也只能是只读派生数据。

基础工序记录返回模型把全部净量 `effective_reported` 映射到 `outputQuantity`、把 `effective_normal` 映射到 `normalQuantity`。生产执行投影另以 `effectiveDirectReportedQuantity`、`effectiveDirectNormalQuantity`、`effectiveDirectAbnormalQuantity` 返回 `D/DN/DA`，以 `effectiveNormalQuantity` 返回 `N`；不能把全部净量当作直接投入。正常量不表示“正常数量已经质检合格”。数量直接从报工事实派生；契约、读取映射与批次创建幂等结果 codec 同步使用明确名称，不提供原 `qualifiedQuantity` 别名或双字段兼容。

### 4.2.2 普通报工、冲销和更正

- 普通报工只插入 `normal` 事实，不得覆盖同工序的历史行。
- 员工任务页把普通报工拆成“正常报工”和“异常报工”两个独立业务意图。普通报工创建命令必须保证 `normal_quantity` 与 `abnormal_quantity` 恰好只有一个大于 `0`：正常报工固定异常量为 `0`，异常报工固定正常量为 `0` 并要求填写 `abnormal_origin`。同一批现场结果包含正常和异常数量时，应连续提交两条独立事实，不得在一次普通报工中混报。
- 冻结路线首工序不存在前置工序，异常报工只能选择 `current_step`；前端不得展示 `previous_step` 选项，后端必须根据同批次冻结工序顺序再次校验并拒绝绕过前端的请求。不得只按 `step_order_snapshot = 1` 判断首工序，应以该批次按 `step_order_snapshot,id` 排序后的首条工序为准，否则会留下无法确定前置补料计算范围的异常事实。
- 当前普通报工、正常报工替代及返工完成子事实均只表达一种数量。返工完成请求仍按整单提交正常与再次异常结果，由同一事务拆分，完整关联见返工章节；不得把返工子事实当普通新增报工。
- 通用单条／批量冲销仅适用于仍有效、无具体业务依赖的纯正常普通报工；异常报工使用下述待处置驳回规则，返工结果与混合记录不能通过通用入口操作。冲销数量、正常数量、异常数量和单位必须与原事实一致；禁止部分冲销、冲销冲销行或重复冲销。
- 通用更正仅接收 `normalQuantity`、`reason` 和 `version`，原单必须为仍有效、无具体业务依赖的纯正常普通报工；禁止通过更正改成异常或混合类型。数量为替代记录的完整正整数数量，不是差额；零量取消应使用全量冲销。异常报工不提供数量更正，待处置时由管理员驳回并退回重报，已批准处置及返工结果继续保护。
- 更正不是先冲销后由客户端另发一次普通报工。单个更正命令必须同时插入冲销行和新的纯正常行；新行以 `replaces_report_id` 指向被更正的原行。任一校验、审计或结果保存失败时全部回滚。
- 已完成工序在任务执行期间禁止普通新增正常／异常报工，明确重开后才可继续新增；已有报工的冲销与更正保留原资格，数量变动不改变执行状态。员工与管理员的资格、结案历史纠错范围和审批冻结统一见下方权限边界。
- `report_no` 是业务事实编号，不代替 HTTP 幂等键。客户端原始 `Idempotency-Key` 只进入平台幂等记录，绝不能写入本表。

#### 报工只读分类、关系与详情

报工列表和单条详情使用独立 `BatchStepReportView`／`BatchStepReportDetail`，写命令、命令结果及严格幂等快照仍使用基础 `BatchStepReportItem`。数量字段继续返回事实中的非负绝对数量；管理端只在展示冲销行时取负号，不能把展示数量送回写接口或再次冲销汇总。展示分类 `sourceKind` 先识别冲销，再按 `rework_records.completed_normal_report_id`、`completed_abnormal_report_id` 识别返工完成，最后区分直接正常、直接异常及历史混合事实。两类返工子报工均为 `rework_completion`，恢复正常与残余异常由返工单的明确结果引用区分；不能用 `report_type=normal`、当前数量或说明文字推断返工来源。

分页列表按页批量投影真实冲销原报工、更正原报工、已形成的冲销和替代报工引用，引用同时携带报工 ID、真实 `report_no`、任务及工序身份，不依赖关联记录是否在当前页。已有异常处置、替代、返工来源、返工完成及报废依赖使用同一事实来源展示；有独立编号的记录返回真实业务编号，报废事实没有独立编号时只保留事实 ID，禁止自行拼造。基础更正资格和具体依赖保护继续由原业务规则计算，展示关系不授予写入资格。

`GET /api/production/batches/:batchId/step-records/:recordId/reports/:reportId` 提供授权只读详情，与报工分页同样接受 `production:tasks:view`、`production:trace:view`、`production:worker-tasks:view` 中任意一项。只有员工查看权限时，查询必须核验当前工序负责人是当前用户；历史报工人或来源负责人快照本身不扩大报工读取范围；员工不提供独立返工列表或办理入口。三个路径 ID 必须是正整数字符串，且任务、工序、报工严格同源；不能通过错配或非法 ID 读取其他记录。

详情的 `processingChain` 只组合当前报工的来源返工片段和本身异常处置片段：来源报工 → 异常处置 → 返工单 → 正常恢复／残余异常报工。`completedNormalReport`、`completedAbnormalReport` 分别返回真实结果引用，数量为零的一侧为空；残余异常结果保留它自己生成的新处置片段，可沿真实报工引用逐笔导航。未批准返工、未完成返工或报废分支不生成虚假的返工／结果节点。返工读取使用独立 `ReworkRecordView` 返回两类完成单号与数量；基础返工命令结果见[返工模型](#45-rework_records当前最小返工)。这些投影只组合 Production 已有事实，不创建可写汇总或另一个业务状态。

#### CP-01 报工整改边界

##### 调整方向总览

数量解耦、统一上限、保留工序执行状态、执行阶段员工状态／报工纠错、结案后管理员历史更正、管理员批量冲销及执行中改派均已确认。工序状态与报工数量占比并列展示，不再按数量自动完工或重开；改派只切换当前办理人，不表达交接过程。以下集中维护整改目标，实施和验收清单见[路线图](../../../../../../../docs/roadmap.md#cp-01报工数量解耦与管理员批量冲销整改)。

1. 相邻工序数量硬限制改为差异提示，各道独立遵守计划量加有效补产授权的统一上限。
2. 保留派工、开工、完成与终止的执行含义；完成改为明确动作，数量变化不自动完工或重开。
3. 同时展示工序状态和“已报／上限”百分比，报工比例不代替真实作业进度、质量或在制品余额。
4. 任务执行期间员工可办理本人工序报工与纠错，工序完成即停止普通新增报工，明确重开后才恢复新增资格；已有事实纠错资格在管理员结束任务进入结案时收回。
5. 管理员提供同任务跨工序批量冲销；保留具体业务引用保护、预览、逐条事实和整体事务。
6. 结案中／批准后的普通正常报工历史纠错仅限管理员，在审双方冻结；不开放状态历史更正或撤销误开工，已有状态历史保持只读。报工更正不恢复执行资格，原审批快照与库存事实保持独立。
7. 报工和执行状态动作的正常追溯使用 Production 自有业务事实，全局操作日志只作审计兜底；报工操作者不被解释为实际加工人或当时的派工负责人。
8. 管理员在任务执行期间可以改派当前办理人，不重置工序状态、数量或历史报工，不自动改派返工单；无需交接表。任务进入结案后停止改派，历史更正不恢复该资格。

**记录与依赖规则：**

- 报工承担执行记录和差异追溯，汇总不作为可靠的在制品余额或相邻工序的实物放行凭证。同一道工序继续支持多次报工、净量汇总、全量冲销及同事务冲销／替代更正，原事实和操作人、时间、原因均保留。
- 相邻工序之间的报工数量差异只提示，不以“前道实际正常量不足”限制后道报工，也不因上游冲销／更正后低于下游累计而拒绝。A／B 原来各报 5，A 更正为 4 时允许保留 4／5 的差异；系统不自动减少 B 的真实报工，管理员核实 B 也有误时另行更正。
- 各道工序统一采用首工投入上限兜底，公式见下一小节；它来自计划和有效补产授权，不随首工实际报工被冲销而降低。不再按补产截止工序为后道另设较小的投入硬上限。
- 任务仍在执行中时，日常报工、冲销与更正权限下放到本人负责工序的员工，每次操作保留真实操作者、时间及原／新事实。管理员结束执行或提前停止、任务进入结案后，员工报工写入资格立即收回，历史纠错仅管理员可办理；具体阶段及审批冻结见下节。管理员保留代办及同任务跨工序批量冲销能力，不以页面权限代替后端数据范围校验。
- 数量差异与具体来源依赖分别处理。当前已存在异常处置、返工、报废、补料或其他直接业务引用的报工，仍不能通过通用冲销／更正绕过对应业务规则；没有合法解除入口的依赖应明确阻断。仅有相邻工序累计数量关系不构成这种引用。报工纠错不自动冲销领料、批准产出或库存事实。

原两种下游比较口径及其冲突证据保留在 [CP-01](../../../../../../../docs/documentation-conflicts.md#cp-01)；本次裁决取消该数量硬依赖，不再在二者中选择一种作为上游冲销下限。

##### 统一首工上限（已确认）

`Q` 为任务计划量；`S[j]` 为额度截止工序位于第 j 道、关联补料单已 `fulfilled` 的不可变补产授权数量之和。只有对应补料履约才计入，待审、待料或部分领料不生效。每道工序 i 的兜底与剩余可报数量为：

```text
U                      = Q + SUM(S[j], 全路线)
direct_report_limit[i]  = U
available_report[i]     = MAX(0, U - effective_direct_reported[i])
```

例如计划 5、路线 A→B→C，B 工序补产 1 的授权已生效，A／B／C 的普通报工上限均为 6。各道采用相同兜底，避免将记录资格重新绑定到工序之间的投入传播。

- 上限按每道工序自己的 `effective_direct_reported` 净累计校验，不把整条路线报工相加共用一个可消耗池；直接正常和异常都计入，返工完成不重复计入。冲销在事实聚合中扣回一次，不能再额外加一份额度。
- 首工上限不是首工实际已报量。上游由 5 更正为 4 不会把 `U` 改成 4，也不要求下游同步更正或等待前道补录。
- `supplementSources`、已激活投入增量和待激活投入增量均覆盖全路线；后道也能看到造成统一上限变化的前道来源。仅建议正常目标及其 `activatedSupplementTargetQuantity` 按当前工序之后的授权计算，不能混用两种范围。
- 上限为 6 不表示每道工序都必须完成正常量 6，不能把 `U` 直接复制为 `required_normal`。统一口径允许后道在批次上限内超出路径建议量；路径、目标与实际报工的偏差用于核对提示，不暗中恢复更小的投入硬门禁。正常目标及结束状态的联动遵守下节规则。
- 普通新增或替代更正不得使本工序直接报工净量超过 `U`；真实超授权产出仍需通过明确的授权方案处理，不能通过重复返工或改动上游历史取得额外额度。本项不新增任意手填额度入口。

##### 执行记录额度分布（已确认）

执行记录页及报工弹窗保留执行状态，数量摘要使用报工额度分布，不把数量占比当作工序进度或状态，也不新增可写汇总字段。正常量 `N` 包含直接正常和返工恢复；已报废 `S` 只取同源报废事实；处理中 `P` 只取有效异常分支当前的待审核、待返工和返工中数量；明确终止处置或取消未完成返工后尚未恢复的数量记为 `T`，独立展示为“已终止未恢复”：

```text
D = 直接正常净量 + 直接异常净量
P = 待审核数量 + 待返工数量 + 返工中数量
剩余额度 = U - D
N + S + P + T + 剩余额度 = U   // 仅来源链完整且分类可信时成立
```

- 执行记录及员工任务分页读取分别采用单个 `REPEATABLE READ` 只读事务及一致性快照。`BatchStepExecutionRecordItem.quotaDistribution` 和 `ProductionWorkerTaskItem.quotaDistribution` 复用相同的事实分类策略，并与各自同工序的 `N/U/available` 从同一次快照返回；处理阶段的最小来源引用也来自同一快照，不能拼接另一次返工列表请求或某页报工明细反推分布。`isReliable=true` 要求来源链完整、分类互斥及上述等式成立，不能仅凭总数碰巧相等认定可信。
- 员工任务仍按当前本人负责工序服务端分页，分类的报工、处置、返工、报废四类事实仅为当前页已授权工序批量读取，不按工序、批次或返工深度追加查询。页内批次的路线汇总只批量读取一次，以保留原前道差等数量投影，不返回其他工序的事实或来源引用；不新增全量员工查询入口，不改变读取权限。报工弹窗直接使用所属读取上下文中的分类，命令请求、基础数量结果及幂等快照不增加分类字段。
- 分类从仍有效的直接报工根沿整单返工来源逐轮读取。已完成返工的整单量退出 `P`，按明确引用核对正常与异常两个子结果的同源、纯数量类型及合计；正常恢复子报工计入 `N` 并结束该分支，异常子报工沿其新处置继续分类。两子结果都不作为新的直接根，不重复累计旧轮次的异常量。报废必须存在同源、同量真实事实，不能只看处置的 `approved` 状态；待审核和未完成返工也不能用 `D-N-S` 补平。
- 合法驳回与来源全量同值冲销同时生效，该来源不再占用 `D`。有效来源仍被历史标为 `rejected/cancelled`、返工完成事实被冲销或更正、缺失或跨归属引用、重复／循环、数量或单位不符均返回 `isReliable=false`、分类量 `null` 及具体原因；页面显示待核对并保留原报工事实，不把未知量当零或重新解释处置结果。当前命令继续拒绝返工完成或混合来源的整笔驳回，历史保护规则不变。
- 有明确 `terminated` 处置或 `cancelled` 未完成返工的有效来源可归入 `T`，不归入处理中或已报废；有 `T` 时另列真实终止残量，不强凑正常／已报废／处理中／剩余额度四段。正常量不表示质检合格，分布也不是库存或可靠在制品余额。
- 页面“报工上限 101 = 计划 100 + 已报废补产 1”中的已报废补产只包含关联补料已履约的有效授权，生效定义仍见[统一首工上限](#统一首工上限已确认)。待履约授权另列待生效报废补产，不能把全部已报废数量 `S` 直接加入上限。路径建议正常目标及其目标差保留原只读公式和其他消费方，执行记录页及报工弹窗不再展示，前道差收纳为核对信息。
- 额度分布不触发完工，也不阻止明确完成；新增授权、冲销及返工结果只刷新数量，不自动改变工序状态。“剩余额度”仍是原可报数量投影，普通新增及更正写命令继续沿原统一上限、资格和具体依赖校验。
- 首末报工时间仅表示事实登记时间，不能据此回填实际开完工时间。“尚无报工历史”和“冲销后净量为零”也不能互相替代。

##### 执行、结案与纠错权限（已确认）

工序完成表示该道作业结束，同时停止员工和管理员的普通新增正常／异常报工；任务仍执行中时，已有报工的冲销／更正继续按独立资格办理。管理员结束任务执行／提前停止并进入 `closing`，立即收回全部员工写入资格，不等待最终批准为 `completed/terminated`。报工控制器仅从 Guard 已认证的用户权限计算管理、报工及全量历史读取能力，并与全局 Guard 复用 `permissionMatches` 的匹配语义；合法通配符授权必须与具体权限一致生效。员工的当前工序归属、任务阶段和审批冻结继续由业务层校验。

权限目录中的“工序报工”（`production:steps:report`）用于员工办理本人负责工序的日常报工、冲销和更正；“工序执行与报工管理”（`production:steps:manage-execution`）用于现场执行参数维护、管理员代办、结束任务执行、跨工序批量冲销及允许的普通正常报工历史纠错。执行期间普通报工、冲销和更正接受两项权限的任意一项，员工仍须满足当前工序归属。相关纯权限不足提示使用 [constants 中文名称映射](../../../../../../../packages/constants/src/permissions.ts) 中与目录一致的名称；中文名称仅用于提示，鉴权仍使用权限编码，映射与 Identity 只读权限目录随同一版本发布。任务阶段、审批冻结及业务依赖分别说明。权限边界如下。

| 阶段 | 工序负责人／员工 | 具备相应管理权限的管理员 |
| --- | --- | --- |
| 任务仍在执行，工序 `doing` | 剩余额度大于零时可新增本人负责工序的报工；可按资格冲销／更正已有事实或明确完成工序 | 可以代办，保留实际操作者 |
| 工序已完成，任务仍在执行 | 禁止普通新增报工，明确重开后才可新增；已有事实可冲销／更正 | 同样禁止普通新增，可代办重开、纠错及批量冲销 |
| 任务进入结案，当前无在审申请 | 全部只读，不得修改状态或报工 | 状态历史只读；可办理无具体依赖的普通正常报工历史纠错 |
| 初次结案或后续产出更正在审批 | 不得改动状态或报工 | 同样冻结；先由申请人撤回或有权审批人驳回，再办理更正 |
| 任务已批准结案，当前无在审申请 | 全部只读，原工序负责人不取得例外 | 状态历史只读；可办理无具体依赖的普通正常报工历史纠错 |

- 工序负责人显式开始／完成本人负责工序，任务仍执行中时可因误点完工或真实继续加工而明确重开，管理员可以代办。动作记录实际操作者与时间，不开放任意状态更新；任务执行结束／提前停止由管理员办理，最终结案沿用既有负责人审批。
- 普通新增报工同时要求任务仍执行、工序为 `doing`、原权限及当前归属有效、无审批冻结，且统一上限扣除当前直接报工净量后的 `availableReportQuantity` 大于零。员工和管理员读取投影均据此返回 `canReport/reportBlockedReason`，写命令在同一业务根锁内重算；额度为零明确禁用并提示核对既有报工或补产授权，不能因状态仍为 `doing` 而继续新增。新增授权仅刷新额度，已完成工序仍须明确重开。既有报工冲销／更正资格不受新增剩余量为零的限制，替代后的净量继续校验统一上限和具体依赖；结案后管理员纯正常历史补录／纠错仍按专用阶段及权限办理。
- 正常目标只作进度及差异提示，达到目标不自动结束，新增报工／冲销／更正不自动重开。未达目标可以明确完成，但仍保留统一投入上限和具体业务依赖；工序完成不代表质量合格或任务已经结案。后道开工不依赖前道实际报工量，继续保留派工、任务执行中及首工已领料／短批资格。
- 返工完成继续按来源整笔数量、返工执行状态和返工办理权限校验，不再以普通工序正常目标作硬上限，也不重复消耗普通投入或自动修改普通工序状态。补料齐套、出库及需求更正批准只按既有规则激活补产授权并刷新数量投影，不再自动重开普通工序；实际继续加工由当前工序负责人明确重开。
- 未决异常／返工继续显示并按自身规则处理，不因工序完成而一并结束。任务正常执行结束同步移除末道正常量必须等于计划量的旧门禁；物料履约、未决事项核对与最终产出审批继续按其所属规则办理。
- 保留状态的本轮方案继续以各工序明确完成作为正常执行结束的进度核对依据，不要求各道报工比例达到 100%；管理员可代办工序完成。提前停止沿用未完成工序逐项终止及其收尾事实，不把终止标成正常完成，也不迁移首工启动任务／工单及消费短批授权的职责。
- 员工状态与报工写入口必须在事务内核验任务仍可执行及本人工序归属；不能只隐藏员工端按钮。任务结束与员工操作并发时按共同业务根串行校验，旧页面不能在结束后继续提交。进入结案后，审批撤回、驳回或管理员纠错均不恢复员工写入资格，也不重新开启任务执行。
- 管理员通过专用历史纠错命令补录／冲销／更正纯正常普通报工，仍校验统一上限、有效事实、权限、版本及依赖。新增异常、正常改异常、返工完成事实（即使结果全正常）及已有异常处置／报废／补料引用继续受保护，不借历史纠错生成新执行任务。结案后异常补录与处置不纳入本次，真正新增生产另建任务。
- 不开放管理员状态历史更正及撤销误开工命令；既有动作事实、原因、操作者和前后时间只读保留。当前状态只能通过正常执行动作及已有逐项收尾终止推进，不以历史补录改变状态或恢复生产资格。
- 历史纠错保留真实操作者、录入时间和原因，不能回填 `created_at` 冒充当时录入；额外采集实际作业发生时间不作为本次要求。任务、工序、原批准产出、检验及库存事实不随报工纠错改变。结案前未实际开始的工序不因历史纠错而伪造开完工履历。
- 当前审批 JSON 快照已冻结 `reportedNormalQuantity`，已有批准版后的产出更正沿用原 `snapshot.check`，原审批依据的留存已实现，无需新增快照或相应数据库字段。复用原快照与最新事实聚合，分别展示原审批量、当前净报工及更正差额；读取模型使用独立字段承载批准时数量与当前数量，不以实时 header 覆盖原审批依据。纯报工历史纠错不自动重审产出；产出本身有错才走现有产出更正。

##### 工序状态误操作（已确认）

报工数量填错直接走冲销／原子更正，不要求先重开；工序状态点错通过以下明确动作纠正，不以修改报工量间接改变状态：

- 本人负责工序的“重新打开”同时覆盖实际继续加工和误点完工，任务仍执行中时从 `completed` 回到 `doing`，管理员可代办。明确记录原因、操作者及时间，保留此前完工历史，不改报工事实、不联动上下游状态；进入结案后员工不可借此恢复写入资格。
- 本轮不提供员工或管理员退回未开工的接口，也不开放撤销误开工。首工开工还会推进任务／工单状态、消耗短批授权，即使报工净量为零，也不能直接撤销整条开工链；原始状态动作及真实任务开工、授权事实保持可追溯。
- 状态动作与管理员结束任务共用业务根锁和版本校验；再次完工或重开不能覆盖此前操作历史，也不能将正常／异常数量变化重新变成自动完工或自动重开的触发器。

##### 派工边界（已确认）

- 保留管理员明确派工和开工前撤回；任务执行期间，即使工序已开工、已完成或已有报工，也允许管理员通过专用改派命令切换当前办理人。新负责人须符合既有身份及受派资格，改派不改变工序状态、开完工时间、净报工或补产授权。
- 新负责人取得当前工序的员工操作资格，原负责人失去该工序写入权限。报工、完成、重开与改派共用工序版本及兼容锁序；旧负责人从旧页面提交时后端按当前归属拒绝，不能以曾经派工或曾经报工绕过。
- 已有报工继续保留原 `created_by/created_at`，新负责人更正旧报工时由原子更正链同时表达原事实及本次实际更正人。管理员代报的实际提交人是管理员，不推断实际加工人；当前负责人也不用于回填历史报工人。
- 返工由具备返工办理权限的生产管理人员办理，普通工序改派不改变已有返工的来源快照，也不授予或撤销返工办理权。任务进入结案后不再派工、撤回或改派，管理员报工历史纠错不授予这一例外。
- 本轮不表达完整的负责人交接过程，也不承诺查询每个历史时点的责任归属；不新增交接事实表。执行中改派是当前办理权的变更，不等于追溯链缺失后以 `operation_logs` 拼装交接业务。

##### 工序业务动作追溯

`batch_step_records` 保存当前负责人、状态及开完工时间；报工事实保存实际提交人和登记时间。多次状态动作通过 Production 专有事实追溯，全局 `operation_logs` 仅作审计兜底。

- 明确开工／完工及重开使用 Production 专有、不可变的执行动作事实，表 `batch_step_execution_actions`。保存任务／工序身份、动作类型、前后状态及相关业务时间、实际操作者、真实记录时间、原因和动作后的工序版本。既有历史更正事实继续读取，不再提供更正写入口。业务时间与记录时间分别表达，不从报工时间猜造开完工履历，不回填 `created_at` 冒充原时点操作。字段与约束见专表设计。
- 当前工序行继续表达当前状态和负责人，动作事实用于工序详情的业务历史。当前行更新、动作事实、成功审计同事务提交；按版本或幂等结果重放时不得再次追加动作。动作类型必须对应明确的应用命令，不建设可写任意状态／字段的通用变更接口。
- 已有收尾终止使用 `production_batch_closeout_action` 等所属事实追溯；工序时间线可组合这些已有事实，不再复制一份终止业务事实。报工及更正历史继续读取 `batch_step_reports`，返工继续读取自身业务记录，全局 `operation_logs` 仅辅助审计和排障。
- 不新增负责人交接表，也不以全局审计拼装交接业务；改派沿用当前负责人字段及事务审计。若未来需要完整派工业务历史，单独定稿，不能宣称本轮已支持。执行动作事实只记录状态动作，不将每次改派冒充状态变化。
- 保留工序状态可以沿用现有状态列和约束；支持专有执行动作历史仍需追加成对 migration，不能以“全局日志已有 JSON”推断整个整改无需数据库变更。不得修改已执行 migration 或猜造旧完工历史；开发测试库按统一初始化约定恢复。

##### 审批流程复用边界

- 复用 [Approval 的撤回、驳回与重新送审](../../../approval/README.md#配置与操作)：申请人本人撤回，或当前有权审批人驳回，修改后从首节点建立新申请，旧申请和证据保留；管理员身份本身不授予撤回他人申请的权限。
- 现有 `ProductionCloseoutApprovalHandler.restoreAfterApprovalEnd` 调用产出 Repository 的 `restore`，清空 `pending_approval_id` 并回到待定稿，不把任务从结案恢复为执行中，也不恢复旧库存授权。既有 JSON 快照、重新送审及最终批准校验继续复用，不建设第二套审批或“纠错审批”。
- 状态／报工写入侧：正常状态动作、管理员报工历史纠错及批量入口在与送审／批准兼容的业务根锁下检查 `pending_approval_id`，在审一律拒绝，撤回／驳回后仍须重新校验阶段、办理资格及具体依赖。初次结案和已批准清单的后续更正在审都适用，不能只检查批次是否 `closing`。
- 审批撤回不会恢复执行阶段资格；管理员历史纠错使用独立入口。最终批准的快照一致性检查不能替代写前冻结检查。

##### 管理员批量冲销（已确认）

同一任务跨工序多选、预览影响及具体阻断、填写原因、逐条全量冲销、全部成功或全部回滚，并保留直接业务依赖保护。全链路级联撤销不属于本项，任务各阶段的可操作资格遵守上述执行权限及审批冻结规则；用户验收及正式测试见路线图：

- 一次选择同一生产任务下、多道工序的多条有效纯正常普通报工，逐条全量冲销。需要把单条 5 改为 4 时仍使用原子更正入口，不能将批量冲销后再补录描述为原子更正；批量替代更正另行确定，不混入本期冲销命令。
- 提交前预览明确的报工 ID、工序、原数量、各工序冲销前后净量、数量差异及不可冲销原因。统一填写本次原因；管理员可以明确移除阻断项后重新预览，系统不得静默跳过或自动增选上下游记录，不提供隐含“全部筛选结果”的选择。
- 后端独立鉴权，单次明确选择 1–100 条报工，校验非空及重复 ID、任务／工序归属、有效性、工序版本和具体依赖。批量不是绕过异常处置、返工完成或既有更正链的强制入口；返回每个阻断项及可定位依据。
- 预览返回 `previewToken`，覆盖任务阶段与版本、工序数量及版本、授权和具体依赖。提交必须携带同一令牌并在事务内重算比较；变化时整体拒绝并要求重新核对，不能把执行期预览静默当作结案历史纠错提交。幂等成功重放仍返回原事务结果。
- 正式提交在同一事务重新检查预览依据，按与任务结束／审批兼容的业务根、工序稳定顺序及报工 ID 顺序锁定；同一道选中多条时统一计算最终净量并更新版本，不按净量重新计算状态，不能循环提交单条 HTTP 请求或使自身版本递增造成中途失败。全部成功或全部回滚，不默认部分成功。
- 每条追加原事实的等量冲销，受影响工序版本更新、成功审计和批量幂等结果同事务提交；数量冲销不自动重开工序或任务。批量端点独立接入幂等执行器，同键同内容重放原结果；单条现行自然防重不等于批量已经具备结果重放能力。
- 本次操作与逐笔原／冲销事实通过结果及审计可关联；批量冲销复用 `batch_step_reports` 和管理报工权限，不新增报工表、可写累计或影子账本。专有状态动作表及权限目录调整由成对 migration `202610090001` 提供。

### 4.2.3 数量与并发约束

统一上限、直接报工净量和提示差异的公式见上方“统一首工上限”与“执行记录额度分布”。`required_normal[i] = Q + SUM(S[j], j > i)` 仅保留路线建议正常目标；不作为写入上限、完工条件或上游冲销下限。

- `batch_step_records` 和任务表不新增可写上限／进度列。上限由计划与不可变补产授权关联已履约补料单实时推导；物料需求数量不参与产品补产量相加，不从客户端接受授权额度。
- 正常与异常直接报工都消耗本工序上限；返工完成仍计入成果汇总，但不重复计入直接报工。冲销事实负向聚合一次，异常退回重报也不另加第二份额度。
- 计划 5，B 报废补产 1 且已履约时，A/B/C 上限均为 6；B 无须等待 A 形成第六个正常报工才可记录。A 更正到 4、B 保留 5 时仅提示差异。数量和补料变化均不改变工序状态。
- 报工写事务按工单、任务、结案根、工序 `step_order_snapshot,id`、报工 ID 的顺序锁定；锁后当前读核验版本、审批冻结、当前办理人、统一上限及具体依赖。管理员批量同工序多条只更新一次版本，不以客户端预览替代提交校验。
- 补料确认仍原子提交履约、库存事实、出库状态及审计；需求更正批准解除剩余可激活授权但不产生库存流水。两者仅刷新数量投影，不再重开工序。不可变授权行不更新，原质量和具体引用保护继续有效。
- 数量只表达现场自检与登记，不代表最终质检合格或可靠在制品余额。数据库负责结构和引用完整性，跨事实数量、全量同值冲销、资格与具体依赖由业务事务校验。

### 执行查询与分页

工序摘要统一返回上限、直接正常／异常净量、累计成果、数量差异、报工历史条数及首末登记时间；不内嵌全部报工历史。任务详情的派工、改派、撤回及 SOP 资格返回具体原因，写命令仍锁内重新核验。

报工记录、工序状态历史与员工工序均使用服务端分页。报工历史读取沿工序当前归属限制员工范围，管理／追溯页面使用各自查看权限；状态时间线组合执行动作与既有收尾终止事实。员工仅办理普通工序，不提供本人返工查询接口、专用契约或工作台；管理员在已有异常处置流程读取和办理返工，员工数量摘要仍从本人工序投影读取返工成果。前端进度不从某一页记录相加，跨页批量仅保存用户明确选中的记录。

#### 当前最小返工来源规则与升级预留

- 直接异常数量不增加正常完成量，但必须计入直接报工净量 `D` 并占用[统一首工上限](#统一首工上限已确认)；连续提交直接异常报工不得绕过数量上限。
- 每张返工单一次完成，由同一事务最多生成两条正向结果报工：正数正常恢复和正数残余异常各一条，零量侧不建事实。`rework_records` 的两个完成引用分别唯一指向子结果；合计必须等于来源异常数量，因此同一返工来源不能重复消费。
- 最小返工不支持分批或部分完成。残余异常子报工照常生成新的异常处置单，可进入下一轮返工或报废补料；正常恢复子报工不生成异常处置，两类结果都保留原返工单来源与通用纠错保护。
- 半自动补料不增加生产批次计划量；批准时生成等量路线补产授权，全部补料需求完成确认领料后才允许执行，并从首工序向额度截止工序逐道传播。页面必须分别展示补料物流进度、补产起点、受影响路径、各工序新增正常目标和剩余可报量，不得把人工填写的物料数量展示成产品补产数量，也不得在来源工序直接显示“可补报”。
- 当前补产额度以唯一的工序报废补产授权为事实，足以闭合整笔报废补产；当前不记录某次补报逐笔消费哪张授权。后续若需要部分执行、指定来源消费、返工分批产出或短批完工，必须追加独立消费事实和版本化接口，不得改变已落库报工事实。

### 4.2.4 事务、幂等与审计

- 创建报工、更正报工都是没有可复现自然业务键的新增事实命令，必须接入项目 HTTP 幂等执行器后才能开放接口。
- 一次命令中的报工事实、冲销/替代事实、工序状态与时间、成功 `operation_logs`、幂等成功结果必须使用同一数据库连接和同一事务提交。
- 响应丢失后的同键同指纹重试必须重放首次结果，不得重新执行当前数量和状态校验；同键不同指纹返回冲突。
- `report_no` 由首次执行生成并随结果快照保存；重放不得再生成编号。
- 返工完成使用 `production.rework.complete.v3` scope，严格快照保存 `rework`、可空 `normalReport`、可空 `abnormalReport` 与可空 `abnormalDisposition`；至少存在一个正数子结果，引用、同源身份、纯数量类型、整单合计及异常处置来源都须一致。同键重放返回首次生成的两个真实编号，不读取旧 scalar 结果或追加另一侧事实。
- 报工 application、HTTP、管理端和幂等闭环已经落地；后续修改仍须保持事实追加、同事务审计和同键重放规则。
- 已执行迁移 `202608100001-batch-step-reports` 的历史升级前置校验要求旧工序数据满足 `output_quantity = qualified_quantity + abnormal_quantity`、`rework_quantity = 0`，并且有正数报工的工序存在 `updated_by` 或 `created_by`。任一条件不满足时该迁移在首个永久 DDL 前失败，不猜测差额、返工归属或操作人。
- 该迁移把通过校验的旧工序累计量转为一条 `LEGACY-SR-{stepId}` 普通事实，旧 `qualified_quantity` 只按当时口径进入 `normal_quantity`，不追认其为质量结论。这是保留的历史迁移规则，不代表当前仍有这些工序累计列或批次数量列。

## 4.3 过程自检临时口径与未来质检边界

当前暂不实施工序间独立质检、抽检、复检、条件放行和质量放行事实。操作员报工中的 `normal_quantity` 表示该次自检正常记录；`effective_normal` 是事实净汇总，不作为下工序的可报额度。

质量边界：

- `need_inspection_snapshot` 继续作为路线快照保留，但当前不创建过程检验任务，也不阻塞下工序；应用和页面不得伪造“过程质检已通过”的结论。
- `normal_quantity` 只表示工序自检正常量，不是最终质量合格量。任务 `lastStepReportedQuantity` 从末工序报工派生，批次表不存报工汇总或合格数量；不得把任一道工序的 `effective_normal` 当作最终批准产出。
- 当前暂不考量生产过程中的质量检测流程。将来引入过程质量及放行约束须单独确认范围和独立事实模型，通过版本化契约迁移，不能静默改变 `normal_quantity` 的既有含义或恢复已取消的数量门禁。
- 任务结案已提供独立的线下质检留存记录和批准产出清单，但不包含在线检验任务或自动质量放行。完整质量模型仍需单独定稿，不为其预建批次合格数量写入口或推测性的最终质检表。

生产执行确认与最终产出处置分开。正常执行确认在事务内校验全部工序明确完成、需求及补料履约，不要求末道正常报工等于计划；服务端记录 `execution_completed_at/by`，创建 normal 结案草稿并进入 closing，不另存数量或立即 completed。最终质检记录和产线清单由工单负责人批准后才正常结案。提前停止走 early 逐项收尾，同用这一结案审批；管理员最终可用量允许短于计划，不反写报工或补产规则。质检只保存线下记录，审定数量由当前批准清单读取，两者均不双写批次数量。

现有草案曾使用 `inspection_records`，但检验批如何占用报工数量、多次/抽样检验、条件放行、复检和冲销仍未闭环，因此当前不得创建该表。

后续设计至少必须区分：工序执行节点 `batch_step_records`、具体报工事实 `batch_step_reports`、检验任务/结论和质量放行事实。不得继续把 `batch_step_record_id` 描述为“具体报工记录”；若质检针对某次报工，应显式关联 `batch_step_report_id` 或独立的受检批。

## 4.4 `batch_step_abnormal_dispositions`

职责：作为具体异常报工的审批处置单。一条 `batch_step_reports` 普通报工只要 `abnormal_quantity > 0`，就在同一报工事务中自动创建一条处置单；同一道工序可以因多次异常报工产生多条处置单。工序执行状态继续保存在 `batch_step_records.status`，不得增加汇总异常状态替代本表。

当前阶段不支持把同一次报工的异常数量拆成“部分返工、部分报废”；该次报工的全部异常数量只能整体批准为返工或报废。异常数量只以不可变的 `batch_step_reports.abnormal_quantity` 为事实来源，本表不重复保存数量。

| 字段                    | 类型              | 说明                                                        |
| ----------------------- | ----------------- | ----------------------------------------------------------- |
| `id`                    | `BIGINT UNSIGNED` | 主键，自增                                                  |
| `disposition_no`        | `VARCHAR(100)`    | 异常处置单号，唯一                                          |
| `production_batch_id`   | `BIGINT UNSIGNED` | 生产批次 ID                                                 |
| `batch_step_record_id`  | `BIGINT UNSIGNED` | 工序执行节点 ID                                             |
| `batch_step_report_id`  | `BIGINT UNSIGNED` | 来源普通报工 ID；当前阶段一条报工最多一张异常处置单          |
| `review_status`         | `VARCHAR(30)`     | `pending_review`、`approved`、`rejected`、`cancelled`、`terminated`       |
| `disposition_type`      | `VARCHAR(20)`     | 批准后的处置：`rework`、`scrap`；审批前为空                 |
| `reviewed_by`           | `BIGINT UNSIGNED` | 审批人；待审批时为空                                        |
| `reviewed_at`           | `DATETIME`        | 审批时间；待审批时为空                                      |
| `remark`                | `TEXT`            | 申请、审批、驳回或取消说明                                  |
| `version`               | `INT`             | 乐观锁版本号，默认 `0`                                      |
| 业务审计字段            | 见统一规则        | 可变业务单据审计字段                                        |

数据库约束：

- `UNIQUE (disposition_no)`
- `UNIQUE (batch_step_report_id)`，落实当前阶段“一次异常报工整体处置一次”的规则
- `(batch_step_report_id, batch_step_record_id, production_batch_id) -> batch_step_reports(id, batch_step_record_id, production_batch_id)`，禁止跨工序或跨批次挂错来源
- `reviewed_by -> users.id`
- `CHECK (review_status IN ('pending_review', 'approved', 'rejected', 'cancelled', 'terminated'))`
- `CHECK (disposition_type IS NULL OR disposition_type IN ('rework', 'scrap'))`
- `CHECK (version >= 0)`
- `pending_review` 必须满足 `disposition_type/reviewed_by/reviewed_at` 均为空
- `approved` 必须满足 `disposition_type/reviewed_by/reviewed_at` 均非空
- `rejected/cancelled` 必须满足 `disposition_type` 为空且 `reviewed_by/reviewed_at` 非空；`rejected` 命令必须同时追加来源报工冲销，`cancelled` 状态本身不改变来源事实；来源事实是否有效始终只由冲销链决定
- 索引：`INDEX (batch_step_record_id, review_status, created_at)`、`INDEX (production_batch_id, review_status, created_at)`

业务规则：

- 创建处置单前，application 必须确认来源是仍有效的 `normal` 报工且 `abnormal_quantity > 0`；冲销行和纯正常报工不得创建处置单。
- 普通状态转换为 `pending_review -> approved/rejected/cancelled`。`approved` 表示异常属实并选择返工或报废；`rejected` 只用于管理员确认整笔员工异常报工的数量或异常来源填写错误，并通过下述“驳回并退回重报”命令进入；`cancelled` 只用于来源报工已被其他合法冲销链终止后的处置单收口。终态处置单不得恢复为 `pending_review`。
- 审批使用 `version` 乐观锁。批准为 `rework` 时，在同一事务创建一条以本处置单为来源的 `rework_records`；批准为 `scrap` 时，审批请求必须按批次 BOM 基础选择至少一条启用的精确物料版本并填写数量，在同一事务创建 `batch_step_scrap_records`、`batch_step_scrap_reproduction_authorization`、`production_material_supplement` 和 `scrap_supplement` 需求。两个处置目标均对来源处置单建立唯一约束。
- 管理端批准报废前必须经过“编辑需求 -> 暂存需求 -> 复核并确定报废生成”三段交互。暂存写入 `production_scrap_supplement_plan/_line` 服务端草稿，不创建正式 `production_item_demand`、不改变处置状态，也不允许分配或出库；管理员可以重新打开或返回继续编辑。只有最终点击“确定报废并生成”才执行上一条所述的同事务写入，并把方案转为 `confirmed`。草稿查询、乐观锁整体保存、最终确认事务与管理端恢复接线已经落地。
- 员工普通报工必须把正常和异常分成不同请求；每张异常报工只能选择一个 `abnormal_origin`。同一来源下更细的异常类别当前由上报人整笔判断并写入说明，系统尚无结构化异常类型字典；混入不同来源、数量填错或整笔误报时，管理员必须驳回整笔，不允许部分处置。
- 管理端不得提供“只把处置单改成 `rejected`”的空驳回，也不得物理删除来源报工。“驳回并退回重报”必须填写原因；后端在一个事务内锁定来源员工异常报工与处置单，追加原报工的全量同值冲销，把原处置单转为 `rejected`，递增工序版本并写成功审计。该命令不追加正常报工、替代报工、报废事实或补产授权；员工随后按正确数量和异常来源重新提交，形成可追溯的新报工及新待处置单。
- “驳回并退回重报”只适用于 `normal_quantity = 0` 的员工直接异常报工。返工完成子事实或正常/异常混合事实必须拒绝该命令，通用更正同样不能绕过；返工结果纠错及已批准处置撤销没有已开放入口，留待独立业务设计。存在已批准返工、报废、补料、出库或其他不可逆下游依赖时同样拒绝，不引导用户使用不存在的更正功能。
- 修复迁移只为历史上已经标记为 `rejected`、仍有效、`normal_quantity = 0`、不是更正替代事实且不属于返工完成的直接异常报工追加确定性的全量冲销。历史混合及更正链事实不做猜测性回填。
- 追加 migration 会为未被冲销的历史有效异常报工生成 `LEGACY-BSAD-{reportId}` 待审批处置单；已被全量冲销的异常报工不会生成待办。
- 报工冲销或更正必须检查本表及其下游具体业务引用；依赖保护见 [CP-01 报工整改边界](#cp-01-报工整改边界)，不能把相邻工序累计数量关系当作本表的直接引用。
- 页面上的待审批数和异常标志从本表查询派生，不写回 `batch_step_records`。未来需要同一次异常报工拆分多种处置时，应追加处置明细表并版本化调整当前唯一整体处置规则，不得修改原报工事实。

### 4.4.1 工序报废与补产授权

#### `batch_step_scrap_records`

设计类型：不可变业务事实表。

职责：保存管理员把一张异常处置单整体批准为报废后形成的工序报废事实。报废数量是来源异常报工数量在批准时的快照；已落库事实不得更新或删除。

| 字段                      | 类型              | 说明                                               |
| ------------------------- | ----------------- | -------------------------------------------------- |
| `id`                      | `BIGINT UNSIGNED` | 主键，自增                                         |
| `abnormal_disposition_id` | `BIGINT UNSIGNED` | 来源异常处置单 ID，唯一                            |
| `production_batch_id`     | `BIGINT UNSIGNED` | 生产批次 ID                                        |
| `batch_step_record_id`    | `BIGINT UNSIGNED` | 异常上报所在工序执行节点 ID                        |
| `source_report_id`        | `BIGINT UNSIGNED` | 来源异常报工事实 ID                                |
| `scrap_quantity`          | `INT`   | 报废产品数量，等于来源报工的全部异常数量且大于 `0` |
| `unit_snapshot`           | `VARCHAR(20)`     | 来源报工单位快照                                   |
| `created_by`              | `BIGINT UNSIGNED` | 批准并创建报废事实的管理员                         |
| `created_at`              | `DATETIME`        | 报废事实创建时间                                   |

数据库约束：

- `UNIQUE (abnormal_disposition_id)`，一张异常处置单最多形成一条报废事实。
- `(abnormal_disposition_id, production_batch_id, batch_step_record_id, source_report_id) -> batch_step_abnormal_dispositions(id, production_batch_id, batch_step_record_id, batch_step_report_id)`，保证处置单、批次、工序和来源报工同源。
- `CHECK (scrap_quantity > 0)`。
- `created_by -> users.id`。
- 表只保存 `created_by/created_at`，不提供更新、软删除或删除审计字段。
- 索引：`INDEX (production_batch_id, batch_step_record_id, created_at)`。

#### 工序报废只读明细

`GET /production/batches/:batchId/step-records/:recordId/scrap-records` 按创建时间及 ID 倒序返回默认每页 10 条的 `PageResult<BatchStepScrapRecordView>`，总数和当前页共享一致性快照。它读取真实报废事实、严格同任务同工序的来源报工及处置，返回真实来源 `SR/BAD` 编号、报废数量和单位、来源说明、审批说明、事实创建人和时间，以及存在的真实补产授权与补料引用；没有关联时返回 `null`，没有报废业务编号时不得拼造。

该接口与报工历史读取共用 `production.tasks.view`、`production.trace.view`、`production.workerTasks.view` 任一查看权限；仅有员工查看权限时仍须是工序当前负责人。管理员及超级管理员沿通用权限匹配获取授权，不按角色名硬编码。读取必须严格匹配路径任务／工序和事实来源，不扩大报工或异常写权限；即使分布待核对，也允许授权用户读取真实报废明细。

#### `batch_step_scrap_reproduction_authorization`

设计类型：不可变业务事实表。

职责：保存一条工序报废事实对应的产品补产授权，明确补产产品数量、固定从哪一道工序重新投入和额度传播到哪一道工序。补料候选由批次完整 BOM 基础和启用物料版本决定，不再按工序计算截止范围。授权在管理员批准报废时与报废事实、补料单和补料需求同事务创建；物流进度不得回写本表。

| 字段                        | 类型              | 说明                                                         |
| --------------------------- | ----------------- | ------------------------------------------------------------ |
| `id`                        | `BIGINT UNSIGNED` | 主键，自增                                                   |
| `production_batch_id`       | `BIGINT UNSIGNED` | 所属生产批次 ID                                              |
| `scrap_record_id`           | `BIGINT UNSIGNED` | 唯一来源工序报废事实 ID                                      |
| `supplement_id`             | `BIGINT UNSIGNED` | 唯一关联补料物流单 ID                                        |
| `entry_step_record_id`      | `BIGINT UNSIGNED` | 补产重新投入工序；当前固定为生产批次路线首工序               |
| `quota_end_step_record_id`  | `BIGINT UNSIGNED` | 补产额度传播截止工序；固定为异常上报工序                     |
| `authorized_quantity`       | `INT`   | 产品补产授权数量；批准时等于报废数量且必须大于 `0`           |
| `authorized_by`             | `BIGINT UNSIGNED` | 批准补产的管理员 ID                                          |
| `authorized_at`             | `DATETIME`        | 管理员批准补产的时间                                         |
| `created_at`                | `DATETIME`        | 授权事实创建时间                                             |

数据库约束：

- `UNIQUE (scrap_record_id)`，一条报废事实只能形成一条补产授权。
- `UNIQUE (supplement_id)`，一张补料物流单只能服务一条补产授权。
- `(scrap_record_id, production_batch_id, quota_end_step_record_id) -> batch_step_scrap_records(id, production_batch_id, batch_step_record_id)`，保证授权批次及额度截止工序与报废事实同源。
- `(supplement_id, production_batch_id) -> production_material_supplement(id, production_batch_id)`。
- 入口工序以组合外键关联同一生产批次的 `batch_step_records`；`authorized_by -> users.id`。
- `CHECK (authorized_quantity > 0)`。
- 表只保存批准和创建事实，不提供状态、更新、软删除或删除审计字段。
- 索引：`INDEX (production_batch_id, quota_end_step_record_id, authorized_at)`。

应用规则：

- `authorized_quantity` 必须等于 `batch_step_scrap_records.scrap_quantity`；数据库只保证两者同源，数值相等由批准事务校验。
- `supplement_id` 必须指向 `source_type = 'step_scrap_reproduction'` 且与当前报废事实同源的补料单；当前不再存在 `material_loss` 补料单，领料损耗不关联产品补产授权。
- `entry_step_record_id` 必须是路线首工序；物料版本选择与路线工序范围无关。
- 本表没有“待生效/已生效”状态。`source_type = 'step_scrap_reproduction'` 的关联补料单进入 `fulfilled` 后，授权进入路线额度公式；此后发生领料损耗只追加 `item_scrap(production_consumed)` 损坏事实，原授权数量和产品可报上限不变，需要物料时管理员另行手工提需。普通退料不产生损耗或产品授权。

## 4.5 `rework_records`（当前最小返工）

职责：承载一张已批准返工的异常处置单。返工由生产管理人员办理，固定归属来源工序并沿用来源报工单位，数量等于来源报工的全部异常数量，不拆分来源异常单、不改路线；一次整单完成中的正常与异常结果分别形成事实。来源工序负责人只作批准时快照，不再表示返工派工对象。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | 主键 |
| `rework_no` | `VARCHAR(100)` | 返工单号，唯一 |
| `abnormal_disposition_id` | `BIGINT UNSIGNED` | 来源异常处置单，唯一 |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID |
| `batch_step_record_id` | `BIGINT UNSIGNED` | 返回执行的来源工序 |
| `source_report_id` | `BIGINT UNSIGNED` | 来源异常报工 |
| `responsible_user_id` | `BIGINT UNSIGNED` | 批准时的来源工序负责人快照，不作为返工办理资格 |
| `rework_quantity` | `INT` | 来源异常数量快照，必须大于 `0` |
| `unit_snapshot` | `VARCHAR(20)` | 来源报工单位快照 |
| `status` | `VARCHAR(30)` | `pending`、`doing`、`completed`、`cancelled` |
| `completed_normal_report_id` | `BIGINT UNSIGNED` | 返工完成时生成的正数纯正常恢复事实，唯一；完成前或该侧为零时为空 |
| `completed_abnormal_report_id` | `BIGINT UNSIGNED` | 返工完成时生成的正数纯残余异常事实，唯一；完成前或该侧为零时为空 |
| `started_at` / `completed_at` | `DATETIME` | 开始和完成时间 |
| `version` | `INT` | 乐观锁版本 |
| `remark` | `TEXT` | 审批、开始、完成或取消说明 |
| 业务审计字段 | 见统一规则 | 可变返工单审计字段 |

约束与事务规则：

- `UNIQUE (abnormal_disposition_id)`、`UNIQUE (completed_normal_report_id)`、`UNIQUE (completed_abnormal_report_id)`；处置单、工序、来源报工与两个子结果使用批次／工序组合外键保证同源。两个完成引用都非空时必须不同；`pending/doing/cancelled` 均为空，`completed` 至少一侧非空。
- 批准返工只接受 `pending_review`，且来源普通报工仍有效、异常数量大于 `0`、来源工序存在负责人；处置单更新为 `approved/rework` 与返工单创建、成功审计同事务。
- 持久化状态机为 `pending -> doing -> completed`；开始和完成由具备 `production:rework:execute` 的生产管理人员办理并使用 `version` 乐观锁，不要求操作者等于来源工序负责人快照。员工查看、普通报工和工序执行权限不包含返工办理权；权限授予以能力为准，不硬编码管理员角色名称。任务提前结束时，收尾逐项处理可将未完成返工 `pending/doing -> cancelled`，保留来源和处理记录。普通生产中不提供独立返工取消入口，不能把收尾能力当作任意取消授权。
- 单个完成命令提交 `normalQuantity` 和 `abnormalQuantity`，两者非负且合计必须精确等于 `rework_quantity`。同一事务仅为正数侧追加 `batch_step_reports.normal` 事实：正常恢复侧 `normal_quantity>0,abnormal_quantity=0,abnormal_origin=NULL`，残余异常侧 `normal_quantity=0,abnormal_quantity>0,abnormal_origin=current_step`；新待处置单只引用残余异常子报工。随后更新工序版本但保持工序状态，将两个实际结果 ID 写入对应完成引用，并提交成功审计及严格幂等结果；任一环节失败全部回滚。
- `responsible_user_id` 及契约 `responsibleUserId/responsibleUserName` 保留批准时来源工序负责人信息，历史值不改写，展示须标明快照身份；它不代表实际返修或结果登记人。实际结果登记人由两类报工事实的 `created_by/created_at` 记录，开始／完成成功审计与业务同事务；沿用既有字段，无本次结构迁移。
- `ReworkRecordItem` 返回 `completedNormalReportId`、`completedAbnormalReportId`，`CompleteReworkResult` 返回 `normalReport`、`abnormalReport` 和 `abnormalDisposition`；不存在的结果侧及处置为真正的 `null`，不返回旧 `completedReportId/report` 兼容字段。只读 View 的两类结果编号与对应数量也按实际子事实返回，零量侧为空。
- 返工完成按来源整笔数量校验，不以普通正常目标或首工投入上限再次封顶，不改变普通工序状态。它只恢复来源异常对象，不增加补产授权或物料需求，也不计入 `effective_direct_reported`。写事务仍按共同业务根和工序顺序锁定，并保护返工事实唯一来源。
- 两类返工结果都是返工单的下游依赖，纯正常恢复侧也不能通过通用报工冲销／更正入口调整，残余异常不能通用驳回重报。结果错误或需要部分完成时必须新增专用返工修正设计，当前没有该修正入口。
- `202610100001-production-rework-split-completion` 追加成对迁移替换 scalar 完成引用。up 在首个永久 DDL 前拒绝混合、缺失、失效或不同源的历史完成事实，只把已有纯单侧结果分配至真实对应引用，不改报工事实；down 在同一边界拒绝双子结果，不能合成一条历史混合事实。迁移停写和失败恢复见[迁移安全](../../../../../../../packages/database/docs/migration-safety.md#202610100001返工完成双结果引用)。

## 4.6 成品流转与后续质量放行边界

当前两类成品入库依据任务的有效批准清单办理，复用入库单和 `inventory_transaction`，见[成品入库](finished-goods-inbound.md)。不新建 `finished_flow_records`；完整质量放行或流转里程碑仍需后续设计，即使增加也不得成为第二库存事实来源。

## 4.7 当前追溯主链

```text
products
  -> work_orders
  -> production_batches
  -> batch_step_records
  -> batch_step_reports
  -> batch_step_abnormal_dispositions
     ├─ rework -> rework_records -> batch_step_reports
     └─ scrap  -> batch_step_scrap_records -> production_material_supplement
```

追溯主链包含报工创建、更正、异常审批、最小返工和报废补料事实。过程质检、最终质量和成品流转只能在各自业务语义闭环后追加到主链。追溯查询可以使用受约束的冗余字段和快照，但任何库存数量只能从 `inventory_transaction` 汇总，任何生产需求只能从 `production_item_demand` 读取。

当前 Production 只读追溯已经落地查询投影：支持按工单号、生产批次号、物料编码和库存批次号定位生产批次，并读取工单/批次概览、`production_item_demand`、`production_item_allocation`、`outbound_order/outbound_detail`、对应的 `production_material_outbound` 库存流水、`batch_step_records`、`batch_step_reports` 普通/冲销/替代链及有效聚合、`batch_step_abnormal_dispositions` 待处置记录。该投影不创建第二事实表，不返回质量、返工、报废、退料或成品流向占位数据。

追溯和供需展示 SQL 分别位于 `infrastructure/queries/production-trace.query.ts` 与 `production-supply-demand.query.ts`，由原 Repository 端口委托调用；跨模块读取的库存批次、流水、入库来源及余额投影字段登记在 `scripts/api-data-ownership.mjs`。这些查询只服务展示、搜索和分页，不锁定 Inventory 数据，也不供领料、采购或补料命令判定写入资格。原按工单分组分页、按稳定来源查询正负流水及供需数量口径保持不变，不将余额或历史展示当作新采购资格。

批次收尾时未完成工序由管理员逐项置为 `terminated`，行动保留原状态；父批次 `closing/terminated` 阻止后续执行；待处理异常使用 `terminated` 记录结束人和时间且无处置类型，未完成返工取消，未履约补料使用 `cancelled` 且履约人/时间为空。已报工和已授权事实保留；不补料的终止产出报废独立见[批次结束设计](production-termination.md)。

正常批次完工除工序、末工序产量外，还阻断全部 active 需求及 approved 未齐套补料单；在审纠错仍为 active，关闭不能伪装物料齐套。最终可用产出不足按共用结案审批核对，不另建短产审批，也不通过执行完工入口改写正常产量。

### 生产追溯查询

`GET /production/trace/batches/:id` 的物料入库来源按所用库存批次的正数、available 流水展示，`sourceLabel` 取真实 `transaction_type`，无外购单不能一律解释为 initial_stock。这是批次入库历史，不表示其中每笔数量全部被当前任务消费。

`sourceDocumentNo` 当前解析外购入库单及已确认退料单；其他来源未解析时为 null，类型仍取流水。`confirmedAt` 优先使用对应单据确认时间，无关联单据时使用流水时间。供应方仅取对应外购入库明细的确认时供应商名称，不从合单的其他明细或退料推断供应商；前端使用共享流水字典。供应商名称和批次来源规则见 [Inventory](../../../inventory/docs/database/inventory-ledger-and-inbound.md#9-inbound_detail)。
