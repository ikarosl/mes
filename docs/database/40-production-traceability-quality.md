# 生产报工、追溯与质量边界

> [返回数据库设计总览](README.md)。本章是总览所引用的权威规范组成部分，不是独立副本。

本章当前将“分批报工事实、全量冲销和原单更正”固化为可实施设计，并已确认工序异常使用独立的 `batch_step_abnormal_dispositions` 处置单、过程自检临时放行口径、半自动补料、有下游依赖时的冲销边界，以及当前阶段不限制补料/返工报工额度来源的简化规则。异常处置表已由 `202608110001-production-abnormal-dispositions-and-demand-type-codes` 追加 migration 落地，异常报工会自动创建待处置单并提供只读展示；审批 API 和下游事务尚未实现，返工、工序报废和最终质量结论仍未形成完整可实施闭环。后续章节会分别标明已确认边界、当前刻意接受的缺口和待决策项，不得仅凭已确认的局部方向提前创建未定稿表或接口。

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
- 当前状态检查：`CHECK (status IN ('pending', 'assigned', 'doing', 'completed'))`
- 完工时必须存在 `started_at`、`completed_at`，并满足 `completed_at >= started_at`

创建生产批次时按路线步骤生成记录并复制默认快照（SOP、负责人、工序信息、必须报工和必须检验标志），所有记录均以 `pending` 创建，且 `responsible_user_id` 为空。`default_responsible_user_id_snapshot` 只用于在管理员派工界面预选负责人，不代表已经派工；管理员明确确认后才把所选用户写入 `responsible_user_id` 并把该工序转为 `assigned`。后续修改工序或路线不得回写已生成记录。现场可仅覆盖已生成步骤的实际 SOP 与实际负责人，不能增删或重排工序；实际 SOP 变更必须同步冻结文件名、对象键与版本号快照，并以工序记录 `version` 乐观锁更新。

`batch_step_records.status` 只表达工序执行进度，不表达异常审批进度。工序可以保持 `doing`，同时具有待处理异常；页面上的“存在待处理异常”“返工处理中”等标志必须从 `batch_step_abnormal_dispositions` 和返工数据派生，不得复用执行状态。追加 migration、共享常量和契约已移除历史兼容值 `abnormal`；如升级前真实数据仍存在该值，migration 必须在首个永久 DDL 前失败，由部署人员先根据实际进度更正为执行状态，不得由 migration 猜测。

### 4.1.1 派工与执行状态机

| 状态 | 业务含义 | 进入条件 |
| --- | --- | --- |
| `pending` | 工序节点已生成，等待管理员确认派工 | 创建生产批次时进入；此时默认负责人只是建议值 |
| `assigned` | 管理员已经确认该工序的现场实际负责人，等待开工 | 只能由显式派工命令从 `pending` 进入，且 `responsible_user_id` 必须存在 |
| `doing` | 工序已经实际开始执行 | 已派工员工通过显式开工命令从 `assigned` 进入，并写入 `started_at` |
| `completed` | 工序已经完成当前要求的正常数量 | 必须报工工序在报工后的 `effective_normal == required_normal` 时自动进入；非必报工工序通过显式完工命令进入 |

普通状态转换固定为：

```text
pending -> assigned -> doing -> completed
```

补充规则：

