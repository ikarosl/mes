# 生产报工、追溯与质量边界

> [返回数据库设计总览](README.md)。本章是总览所引用的权威规范组成部分，不是独立副本。

本章当前只将“分批报工事实、全量冲销和原单更正”固化为可实施设计。工序异常与执行状态分离、过程自检临时放行口径、半自动补料和有下游依赖时的冲销边界已经确认；异常审批、返工、工序报废、补料报工额度来源和最终质量结论仍未形成完整可实施闭环。后续章节会分别标明已确认边界和待决策项，不得仅凭已确认的局部方向提前创建未定稿表或接口。

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
| `default_responsible_user_id_snapshot` | `BIGINT UNSIGNED` | 路线默认负责人快照，可为空                              |
| `actual_sop_file_id`                   | `BIGINT UNSIGNED` | 现场实际 SOP 文件 ID；为空时使用默认快照                |
| `actual_sop_file_name_snapshot`        | `VARCHAR(255)`    | 现场实际 SOP 文件名快照                                 |
| `actual_sop_object_key_snapshot`       | `VARCHAR(500)`    | 现场实际 SOP 对象键快照                                 |
| `actual_sop_version_no_snapshot`       | `VARCHAR(64)`     | 现场实际 SOP 版本号快照                                 |
| `responsible_user_id`                  | `BIGINT UNSIGNED` | 现场实际负责人；为空时使用默认负责人快照                |
| `need_record_snapshot`                 | `TINYINT`         | 创建时冻结的必须报工标志，默认 `1`                      |
| `need_inspection_snapshot`             | `TINYINT`         | 创建时冻结的必须检验标志，默认 `0`                      |
| `status`                               | `VARCHAR(30)`     | 工序执行状态；目标值为 `pending`、`assigned`、`doing`、`completed` |
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
- 快照字段 `need_record_snapshot`、`need_inspection_snapshot` 只允许 `0` 或 `1`
- 目标状态检查：`CHECK (status IN ('pending', 'assigned', 'doing', 'completed'))`
- 完工时必须存在 `started_at`、`completed_at`，并满足 `completed_at >= started_at`

创建生产批次时按路线步骤生成记录并复制默认快照（SOP、负责人、工序信息、必须报工和必须检验标志）；后续修改工序或路线不得回写已生成记录。现场可仅覆盖已生成步骤的实际 SOP 与实际负责人，不能增删或重排工序；实际 SOP 变更必须同步冻结文件名、对象键与版本号快照，并以工序记录 `version` 乐观锁更新。

`batch_step_records.status` 只表达工序执行进度，不表达异常审批进度。工序可以保持 `doing`，同时存在一条或多条待处理异常；页面上的“存在待处理异常”“返工处理中”等标志必须从异常和返工记录派生。当前物理表和共享契约仍保留历史兼容值 `abnormal`，在追加 migration、共享常量和契约同步调整前，应用不得把新工序写成该状态。

## 4.2 `batch_step_reports`

职责：记录每一次报工事实。同一工序允许分多次报工；已落库事实不得更新或删除，错误报工通过一条等量冲销事实撤回。管理员更正必须在一个命令和一个数据库事务内同时写入“原记录冲销 + 更正后的新记录”。

| 字段                     | 类型              | 说明                                                                 |
| ------------------------ | ----------------- | -------------------------------------------------------------------- |
| `id`                     | `BIGINT UNSIGNED` | 主键，自增                                                           |
| `report_no`              | `VARCHAR(100)`    | 报工事实编号，唯一；历史迁移使用 `LEGACY-SR-{stepId}`                |
| `production_batch_id`    | `BIGINT UNSIGNED` | 生产批次 ID                                                          |
| `batch_step_record_id`   | `BIGINT UNSIGNED` | 工序执行节点 ID                                                      |
| `report_type`            | `VARCHAR(20)`     | `normal`、`reversal`                                                 |
| `reversal_of_report_id`  | `BIGINT UNSIGNED` | 冲销的原报工 ID；普通报工为空                                       |
| `replaces_report_id`     | `BIGINT UNSIGNED` | 更正后的普通报工所替代的原报工 ID；非更正报工为空                    |
| `reported_quantity`      | `DECIMAL(12,4)`   | 本事实的报工总数，必须大于 `0`                                      |
| `normal_quantity`        | `DECIMAL(12,4)`   | 本事实中工序层面的正常数量，不等同于质检合格数量                     |
| `abnormal_quantity`      | `DECIMAL(12,4)`   | 本事实中工序层面的异常数量；异常不自动等同于报废                     |
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
- `normal` 的 `reversal_of_report_id` 必须为空；`reversal` 必须引用原事实且不得再填写 `replaces_report_id`
- 表只保存 `created_by/created_at`，不提供更新、软删除或删除审计字段

