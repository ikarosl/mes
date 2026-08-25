# 生产报工、追溯与质量边界

> [返回数据库设计总览](README.md)。本章是总览所引用的权威规范组成部分，不是独立副本。

本章所有计划、报工、异常、报废、补产授权与返工数量均为整数。普通正向事实的正常与异常数量可以分别为 `0`，但合计必须是 `1..99999999` 的整数；数据库以整数 `CHECK` 拒绝小数，路线放行、比较和累计只做整数运算，不使用缩放小数或误差阈值。

本章将“分批报工事实、异常整体处置、最小返工和报废补料”固化为当前可实施设计。异常处置仍以一次有效异常报工为最小审批对象，不拆分数量；返工以来源异常数量整体执行并在完成时追加一条报工事实；报废补料由管理员选择物料并人工填量，同一审批事务生成工序报废、补产授权、补料单和追加需求。过程质检、最终质量结论、短批完工和返工报工的部分完成仍不在当前范围。

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
- `completed` 禁止继续普通报工，但允许管理员冲销或更正已有报工。事务重新计算后若 `effective_normal` 仍等于 `required_normal`，工序保持 `completed`；若更正使有效正常量降低，或下游报废补产使当前要求正常量提高，导致 `effective_normal < required_normal`，工序按本章依赖规则自动重开为 `doing` 并清空 `completed_at`。原完工和重开历史由报工、报废补产事实及成功操作日志追溯，不覆盖或删除历史事实。
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

无论采用哪一版，已完成工序发生合法冲销、更正或下游报废补产目标增加后，均按本章统一规则重新计算：数量不足且允许继续生产时重开为 `doing`；更正存在下游冲突时拒绝，并提示管理员先按下游到上游顺序冲销冲突事实。

## 4.2 `batch_step_reports`

职责：记录每一次报工事实。同一工序允许分多次报工；已落库事实不得更新或删除，错误报工通过一条等量冲销事实撤回。管理员更正必须在一个命令和一个数据库事务内同时写入“原记录冲销 + 更正后的新记录”。

| 字段                     | 类型              | 说明                                                                 |
| ------------------------ | ----------------- | -------------------------------------------------------------------- |
| `id`                     | `BIGINT UNSIGNED` | 主键，自增                                                           |
| `report_no`              | `VARCHAR(100)`    | 报工事实编号，唯一；历史迁移使用 `LEGACY-SR-{stepId}`                |
| `production_batch_id`    | `BIGINT UNSIGNED` | 生产批次 ID                                                          |
| `batch_step_record_id`   | `BIGINT UNSIGNED` | 工序执行节点 ID                                                      |
| `report_type`            | `VARCHAR(20)`     | `normal` 正向报工事实、`reversal` 冲销事实；不表示正常品/异常品分类  |
| `reversal_of_report_id`  | `BIGINT UNSIGNED` | 冲销的原报工 ID；普通报工为空                                       |
| `replaces_report_id`     | `BIGINT UNSIGNED` | 更正后的普通报工所替代的原报工 ID；非更正报工为空                    |
| `reported_quantity`      | `DECIMAL(12,4)`   | 本事实的报工总数，必须大于 `0`                                      |
| `normal_quantity`        | `DECIMAL(12,4)`   | 本事实中工序层面的正常数量，不等同于质检合格数量                     |
| `abnormal_quantity`      | `DECIMAL(12,4)`   | 本事实中工序层面的异常数量；异常不自动等同于报废                     |
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
- 员工任务页把普通报工拆成“正常报工”和“异常报工”两个独立业务意图。普通报工创建命令必须保证 `normal_quantity` 与 `abnormal_quantity` 恰好只有一个大于 `0`：正常报工固定异常量为 `0`，异常报工固定正常量为 `0` 并要求填写 `abnormal_origin`。同一批现场结果包含正常和异常数量时，应连续提交两条独立事实，不得在一次普通报工中混报。
- 冻结路线首工序不存在前置工序，异常报工只能选择 `current_step`；前端不得展示 `previous_step` 选项，后端必须根据同批次冻结工序顺序再次校验并拒绝绕过前端的请求。不得只按 `step_order_snapshot = 1` 判断首工序，应以该批次按 `step_order_snapshot,id` 排序后的首条工序为准，否则会留下无法确定前置补料计算范围的异常事实。
- 上述互斥规则属于员工普通报工命令，不追加为 `batch_step_reports` 的全表 `CHECK`。原因是本表还承载历史混合报工的冲销/更正以及返工整单完成事实；返工完成仍允许正常量和再次异常量同时大于 `0`，且两者合计必须等于整笔返工数量。
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