- `pending -> assigned` 是逐工序派工。管理端可以提供批量确认界面，但后端仍必须逐条校验并保存每道工序的负责人、状态和乐观锁版本；不得仅凭 `production_batches.batch_owner_id` 推断全部工序负责人。
- `assigned -> pending` 只用于开工前撤回派工；撤回时清空 `responsible_user_id`。`assigned` 状态下允许显式改派并保持状态不变。派工、撤回和改派都必须通过语义明确的应用命令完成，并与成功操作日志同事务提交，禁止使用可写任意 `status` 的通用更新接口。
- `assigned -> doing` 只能由已派工员工在执行端显式点击“开始工序”触发；普通报工不得代替开工。开工命令必须以乐观锁校验工序仍为 `assigned`，写入 `started_at` 且不得覆盖已有值，并与成功操作日志同事务提交。第一道工序开工时还必须在同一事务把生产批次从 `material_outbound` 转为 `doing` 并写入批次 `started_at`；后续工序开工不重复修改批次开工时间。
- 普通报工只允许 `doing` 工序。必须报工工序在本次报工后的 `effective_normal < required_normal` 时保持 `doing`；等于 `required_normal` 时，在报工事实、成功审计和幂等结果的同一事务内自动转为 `completed` 并写入 `completed_at`；超过要求数量必须拒绝。员工不再提交任意目标状态，也不需要额外的“提交并完工”标志。
- 因为开工是独立的前置动作，一次全量正常数量报工也只能在工序已经 `doing` 后提交；该报工可以自动写入 `completed_at`，但不能同时补写 `started_at`。`started_at` 和 `completed_at` 来源于两个不同业务动作；受数据库时间精度影响二者数值可以偶然相等，但不能据此把开工和完工合并成一个命令。
- `need_record_snapshot = 0` 的非必报工工序不使用数量自动完工，由已开工员工执行显式完工命令；该命令仍须校验上下游和已落地的执行约束。任何完工都禁止客户端通过通用更新接口直接提交任意 `status`。
- `completed` 禁止继续普通报工，但允许管理员冲销或更正已有报工。事务重新计算后若 `effective_normal` 仍等于 `required_normal`，工序保持 `completed`；若降到要求数量以下且不存在下游冲突，工序自动重开为 `doing` 并清空 `completed_at`。原完工和重开历史由报工事实及成功操作日志追溯，不覆盖或删除历史事实。
- `production_batches.material_assigned` 只表示批次物料已分配，不能触发任何工序进入 `assigned`。物料需求、分配和领料出库推动生产批次状态；派工、开工和完工推动单个工序状态，两套状态机独立推进。
- 工序能否开工由应用层综合校验派工状态、批次物料状态和上游正常放行数量。若页面需要“可开工”提示，应返回派生结果，不新增或复用持久化状态。

上述四种状态、独立派工/撤回/改派/员工开工命令、非必报工工序显式完工命令、管理端逐工序操作和员工“我的工序”入口已经落地。派工、开工与完工仍是独立动作；报工不得绕过 `assigned -> doing`，必须报工工序不得调用显式完工命令。

#### 4.1.2 工序完工的两版方案

两版方案互斥，不能由不同页面、不同员工或不同工序自行选择，否则相同 `doing` 和数量会得到不同状态结果。当前实施基线为方案 A；方案 B 只作为工序数量较少、管理员能够逐项复核时的备用方案。切换方案必须先同步本章、[基础规则](00-foundations.md)、接口契约、权限、管理端交互和测试，再整体发布，不能仅修改前端按钮。

**方案 A：数量达标自动完工（当前实施基线）**

- 适用于必须报工工序。普通报工事务重新计算 `effective_normal`：小于 `required_normal` 时保持 `doing`，等于时自动转为 `completed` 并写入 `completed_at`，大于时拒绝。
- 优点是员工完成最后一次报工后无需等待管理员，状态和数量不会长时间偏离；适合分批报工频繁或工序数量较多的场景。
- 自动完工不是跳过校验。报工、数量校验、上下游校验、工序状态与时间、成功审计和幂等结果仍须在同一事务提交。
- 非必报工工序没有可用于自动判断的数量事实，仍通过显式完工命令处理。

**方案 B：管理员确认完工（备用方案，当前不得实现为并行入口）**

- 普通报工只追加事实并更新有效数量；即使 `effective_normal == required_normal`，工序仍保持 `doing`，管理端派生展示“数量已达标，待确认完工”。
- 管理员通过语义明确的“确认工序完工”命令执行 `doing -> completed`。后端必须在事务内重新锁定工序及相邻约束工序，并重新校验状态、乐观锁、`effective_normal == required_normal`、上下游数量和其他已经落地的阻断条件；管理员确认不能覆盖硬性校验失败。
- 完工命令写入 `completed_at`，并与成功操作日志同事务提交。当前业务审计字段和 `operation_logs` 可以追溯确认人；若产品要求在工序列表直接高频查询“完工确认人”，启用方案 B 时再以追加 migration 评审独立 `completed_by`，不得提前修改已执行 migration。
- 方案 B 的优点是管理员可以在状态终结前集中检查数量和现场情况；代价是增加待办、权限、接口和人工瓶颈。只有工序数量与日均完工量足够小、管理员能够及时处理时才适用。
- 启用方案 B 需要独立的完工权限、管理端待确认列表和闭环测试。不得复用能够写任意 `status` 的通用更新接口，也不得让员工报工端与管理员端分别采用不同完工规则。