### 4.2.1 有效数量

冲销行保存与原事实完全相同的三个绝对数量，查询时按类型决定正负号：

```text
effective_reported = SUM(normal.reported_quantity) - SUM(reversal.reported_quantity)
effective_normal   = SUM(normal.normal_quantity)   - SUM(reversal.normal_quantity)
effective_abnormal = SUM(normal.abnormal_quantity) - SUM(reversal.abnormal_quantity)
```

`batch_step_records` 不缓存这些汇总。列表、详情和校验必须从 `batch_step_reports` 聚合；如以后为性能增加汇总视图，它也只能是只读派生数据。

现有 Production 返回模型暂时把 `effective_reported` 映射到 `outputQuantity`、把 `effective_normal` 映射到 `qualifiedQuantity`，以维持已发布的 createBatch 幂等 scope v1 响应结构。这只是兼容别名，不代表“正常数量已经质检合格”；后续报工接口定稿时必须通过版本化契约消除该歧义，不得静默改变 v1 codec。

### 4.2.2 普通报工、冲销和更正

- 普通报工只插入 `normal` 事实，不得覆盖同工序的历史行。
- 冲销只能全量冲销一条仍有效的 `normal` 事实，冲销数量、正常数量、异常数量和单位必须与原事实一致；禁止部分冲销、冲销冲销行或重复冲销。
- 更正不是先冲销后由客户端另发一次普通报工。单个更正命令必须同时插入冲销行和新的 `normal` 行；新行以 `replaces_report_id` 指向被更正的原行。任一校验、审计或结果保存失败时全部回滚。
- 已完成工序不得继续普通报工。管理员更正已完成工序时仍须满足所有上下游约束，并在同一事务内按业务状态机决定是否重开工序；在状态机规则落地前，应用层不得开放该命令。
- `report_no` 是业务事实编号，不代替 HTTP 幂等键。客户端原始 `Idempotency-Key` 只进入平台幂等记录，绝不能写入本表。

#### 下游依赖与连带冲销升级边界

- 一期仅允许管理员为“上报填写错误”冲销或更正报工。若目标报工已经产生下游报工、异常审批、返工、工序报废、补料、需求、分配、出库或库存流水，普通冲销/更正命令必须拒绝，并返回可供前端明确展示的依赖摘要；前端确认不能替代后端校验。
- 后续如开放连带冲销，必须提供独立的管理员级联更正命令。后端在执行前重新计算完整影响范围，按下游到上游的稳定顺序追加业务冲销事实和库存反向流水，不得级联删除或覆盖历史行。
- 级联更正中的下游冲销、库存反向流水、原报工冲销/替代、工序状态调整、成功审计和幂等结果必须在同一数据库事务完成。任一依赖当前不可逆或任一数量、状态、审计校验失败时，整条命令回滚。

### 4.2.3 数量与并发约束

- 第一工序当前的 `effective_reported` 不得超过生产批次计划数量。补料/补产机制尚未定稿，因此当前不得通过人工放宽该上限；将来只能把已确认的补产额度纳入上限。
- 后续工序的 `effective_reported` 不得超过上一工序的 `effective_normal`。例如上一工序累计报工 `10`，其中正常 `1`、异常 `9`，下一工序最多只能累计报工 `1`。
- 当前临时口径把操作员提交的 `normal_quantity` 视为该工序已经完成自检的正常数量；在过程质量模型缺失期间，`effective_normal` 临时作为下工序正常放行数量。该口径只用于生产过程流转，不得解释为最终质量合格结论。
- 冲销或更正上游事实后，如果新的上游有效正常数量小于下游已经报工的有效总数，整个命令必须拒绝，不能制造负余量或事后修补。
- 报工事务必须按 `step_order_snapshot` 的稳定顺序锁定当前工序及相邻约束工序的 `batch_step_records` 行，再读取有效汇总并校验，避免两个并发请求都通过旧汇总。
- 数据库的 CHECK、UNIQUE 和外键只负责行内结构与引用完整性；“全量同值冲销、目标必须是有效普通事实、上下工序上限、状态机”由 application 事务校验。

### 4.2.4 事务、幂等与审计