- 当前不支持短批完工。报废补产不是在报废发生工序直接增加可报量，而是授权同一生产批次从路线起点重新投入相同数量，并按工序顺序重新流转到来源工序。当前最小闭环固定从 `step_order_snapshot` 最小的路线首工序重新投产，不允许管理员跳过上游选择任意重入工序；未来如支持半成品重入，必须为报废事实追加明确的重入工序并重新评审物料和数量口径。
- 对按路线顺序编号的工序 `i = 1..n`，令 `Q` 为生产批次计划量，`S[j]` 为 `quota_end_step_record_id` 位于工序 `j` 的补产授权数量。授权在批准报废时即写入 `batch_step_scrap_reproduction_authorization`；只有关联补料单为 `fulfilled` 时才进入可执行的 `S[j]`，批准、分配、创建待出库单或部分领料均不进入。
- 当前工序最终要求正常量 `required_normal[i]` 不再对所有工序固定为 `Q`：来源工序自己的报废不会提高自身最终正常目标，但任一后续工序的可执行补产会要求当前工序额外生产相同数量。因此 `required_normal[i]` 等于批次计划量加上所有下游补料已齐套的补产授权量。
- 当前工序投入放行量 `released_input[i]`：首工序等于批次计划量加上全路线可执行补产授权量；后续工序只读取紧邻前工序已经形成的正常产出。若紧邻前工序无需报工，则必须等待其本轮显式完成，再取该前工序当前 `required_normal`。来源工序不能因自己的报废审批直接获得额度，必须等补产对象实际走完全部上游工序。
- 物料补料需求数量由管理员填写，只决定补什么料、补多少料；产品补产数量来自不可变授权的 `authorized_quantity`，两者不得相乘或互相冒充。
- 直接报工有效总量 `effective_direct_reported` 只汇总操作员普通报工及其冲销/替代，不包含被 `rework_records.completed_report_id` 引用的返工完成报工。返工完成报工继续计入本工序总 `effective_normal/effective_abnormal`，但它是在重新处理原异常对象，不能再次消耗普通投入放行量。
- 令 `rejected_abnormal_reversal[i]` 表示本次“驳回并退回重报”为工序 `i` 追加的员工纯异常报工全量冲销量。它只用于说明本次事务引起的有效直接报工量变化，不是数据库中的独立额度字段，也不属于报废补产授权 `S[j]`。该值等于来源异常报工的 `reported_quantity`；历史混合报工、返工完成事实和更正替代事实不能使用该命令，因此不进入此变量。

```text
Q                          = production_batches.planned_quantity
S[j]                       = SUM(authorization.authorized_quantity)
                             WHERE production_material_supplement.status = 'fulfilled'
                               AND authorization.quota_end_step_record_id = step[j].id

required_normal[i]         = Q + SUM(S[j], j > i)

released_input[1]          = Q + SUM(S[j], j >= 1)
released_input[i > 1]      = previous_step.need_record_snapshot == 1
                             ? previous_step.effective_normal
                             : previous_step.status == completed
                               ? required_normal[i - 1]
                               : 0

available_report[i]        = MAX(
                               0,
                               released_input[i] - effective_direct_reported[i]
                             )

effective_direct_reported_after_reject[i]
                           = effective_direct_reported_before_reject[i]
                             - rejected_abnormal_reversal[i]

available_report_after_reject[i]
                           = MAX(
                               0,
                               released_input[i]
                                 - effective_direct_reported_after_reject[i]
                             )

current_submit.normal_quantity
  + current_submit.abnormal_quantity <= available_report[i]
```

