# 生产报工、追溯与质量边界

> [返回数据库设计总览](README.md)。本章是总览所引用的权威规范组成部分，不是独立副本。

本章当前只将“分批报工事实、全量冲销和原单更正”固化为可实施设计。补料、报废确认、质检放行和返工的业务语义尚未完成评审；对应后续章节仅用于记录现有边界，不得据此提前创建表或接口。

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
| `status`                               | `VARCHAR(30)`     | `pending`、`assigned`、`doing`、`completed`、`abnormal` |
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
- 状态检查：`CHECK (status IN ('pending', 'assigned', 'doing', 'completed', 'abnormal'))`
- 完工时必须存在 `started_at`、`completed_at`，并满足 `completed_at >= started_at`

创建生产批次时按路线步骤生成记录并复制默认快照（SOP、负责人、工序信息、必须报工和必须检验标志）；后续修改工序或路线不得回写已生成记录。现场可仅覆盖已生成步骤的实际 SOP 与实际负责人，不能增删或重排工序；实际 SOP 变更必须同步冻结文件名、对象键与版本号快照，并以工序记录 `version` 乐观锁更新。

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

### 4.2.3 数量与并发约束

- 第一工序当前的 `effective_reported` 不得超过生产批次计划数量。补料/补产机制尚未定稿，因此当前不得通过人工放宽该上限；将来只能把已确认的补产额度纳入上限。
- 后续工序的 `effective_reported` 不得超过上一工序的 `effective_normal`。例如上一工序累计报工 `10`，其中正常 `1`、异常 `9`，下一工序最多只能累计报工 `1`。
- 必检工序的 `normal_quantity` 只是操作员声明的工序正常数量。在质检模型定稿前，它不得被解释为质量放行数量；需要质检放行的下游可用量规则仍是阻塞项。
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

## 4.3 质检边界（待业务决策）

现有草案曾使用 `inspection_records`，但以下语义尚未闭环：检验批如何占用报工数量、多次/抽样检验、条件放行、复检、冲销，以及必检工序如何形成下游可用量。因此当前不得创建该表。

后续设计至少必须区分：工序执行节点 `batch_step_records`、具体报工事实 `batch_step_reports`、检验任务/结论和质量放行事实。不得继续把 `batch_step_record_id` 描述为“具体报工记录”；若质检针对某次报工，应显式关联 `batch_step_report_id` 或独立的受检批。

## 4.4 返工边界（待业务决策）

现有草案曾使用 `rework_records`，但返工来源、返工路线、返工产出如何重新进入检验/报工、失败数量如何转损和多轮返工尚未闭环，因此当前不得创建该表。`batch_step_reports.abnormal_quantity` 只表达工序层异常，不自动创建返工，也不自动减少库存。

## 4.5 成品流转边界（待业务决策）

现有草案曾使用 `finished_flow_records`。在质量放行和入库边界定稿前不得创建该表。即使后续落地，有库存增减的流转也必须关联 `inventory_transaction`；流转里程碑本身不得成为第二库存事实来源。

## 4.6 当前追溯主链

```text
products
  -> work_orders
  -> production_batches
  -> batch_step_records
  -> batch_step_reports
```

质检、返工和成品流转只能在各自业务语义闭环后追加到主链。追溯查询可以使用受约束的冗余字段和快照，但任何库存数量只能从 `inventory_transaction` 汇总，任何生产需求只能从 `production_item_demand` 读取。