- 创建报工、更正报工都是没有可复现自然业务键的新增事实命令，必须接入项目 HTTP 幂等执行器后才能开放接口。
- 一次命令中的报工事实、冲销/替代事实、工序状态与时间、成功 `operation_logs`、幂等成功结果必须使用同一数据库连接和同一事务提交。
- 响应丢失后的同键同指纹重试必须重放首次结果，不得重新执行当前数量和状态校验；同键不同指纹返回冲突。
- `report_no` 由首次执行生成并随结果快照保存；重放不得再生成编号。
- 当前 migration 只完成事实表、历史数据迁移和旧累计列移除；application、HTTP、管理端和完整闭环测试尚未实现，因此不得把“表已落地”描述成“报工功能已发布”。
- 升级前置校验要求旧数据满足 `output_quantity = qualified_quantity + abnormal_quantity`、`rework_quantity = 0`，并且有正数报工的工序存在 `updated_by` 或 `created_by`。任一条件不满足时 migration 必须在首个永久 DDL 前失败，由部署人员先核对历史业务事实；不得猜测差额、返工归属或操作人。
- 通过校验的旧累计量迁移为一条 `LEGACY-SR-{stepId}` 普通事实，旧 `qualified_quantity` 只按兼容口径进入 `normal_quantity`，不追认其为质量结论。

## 4.3 过程自检临时口径与未来质检边界

当前由于过程质量检测流程缺失，暂不实施工序间独立质检、抽检、复检、条件放行和质量放行事实。操作员报工中的 `normal_quantity` 视为已经完成本工序自检，临时使用以下口径：

```text
current_step_released_quantity = effective_normal
```

临时规则：

- `need_inspection_snapshot` 继续作为路线快照保留，但当前不创建过程检验任务，也不阻塞下工序；应用和页面不得伪造“过程质检已通过”的结论。
- `normal_quantity` 只表示工序自检正常量，不是最终质量合格量。`production_batches.qualified_quantity` 只能来自生产完成后的最终质量结论，不得直接复制任一道工序或末道工序的 `effective_normal`。
- 当前暂不考量生产过程中的质量检测流程。将来引入过程质量模块时，下工序可用量必须改为读取独立的质量放行事实，并通过版本化契约迁移，不能静默改变 `normal_quantity` 的既有含义。
- 生产完成后的最终质检任务、结论、批次状态衔接和 `qualified_quantity` 写入仍未闭环；在这些规则定稿前不得创建推测性的最终质检表或开放最终质量确认接口。

现有草案曾使用 `inspection_records`，但检验批如何占用报工数量、多次/抽样检验、条件放行、复检和冲销仍未闭环，因此当前不得创建该表。

后续设计至少必须区分：工序执行节点 `batch_step_records`、具体报工事实 `batch_step_reports`、检验任务/结论和质量放行事实。不得继续把 `batch_step_record_id` 描述为“具体报工记录”；若质检针对某次报工，应显式关联 `batch_step_report_id` 或独立的受检批。

## 4.4 工序异常审批边界（部分已确认）

工序异常必须由独立的 `batch_step_abnormal_records` 目标表表达，不得通过把 `batch_step_records.status` 改成 `abnormal` 代替。该表需要支持同一工序和同一次报工存在多条异常处置记录，并至少保存来源报工、生产批次、工序执行节点、异常数量、原因、审批状态、处置类型、审批人与审批时间、乐观锁和业务审计字段。

已确认边界：

- 审批状态使用 `pending_review`、`approved`、`rejected`、`cancelled`；处置类型在批准时明确为 `rework` 或 `scrap`。
- 工序执行状态与异常审批状态相互独立。例如工序保持 `doing` 时可以同时存在多条 `pending_review` 异常。
- `batch_step_reports.abnormal_quantity` 是异常数量事实；异常审批记录负责处置流程，不能反向改写原报工数量。
- 报工冲销或更正必须检查异常审批及其下游依赖；存在依赖时遵守本章“下游依赖与连带冲销升级边界”。

`batch_step_abnormal_records` 的数量拆分守恒、审批后如何唯一生成返工或工序报废记录、以及这些来源如何授权再次报工仍待下一轮设计，因此当前只确认需要独立表及上述职责，不得据此创建 migration。

## 4.5 返工边界（待业务决策）

现有草案曾使用 `rework_records`，但返工来源、返工路线、返工产出如何重新进入检验/报工、失败数量如何转损和多轮返工尚未闭环，因此当前不得创建该表。`batch_step_reports.abnormal_quantity` 只表达工序层异常，不自动创建返工，也不自动减少库存。

## 4.6 成品流转边界（待业务决策）

现有草案曾使用 `finished_flow_records`。在质量放行和入库边界定稿前不得创建该表。即使后续落地，有库存增减的流转也必须关联 `inventory_transaction`；流转里程碑本身不得成为第二库存事实来源。

## 4.7 当前追溯主链

```text
products
  -> work_orders
  -> production_batches
  -> batch_step_records
  -> batch_step_reports
```

异常审批、质检、返工和成品流转只能在各自业务语义闭环后追加到主链。追溯查询可以使用受约束的冗余字段和快照，但任何库存数量只能从 `inventory_transaction` 汇总，任何生产需求只能从 `production_item_demand` 读取。