`rejected_abnormal_reversal[i]` 不是在查询时额外加回 `available_report[i]` 的第二份额度。驳回事务写入的 `reversal` 已按负号参与 `effective_direct_reported[i]` 聚合，所以上述 `after_reject` 公式只是状态变化的展开说明；实际查询仍统一使用 `released_input[i] - effective_direct_reported[i]`，不得再叠加该变量造成重复返还。驳回也不会改变 `released_input[i]`、`required_normal[i]` 或任何 `batch_step_scrap_reproduction_authorization`。

数据库字段口径必须明确：系统没有名为“投入上限”的可写列，也不会把 `6` 回写到 `production_batches` 或 `batch_step_records`。`5 -> 6` 来自以下事实关联：

```sql
SELECT
  batch.planned_quantity AS base_quantity,
  COALESCE(SUM(authorization.authorized_quantity), 0) AS executable_reproduction_quantity,
  batch.planned_quantity + COALESCE(SUM(authorization.authorized_quantity), 0) AS first_step_released_input
FROM production_batches batch
LEFT JOIN batch_step_scrap_reproduction_authorization authorization
  ON authorization.production_batch_id = batch.id
LEFT JOIN production_material_supplement supplement
  ON supplement.id = authorization.supplement_id
 AND supplement.status = 'fulfilled'
WHERE batch.id = :production_batch_id
GROUP BY batch.id, batch.planned_quantity;
```

因此示例中的 `6` 由 `production_batches.planned_quantity = 5.0000` 与 `batch_step_scrap_reproduction_authorization.authorized_quantity = 1.0000` 相加得到。授权行在管理员批准时生成，`production_material_supplement.status = 'fulfilled'` 只是它进入可执行公式的物流开关；`fulfilled_at/fulfilled_by` 记录补料何时、由谁确认齐套。`production_item_demand.need_number` 只证明需要补什么料、补多少料，不参与产品数量 `5 + 1` 的加法。