无论采用哪一版，已完成工序发生合法冲销或更正后，均按本章统一规则重新计算：数量不足且无下游冲突时重开为 `doing`；存在下游冲突时拒绝，并提示管理员先按下游到上游顺序冲销冲突事实。

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

现有 Production 返回模型暂时把 `effective_reported` 映射到 `outputQuantity`、把 `effective_normal` 映射到 `qualifiedQuantity`，以维持 createBatch 当前幂等结果结构。这只是兼容别名，不代表“正常数量已经质检合格”；后续报工接口定稿时必须通过版本化契约消除该歧义，不得静默改变当前 codec。

### 4.2.2 普通报工、冲销和更正

- 普通报工只插入 `normal` 事实，不得覆盖同工序的历史行。
- 冲销只能全量冲销一条仍有效的 `normal` 事实，冲销数量、正常数量、异常数量和单位必须与原事实一致；禁止部分冲销、冲销冲销行或重复冲销。
- 更正不是先冲销后由客户端另发一次普通报工。单个更正命令必须同时插入冲销行和新的 `normal` 行；新行以 `replaces_report_id` 指向被更正的原行。任一校验、审计或结果保存失败时全部回滚。
- 已完成工序不得继续普通报工。管理员可以冲销或更正已完成工序的已有报工；若事务内重新计算的 `effective_normal < required_normal`，且不存在下游冲突，则在同一事务把工序重开为 `doing` 并清空 `completed_at`。若更正后仍满足要求数量，工序保持 `completed`。
- `report_no` 是业务事实编号，不代替 HTTP 幂等键。客户端原始 `Idempotency-Key` 只进入平台幂等记录，绝不能写入本表。

#### 下游依赖与连带冲销升级边界

- 一期仅允许管理员为“上报填写错误”冲销或更正报工。命令必须先计算更正后的有效数量：若新的上游 `effective_normal` 小于下游已经报工的 `effective_normal`，必须拒绝并返回可供前端明确展示的冲突工序和报工依赖摘要，提示管理员先从最下游开始冲销冲突报工，再重新提交本次上游更正；前端确认不能替代后端校验。
- 若目标报工已经产生异常审批、返工、工序报废、补料、需求、分配、出库、库存流水或其他对该报工的直接业务引用，普通冲销/更正同样必须拒绝并返回依赖摘要。管理员只能先通过对应业务的合法冲销或取消动作解除依赖，不得删除或覆盖下游事实。
- 后续如开放连带冲销，必须提供独立的管理员级联更正命令。后端在执行前重新计算完整影响范围，按下游到上游的稳定顺序追加业务冲销事实和库存反向流水，不得级联删除或覆盖历史行。
- 级联更正中的下游冲销、库存反向流水、原报工冲销/替代、工序状态调整、成功审计和幂等结果必须在同一数据库事务完成。任一依赖当前不可逆或任一数量、状态、审计校验失败时，整条命令回滚。

### 4.2.3 数量与并发约束

- 当前不支持短批完工，因此所有必须报工工序的最终要求正常数量 `required_normal` 均取生产批次计划数量。后续工序不得把上一工序当前的 `effective_normal` 误作自身最终完成目标，否则会在上游仅部分放行时提前自动完成。
- 当前可报正常量上限 `released_normal`：第一工序取生产批次计划数量；后续工序若上一工序必须报工则取其当前 `effective_normal`，若上一工序无需报工则仅在其 `completed` 后取生产批次计划数量，否则为 `0`。
- 只要当前工序 `effective_normal < required_normal` 且仍有已放行未报数量，即允许继续新增普通报工；本次提交后的 `effective_reported = effective_normal + effective_abnormal` 不得超过事务内重新读取的 `released_normal`。工序只在 `effective_normal == required_normal` 时自动完成，达到当前部分放行量不得提前完成。`abnormal_quantity` 不计入正常完成量和下工序放行量，但会消耗本工序的上游放行数量。
- 当前阶段不记录报工使用了返工还是补料来源，也不会因异常处置自动增加可报额度；因此出现异常后可能无法达到完整数量，必须等待后续返工/补产额度模型，不得通过重复报工绕过放行上限。
- 当前临时口径把操作员提交的 `normal_quantity` 视为该工序已经完成自检的正常数量；在过程质量模型缺失期间，`effective_normal` 临时作为下工序正常放行数量。该口径只用于生产过程流转，不得解释为最终质量合格结论。
- 冲销或更正上游事实后，如果新的上游 `effective_normal` 小于下游已经报工的 `effective_reported`，整个命令必须拒绝，不能让下工序已加工总量超过上工序正常放行量。错误响应必须指出冲突的下游工序及其有效总报工数量，并提示管理员按下游到上游顺序先完成冲销；下游总量降到新上限以内后，才能重试上游命令。
- 报工事务必须按 `step_order_snapshot` 的稳定顺序锁定当前工序及相邻约束工序的 `batch_step_records` 行，再读取有效汇总并校验，避免两个并发请求都通过旧汇总。
- 数据库的 CHECK、UNIQUE 和外键只负责行内结构与引用完整性；“全量同值冲销、目标必须是有效普通事实、上下工序上限、状态机”由 application 事务校验。