- 例一：批次 `Q = 5`，路线 `A -> B`，A 先正常报工 `4`，再单独异常报工 `1`。A 报废补料确认领用后 `S[A] = 1`，所以 `required_normal[A] = 5`、`released_input[A] = 6`、A 剩余可报 `6 - (4 + 1) = 1`；A 再正常报工 `1` 后达到正常目标 `5`，B 获得正常放行 `5`。
- 例二：A 已正常报工 `5`，B 先正常报工 `4`，再单独异常报工 `1`。B 报废补料确认领用后 `S[B] = 1`，A 的 `required_normal[A]` 和 `released_input[A]` 都从 `5` 增为 `6`，A 重新打开并补报正常 `1`；在 A 形成第 `6` 件正常产出前，B 的 `released_input[B]` 仍为 `5`、剩余可报为 `0`。A 补产完成后 B 的投入放行才变为 `6`，此时 B 可再报正常 `1`，最终 B 正常量达到批次目标 `5`。
- 例三：路线 A→B→C，C 接手时发现一个前置异常。报工保存 `abnormal_origin = 'previous_step'`，管理员批准报废并选择 B 为 `material_end_step_record_id`；候选物料只汇总 A..B，但授权的 `quota_end_step_record_id` 仍是 C。补料齐套后 A、B 依次补产并形成新增正常量，C 才获得第六个投入并补报一个正常量。
- 只要当前工序 `effective_normal < required_normal[i]` 且 `available_report[i] > 0`，就允许继续新增普通报工。工序只在包含普通报工和返工完成报工在内的总 `effective_normal == required_normal[i]` 时自动完成；达到当前部分放行量不得提前完成。`abnormal_quantity` 不计入正常完成量和下工序放行量，但会消耗本工序投入放行量。
- 补料齐套使授权可执行时，所有位于路线起点至额度截止工序之前、且因 `required_normal` 增加而数量不足的已完成必报工工序，必须在同一事务重开为 `doing` 并清空 `completed_at`；已在执行中的工序保持 `doing`。这类重开保留原负责人和 `started_at`，页面标记为“下游报废补产”，不得要求重新派工或伪造新的首次开工时间。
- 位于补产路径中的非必报工工序如果已经完成，也必须重开为 `doing`，由原负责人再次显式确认本轮补产已经通过该工序；完成后下游才能按更新后的 `required_normal` 获得放行。当前聚合工序节点只表达最新执行状态，重复完成历史由报废来源、操作日志及状态时间追溯。
- 报废审批完成但补料需求尚未全部确认出库时，授权不可执行；页面应显示“补料领用未完成”，不能允许提前从路线起点补报。释放分配、取消待出库单或仅创建补料出库单均不算确认领用。
- 返工不形成 `S[j]`。返工完成只能通过对应 `rework_records` 完成命令一次性追加来源明确的返工报工事实，不能调用普通报工接口绕过来源唯一约束。
- 当前临时口径把操作员提交的 `normal_quantity` 视为该工序已经完成自检的正常数量；在过程质量模型缺失期间，`effective_normal` 临时作为下工序正常放行数量。该口径只用于生产过程流转，不得解释为最终质量合格结论。
- 冲销或更正上游事实后，如果新的上游 `effective_normal` 小于下游 `effective_direct_reported`，整个命令必须拒绝；下游报废补产量不能直接填补这个差额，因为它必须先在上游形成新的正常产出。错误响应必须指出冲突的下游工序、前道正常放行量和直接报工有效总量，并提示管理员按下游到上游顺序先完成合法冲销。
- 报工事务必须按 `step_order_snapshot` 的稳定顺序锁定当前工序及相邻约束工序的 `batch_step_records` 行，再读取有效汇总并校验，避免两个并发请求都通过旧汇总。
- 补料确认和报工事务必须在同一连接按路线顺序锁定受影响工序，并读取授权、补料需求和已确认出库累计；不得相信客户端提交的补产额度或“补料已完成”标志。最后一笔补料确认时，补料单 `fulfilled`、补产目标重算、受影响工序重开、库存流水、出库状态和成功审计同事务提交；授权行不得更新。数据库约束负责行内结构与引用完整性，“全量同值冲销、目标必须是有效普通事实、授权可执行、路线传播、上下工序上限、状态机”由 application 事务校验。

#### 当前最小返工来源规则与升级预留

- 异常数量不增加正常完成量，但必须计入 `effective_reported` 并消耗上游放行额度；连续提交异常报工不得绕过数量上限。
- 每张返工单最多生成一条完成报工，`rework_records.completed_report_id` 唯一指向该事实；完成报工的总量必须等于来源异常数量，因此同一返工来源不能重复消费。
- 最小返工不支持部分完成。返工再次产生异常时，完成报工照常生成新的异常处置单，可进入下一轮返工或报废补料。
- 半自动补料不增加生产批次计划量；批准时生成等量路线补产授权，全部补料需求完成确认领料后才允许执行，并从首工序向额度截止工序逐道传播。页面必须分别展示补料物流进度、补产起点、受影响路径、各工序新增正常目标和剩余可报量，不得把人工填写的物料数量展示成产品补产数量，也不得在来源工序直接显示“可补报”。
- 当前补产额度以唯一的工序报废补产授权为事实，足以闭合整笔报废补产；当前不记录某次补报逐笔消费哪张授权。后续若需要部分执行、指定来源消费、返工分批产出或短批完工，必须追加独立消费事实和版本化接口，不得改变已落库报工事实。

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
- `rejected/cancelled` 必须满足 `disposition_type` 为空且 `reviewed_by/reviewed_at` 非空；`rejected` 命令必须同时追加来源报工冲销，`cancelled` 状态本身不改变来源事实；来源事实是否有效始终只由冲销链决定
- 索引：`INDEX (batch_step_record_id, review_status, created_at)`、`INDEX (production_batch_id, review_status, created_at)`

业务规则：

- 创建处置单前，application 必须确认来源是仍有效的 `normal` 报工且 `abnormal_quantity > 0`；冲销行和纯正常报工不得创建处置单。
- 普通状态转换为 `pending_review -> approved/rejected/cancelled`。`approved` 表示异常属实并选择返工或报废；`rejected` 只用于管理员确认整笔员工异常报工的数量或异常来源填写错误，并通过下述“驳回并退回重报”命令进入；`cancelled` 只用于来源报工已被其他合法冲销链终止后的处置单收口。终态处置单不得恢复为 `pending_review`。
- 审批使用 `version` 乐观锁。批准为 `rework` 时，在同一事务创建一条以本处置单为来源的 `rework_records`；批准为 `scrap` 时，审批请求必须选择物料计算截止工序并提交至少一条人工补料需求，在同一事务创建 `batch_step_scrap_records`、`batch_step_scrap_reproduction_authorization`、`production_material_supplement` 和 `scrap_supplement` 需求。两个处置目标均对来源处置单建立唯一约束。
- 管理端批准报废前必须经过“编辑需求 -> 暂存需求 -> 复核并确定报废生成”三段交互。暂存写入 `production_scrap_supplement_plan/_line` 服务端草稿，不创建正式 `production_item_demand`、不改变处置状态，也不允许分配或出库；管理员可以重新打开或返回继续编辑。只有最终点击“确定报废并生成”才执行上一条所述的同事务写入，并把方案转为 `confirmed`。草稿查询、乐观锁整体保存、最终确认事务与管理端恢复接线已经落地。
- 员工普通报工必须把正常和异常分成不同请求；每张异常报工只能选择一个 `abnormal_origin`。同一来源下更细的异常类别当前由上报人整笔判断并写入说明，系统尚无结构化异常类型字典；混入不同来源、数量填错或整笔误报时，管理员必须驳回整笔，不允许部分处置。
- 管理端不得提供“只把处置单改成 `rejected`”的空驳回，也不得物理删除来源报工。“驳回并退回重报”必须填写原因；后端在一个事务内锁定来源员工异常报工与处置单，追加原报工的全量同值冲销，把原处置单转为 `rejected`，递增工序版本并写成功审计。该命令不追加正常报工、替代报工、报废事实或补产授权；员工随后按正确数量和异常来源重新提交，形成可追溯的新报工及新待处置单。
- “驳回并退回重报”只适用于 `normal_quantity = 0` 的员工直接异常报工。返工完成事实或历史正常/异常混合事实必须拒绝该命令，并使用保留冲销/替代链的专用报工更正流程；存在已批准返工、报废、补料、出库或其他不可逆下游依赖时同样拒绝。已批准处置的审批错误留给后续独立业务冲销设计修正。
- 修复迁移只为历史上已经标记为 `rejected`、仍有效、`normal_quantity = 0`、不是更正替代事实且不属于返工完成的直接异常报工追加确定性的全量冲销。历史混合及更正链事实不做猜测性回填。
- 追加 migration 会为未被冲销的历史有效异常报工生成 `LEGACY-BSAD-{reportId}` 待审批处置单；已被全量冲销的异常报工不会生成待办。
- 报工冲销或更正必须检查本表及其下游依赖；存在依赖时遵守本章“下游依赖与连带冲销升级边界”。
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
| `scrap_quantity`          | `DECIMAL(12,4)`   | 报废产品数量，等于来源报工的全部异常数量且大于 `0` |
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