#### 当前简化方案的已知缺口与升级预留

- 异常数量不增加正常完成量，但必须计入 `effective_reported` 并消耗上游放行额度；连续提交异常报工不得绕过数量上限。
- 补料、返工与后续报工之间没有数据库可追溯的额度消费关系，系统不能证明某次补报由哪次返工或哪张补料单支持，也不能防止同一业务来源被重复解释为多次补报依据。
- 当前半自动补料只服务物料需求、分配和出库业务，不作为报工开关；页面和接口不得展示“补料已激活 N 个可报工数量”等当前并不存在的能力。
- 这是为降低当前阶段复杂度而接受的明确缺口，不得描述为数量闭环已经完成。未来需要严格控制时，再评审报工来源/授权模型（例如 `batch_step_report_sources` 或独立额度授权记录）、部分出库激活、来源剩余量、并发消费和历史报工兼容策略，并以追加 migration 和版本化接口实施。

### 4.2.4 事务、幂等与审计

- 创建报工、更正报工都是没有可复现自然业务键的新增事实命令，必须接入项目 HTTP 幂等执行器后才能开放接口。
- 一次命令中的报工事实、冲销/替代事实、工序状态与时间、成功 `operation_logs`、幂等成功结果必须使用同一数据库连接和同一事务提交。
- 响应丢失后的同键同指纹重试必须重放首次结果，不得重新执行当前数量和状态校验；同键不同指纹返回冲突。
- `report_no` 由首次执行生成并随结果快照保存；重放不得再生成编号。
- 报工 application、HTTP、管理端和幂等闭环已经落地；后续修改仍须保持事实追加、同事务审计和同键重放规则。
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

当前允许把“生产执行完工”与未来“最终质量确认”分开实施。批次生产执行完工时，服务端取最后一道必报工工序（`need_record_snapshot = 1` 且 `step_order_snapshot` 最大）的 `effective_normal` 写入 `production_batches.completed_quantity`；必须在事务内重新聚合，不接受客户端填写。没有必报工工序、必报工工序尚未全部完成或最后一道必报工工序数量不足时均拒绝完工。当前不支持短批完工；不足数量只能等待未来独立的生产损失/短批完工命令。该动作不得写入 `qualified_quantity`，也不得伪造最终质量结论。

现有草案曾使用 `inspection_records`，但检验批如何占用报工数量、多次/抽样检验、条件放行、复检和冲销仍未闭环，因此当前不得创建该表。

后续设计至少必须区分：工序执行节点 `batch_step_records`、具体报工事实 `batch_step_reports`、检验任务/结论和质量放行事实。不得继续把 `batch_step_record_id` 描述为“具体报工记录”；若质检针对某次报工，应显式关联 `batch_step_report_id` 或独立的受检批。

## 4.4 `batch_step_abnormal_dispositions`（数据库已落地，应用闭环待实现）

职责：作为具体异常报工的审批处置单。一条 `batch_step_reports` 普通报工只要 `abnormal_quantity > 0`，就在同一报工事务中自动创建一条处置单；同一道工序可以因多次异常报工产生多条处置单。工序执行状态继续保存在 `batch_step_records.status`，不得增加汇总异常状态替代本表。