#### `batch_step_scrap_reproduction_authorization`

设计类型：不可变业务事实表。

职责：保存一条工序报废事实对应的产品补产授权，明确补产产品数量、固定从哪一道工序重新投入、额度传播到哪一道工序，以及补料候选物料计算到哪一道工序。授权在管理员批准报废时与报废事实、补料单和补料需求同事务创建；物流进度不得回写本表。

| 字段                        | 类型              | 说明                                                         |
| --------------------------- | ----------------- | ------------------------------------------------------------ |
| `id`                        | `BIGINT UNSIGNED` | 主键，自增                                                   |
| `production_batch_id`       | `BIGINT UNSIGNED` | 所属生产批次 ID                                              |
| `scrap_record_id`           | `BIGINT UNSIGNED` | 唯一来源工序报废事实 ID                                      |
| `supplement_id`             | `BIGINT UNSIGNED` | 唯一关联补料物流单 ID                                        |
| `entry_step_record_id`      | `BIGINT UNSIGNED` | 补产重新投入工序；当前固定为生产批次路线首工序               |
| `quota_end_step_record_id`  | `BIGINT UNSIGNED` | 补产额度传播截止工序；固定为异常上报工序                     |
| `material_end_step_record_id` | `BIGINT UNSIGNED` | 管理员确认的物料计算截止工序，决定补料候选所覆盖的路线区间   |
| `authorized_quantity`       | `DECIMAL(12,4)`   | 产品补产授权数量；批准时等于报废数量且必须大于 `0`           |
| `authorized_by`             | `BIGINT UNSIGNED` | 批准补产的管理员 ID                                          |
| `authorized_at`             | `DATETIME`        | 管理员批准补产的时间                                         |
| `created_at`                | `DATETIME`        | 授权事实创建时间                                             |

数据库约束：

- `UNIQUE (scrap_record_id)`，一条报废事实只能形成一条补产授权。
- `UNIQUE (supplement_id)`，一张补料物流单只能服务一条补产授权。
- `(scrap_record_id, production_batch_id, quota_end_step_record_id) -> batch_step_scrap_records(id, production_batch_id, batch_step_record_id)`，保证授权批次及额度截止工序与报废事实同源。
- `(supplement_id, production_batch_id) -> production_material_supplement(id, production_batch_id)`。
- 入口工序、物料截止工序分别以组合外键关联同一生产批次的 `batch_step_records`；`authorized_by -> users.id`。
- `CHECK (authorized_quantity > 0)`。
- 表只保存批准和创建事实，不提供状态、更新、软删除或删除审计字段。
- 索引：`INDEX (production_batch_id, quota_end_step_record_id, authorized_at)`。

应用规则：

- `authorized_quantity` 必须等于 `batch_step_scrap_records.scrap_quantity`；数据库只保证两者同源，数值相等由批准事务校验。
- `supplement_id` 必须指向 `source_type = 'step_scrap_reproduction'` 且与当前报废事实同源的补料单；`material_loss` 补料单不得关联产品补产授权。
- `entry_step_record_id` 必须是路线首工序；`material_end_step_record_id` 不得晚于 `quota_end_step_record_id`。
- `abnormal_origin = 'previous_step'` 时，物料截止工序必须严格早于异常上报工序；当前工序异常可以选择异常上报工序作为物料截止。
- 本表没有“待生效/已生效”状态。`source_type = 'step_scrap_reproduction'` 的关联补料单进入 `fulfilled` 后，授权进入路线额度公式；此后发生生产领料损耗时走 `item_scrap(production_consumed) -> production_material_supplement(material_loss)` 的一比一实物补料链路，原授权数量和产品可报上限不变。普通退料不是损耗，不得借此生成新的产品授权或损耗补料。

## 4.5 `rework_records`（当前最小返工）

职责：承载一张已批准返工的异常处置单。当前返工固定回到来源工序、沿用来源工序当前负责人和单位，数量等于来源报工的全部异常数量，不支持拆分、改路线或转移负责人。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | 主键 |
| `rework_no` | `VARCHAR(100)` | 返工单号，唯一 |
| `abnormal_disposition_id` | `BIGINT UNSIGNED` | 来源异常处置单，唯一 |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID |
| `batch_step_record_id` | `BIGINT UNSIGNED` | 返回执行的来源工序 |
| `source_report_id` | `BIGINT UNSIGNED` | 来源异常报工 |
| `responsible_user_id` | `BIGINT UNSIGNED` | 批准时冻结的返工负责人 |
| `rework_quantity` | `DECIMAL(12,4)` | 来源异常数量快照，必须大于 `0` |
| `unit_snapshot` | `VARCHAR(20)` | 来源报工单位快照 |
| `status` | `VARCHAR(30)` | `pending`、`doing`、`completed`、`cancelled` |
| `completed_report_id` | `BIGINT UNSIGNED` | 返工完成时生成的报工事实，唯一；完成前为空 |
| `started_at` / `completed_at` | `DATETIME` | 开始和完成时间 |
| `version` | `INT` | 乐观锁版本 |
| `remark` | `TEXT` | 审批、开始、完成或取消说明 |
| 业务审计字段 | 见统一规则 | 可变返工单审计字段 |

约束与事务规则：

- `UNIQUE (abnormal_disposition_id)`、`UNIQUE (completed_report_id)`；处置单、工序、来源报工和批次使用组合外键保证同源。
- 批准返工只接受 `pending_review`，且来源普通报工仍有效、异常数量大于 `0`、来源工序存在负责人；处置单更新为 `approved/rework` 与返工单创建、成功审计同事务。
- 持久化状态机为 `pending -> doing -> completed`，并预留 `pending/doing -> cancelled`；开始和完成只允许冻结的负责人操作并使用 `version` 乐观锁。当前 API 与管理端只开放批准创建、开始和整笔完成，尚未开放返工取消命令；在取消事务、权限、审计和测试落地前，不得仅按表中存在 `cancelled` 值宣称取消能力已发布。
- 完成请求提交 `normal_quantity` 和 `abnormal_quantity`，两者非负且合计必须精确等于 `rework_quantity`。同一事务追加一条 `batch_step_reports.normal` 事实、按正常数量重新计算工序完成状态；若返工仍有异常，同时创建新的待处置单；最后把新报工 ID 写入 `completed_report_id` 并提交成功审计。
- 返工完成报工是返工单的下游依赖，不能通过通用报工冲销/更正入口调整。结果错误或需要部分完成时必须新增专用返工修正设计。

## 4.6 成品流转边界（待业务决策）

现有草案曾使用 `finished_flow_records`。在质量放行和入库边界定稿前不得创建该表。即使后续落地，有库存增减的流转也必须关联 `inventory_transaction`；流转里程碑本身不得成为第二库存事实来源。

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

`batch_step_abnormal_dispositions` 已作为追溯节点定稿并追加数据库 migration；报工创建、更正、异常审批、最小返工和报废补料业务均已落地。过程质检、最终质量和成品流转只能在各自业务语义闭环后追加到主链。追溯查询可以使用受约束的冗余字段和快照，但任何库存数量只能从 `inventory_transaction` 汇总，任何生产需求只能从 `production_item_demand` 读取。

当前 Production 只读追溯已经落地查询投影：支持按工单号、生产批次号、物料编码和库存批次号定位生产批次，并读取工单/批次概览、`production_item_demand`、`production_item_allocation`、`outbound_order/outbound_detail`、对应的 `production_material_outbound` 库存流水、`batch_step_records`、`batch_step_reports` 普通/冲销/替代链及有效聚合、`batch_step_abnormal_dispositions` 待处置记录。该投影不创建第二事实表，不返回质量、返工、报废、退料或成品流向占位数据。