当前阶段不支持把同一次报工的异常数量拆成“部分返工、部分报废”；该次报工的全部异常数量只能整体批准为返工或报废。异常数量只以不可变的 `batch_step_reports.abnormal_quantity` 为事实来源，本表不重复保存数量。

| 字段                    | 类型              | 说明                                                        |
| ----------------------- | ----------------- | ----------------------------------------------------------- |
| `id`                    | `BIGINT UNSIGNED` | 主键，自增                                                  |
| `disposition_no`        | `VARCHAR(100)`    | 异常处置单号，唯一                                          |
| `production_batch_id`   | `BIGINT UNSIGNED` | 生产批次 ID                                                 |
| `batch_step_record_id`  | `BIGINT UNSIGNED` | 工序执行节点 ID                                             |
| `batch_step_report_id`  | `BIGINT UNSIGNED` | 来源普通报工 ID；当前阶段一条报工最多一张异常处置单          |
| `review_status`         | `VARCHAR(30)`     | `pending_review`、`approved`、`rejected`、`cancelled`       |
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
- `CHECK (review_status IN ('pending_review', 'approved', 'rejected', 'cancelled'))`
- `CHECK (disposition_type IS NULL OR disposition_type IN ('rework', 'scrap'))`
- `CHECK (version >= 0)`
- `pending_review` 必须满足 `disposition_type/reviewed_by/reviewed_at` 均为空
- `approved` 必须满足 `disposition_type/reviewed_by/reviewed_at` 均非空
- `rejected/cancelled` 必须满足 `disposition_type` 为空且 `reviewed_by/reviewed_at` 非空；驳回或取消不消除原报工异常事实
- 索引：`INDEX (batch_step_record_id, review_status, created_at)`、`INDEX (production_batch_id, review_status, created_at)`

业务规则：

- 创建处置单前，application 必须确认来源是仍有效的 `normal` 报工且 `abnormal_quantity > 0`；冲销行和纯正常报工不得创建处置单。
- 普通状态转换为 `pending_review -> approved/rejected/cancelled`；驳回后如需补充信息再次提交，使用显式重提动作把同一处置单恢复为 `pending_review`，通过 `version` 和操作日志保留并发及历史审计，不新增第二张处置单。
- 审批使用 `version` 乐观锁。批准为 `rework` 时，在同一事务创建一条以本处置单为来源的 `rework_records`；批准为 `scrap` 时，在同一事务创建一条以本处置单为来源的 `batch_step_scrap_records`。两个目标表均必须对来源处置单建立唯一约束，防止重复生成。
- 第 8b 步已先于 `rework_records`、`batch_step_scrap_records` 落地；报工 application 实现后可以随异常报工创建 `pending_review` 处置单，但不得开放批准为 `rework/scrap` 的命令；下游模型和同事务生成规则落地后才能开放审批。
- 追加 migration 会为未被冲销的历史有效异常报工生成 `LEGACY-BSAD-{reportId}` 待审批处置单；已被全量冲销的异常报工不会生成待办。
- 报工冲销或更正必须检查本表及其下游依赖；存在依赖时遵守本章“下游依赖与连带冲销升级边界”。
- 页面上的待审批数和异常标志从本表查询派生，不写回 `batch_step_records`。未来需要同一次异常报工拆分多种处置时，应追加处置明细表并版本化调整当前唯一整体处置规则，不得修改原报工事实。

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
  -> batch_step_abnormal_dispositions（数据库已落地，应用闭环待实现）
```

`batch_step_abnormal_dispositions` 已作为追溯节点定稿并追加数据库 migration；报工创建、更正以及异常待处置展示已经落地，异常审批仍不在当前范围。质检、返工和成品流转只能在各自业务语义闭环后追加到主链。追溯查询可以使用受约束的冗余字段和快照，但任何库存数量只能从 `inventory_transaction` 汇总，任何生产需求只能从 `production_item_demand` 读取。

当前 Production 只读追溯已经落地查询投影：支持按工单号、生产批次号、物料编码和库存批次号定位生产批次，并读取工单/批次概览、`production_item_demand`、`production_item_allocation`、`outbound_order/outbound_detail`、对应的 `production_material_outbound` 库存流水、`batch_step_records`、`batch_step_reports` 普通/冲销/替代链及有效聚合、`batch_step_abnormal_dispositions` 待处置记录。该投影不创建第二事实表，不返回质量、返工、报废、退料或成品流向占位数据。
