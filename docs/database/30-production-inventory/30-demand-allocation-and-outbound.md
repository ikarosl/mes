# 生产需求、分配与领料出库

> [返回生产与库存总览](README.md) · [返回数据库设计总览](../README.md)。本章是生产与库存规范的组成部分，不是独立副本。

## 3.5 生产物料需求与分配表

> `demand_type` 已从历史数字迁移为字符串。当前设计使用 `normal/manual_additional/scrap_supplement/material_loss_supplement` 四种产生规则；工序报废补料和生产领料损耗补料均由补料单直接生成新需求，不修改原需求，也不再维护与需求重复的补料明细。工序报废批准时写入不可变补产授权，只有对应补料单全部需求确认领用并进入 `fulfilled` 后，该授权才成为可执行额度；生产领料损耗补料只恢复实物，不产生或增加产品补产额度。

核心设计原则：系统将“生产授权上限”与“现场物料可用量”解耦。授权只控制生产批次允许生产的产品数量，不因确认领料后的现场损耗动态回收额度；实际物料损耗通过“损耗报废 → 损耗补料 → 物料需求 → 分配与出库”独立闭环处理。该取舍用于控制轻量 MES 的状态维护成本：系统不建立授权额度与每一份现场物料的实时占用、回收或消费映射，也不得为了物料损耗修改 `authorized_quantity`、回退已齐套工序报废补料单或收缩已经形成的产品可报上限。现场缺料由实物条件和待完成损耗补料物流约束，不能通过重复申请产品补产授权解决。

---

### 10. `production_item_demand`

职责：维护生产批次的投入需求，是物料、半成品、辅料等生产投入对象的需求来源表。

视图汇总版本中，该表只保存需求事实，不保存累计分配、累计出库、累计退料、累计报废等缓存字段。

| 字段                               | 类型              | 说明                                      |
| ---------------------------------- | ----------------- | ----------------------------------------- |
| `id`                               | `BIGINT UNSIGNED` | 主键                                      |
| `production_batch_id`              | `BIGINT UNSIGNED` | 生产批次 ID，关联 `production_batches.id` |
| `product_material_id`              | `BIGINT UNSIGNED` | 统一 BOM 明细 ID；正常需求必须保存        |
| `item_id`                          | `BIGINT UNSIGNED` | 需求对象 ID，关联 `products.id`           |
| `quantity_per_unit_snapshot`       | `DECIMAL(12,4)`   | 生成需求时的 BOM 单件用量快照             |
| `unit_snapshot`                    | `VARCHAR(20)`     | 生成需求时的用量单位快照                  |
| `is_key_material_snapshot`         | `TINYINT`         | 关键物料标志快照                          |
| `need_batch_record_snapshot`       | `TINYINT`         | 批次追溯要求快照                          |
| `planned_output_quantity_snapshot` | `DECIMAL(12,4)`   | 生成需求时的批次计划产量快照              |
| `need_number`                      | `DECIMAL(12,4)`   | 需求数量                                  |
| `demand_type`                      | `VARCHAR(30)`     | 需求类型，默认 `normal`                   |
| `idempotency_key`                  | `VARCHAR(150)`    | 幂等键，同一键重复提交返回既有结果        |
| `parent_demand_id`                 | `BIGINT UNSIGNED` | 追加需求关联的原始正常需求 ID             |
| `supplement_id`                    | `BIGINT UNSIGNED` | 补料物流单 ID，仅两类补料需求填写         |
| `business_status`                  | `VARCHAR(30)`     | 业务状态，默认 `active`                   |
| `version`                          | `INT`             | 乐观锁版本号，默认 `0`                    |
| 业务审计字段                       | 见统一规则        | 可变业务单据审计字段                      |

字段说明：
<!-- demand_type = 这条需求如何产生、应该走哪套业务规则 -->

`demand_type` 是唯一的需求原因/业务规则字段，不再另设 `reason_type`。单据说明归补料单等来源单据所有，不复制到每条需求；这样避免同一原因在多列和多表中出现不一致。

| 字段                                           | 说明                                             |
| ---------------------------------------------- | ------------------------------------------------ |
| `product_material_id`                          | 正常需求必须保存，用于追溯来源 BOM 明细          |
| `item_id`                                      | 受组合外键保护的需求对象冗余，便于查询和约束     |
| `quantity_per_unit_snapshot` / `unit_snapshot` | 保证 BOM 修改后仍可还原需求计算口径              |
| `need_number`                                  | 需求事实，不应因为出库、退料、报废而直接修改     |
| `demand_type`                                  | `normal` 正常需求、`manual_additional` 人工追加、`scrap_supplement` 工序报废补料、`material_loss_supplement` 生产领料损耗补料 |
| `parent_demand_id`                             | 补料需求关联的原始需求                           |
| `supplement_id`                                | 补料需求的物流来源单据；具体业务来源由补料单的 `source_type` 和受约束来源外键确定 |
| `idempotency_key`                              | 幂等键，同一键重复提交返回既有结果               |
| `business_status`                              | 业务状态，不表达数量进度                         |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (production_batch_id) REFERENCES production_batches(id)`
- 外键：`FOREIGN KEY (item_id) REFERENCES products(id)`
- 外键：`FOREIGN KEY (product_material_id, item_id) REFERENCES product_materials(id, material_product_id)`
- 组合外键：`(parent_demand_id, production_batch_id, product_material_id, item_id) -> production_item_demand(id, production_batch_id, product_material_id, item_id)`
- 组合外键：`(supplement_id, production_batch_id) -> production_material_supplement(id, production_batch_id)`
- 检查约束：`CHECK (need_number > 0)`
- 检查约束：`CHECK (demand_type IN ('normal', 'manual_additional', 'scrap_supplement', 'material_loss_supplement'))`
- 检查约束：`CHECK (business_status IN ('active', 'cancelled'))`；它只表示需求是否仍有效，数量进度从分配和出库事实派生
- 组合索引：`INDEX (production_batch_id, business_status)`，用于查询批次有效需求
- 检查约束：正常需求要求 `parent_demand_id IS NULL AND supplement_id IS NULL`
- 检查约束：人工追加需求要求 `parent_demand_id IS NOT NULL AND supplement_id IS NULL`
- 检查约束：报废补料要求 `parent_demand_id IS NOT NULL AND supplement_id IS NOT NULL`
- 检查约束：生产领料损耗补料要求 `parent_demand_id IS NOT NULL AND supplement_id IS NOT NULL`
- 检查约束：正常需求的 BOM 快照字段不得为空且均大于 `0`
- 唯一约束：`UNIQUE (idempotency_key)`
- 唯一约束：`UNIQUE (id, item_id)`
- 唯一约束：`UNIQUE (id, production_batch_id)`
- 唯一约束：`UNIQUE (supplement_id, parent_demand_id)`；当前工序报废补料对同一原始需求最多生成一条需求，生产领料损耗补料固定只有一条需求
- 索引：`INDEX (supplement_id, business_status)`

迁移说明：`202608200001-production-scrap-reproduction-authorization` 将既有工序补料明细无损折叠为 `production_item_demand.supplement_id`，删除 `source_scrap_id/source_supplement_detail_id/reason_type/remark`，并把业务状态收紧为 `active/cancelled`。已执行 migration 不修改。

视图版本删除字段：

| 删除字段             | 删除原因                                             |
| -------------------- | ---------------------------------------------------- |
| `allocated_quantity` | 由 `production_item_allocation.assigned_number` 汇总 |
| `outbound_quantity`  | 由 `outbound_detail.outbound_number` 汇总            |
| `returned_quantity`  | 由 `return_detail.return_number` 汇总                |
| `scrapped_quantity`  | 由 `item_scrap.scrap_number` 汇总                    |

说明：

- 半成品也可以作为生产投入需求。
- 如果某个生产批次需要领用上一个生产批次产出的半成品，也应通过该表生成需求。
- 补料不建议直接修改原需求的 `need_number`，应新增一条需求记录。
- 正常需求的 `need_number = quantity_per_unit_snapshot * planned_output_quantity_snapshot`；结果生成后作为事实保存，不随 BOM 或批次计划变化自动回写。
- 幂等键使用稳定格式：正常需求为 `NORMAL:{production_batch_id}:{product_material_id}`，工序报废补料为 `SCRAPSUP:{supplement_id}:{parent_demand_id}`，生产领料损耗补料为 `LOSSSUP:{supplement_id}:{material_loss_scrap_id}`，人工追加为 `ADDITIONAL:{production_batch_id}:{business_action_no}:{product_material_id}`。
- `business_action_no` 必须是一次人工追加动作的稳定唯一编号；相同幂等键重复提交时返回既有需求，不插入新记录，也不得修改既有 `need_number`。
- 应用事务必须校验 `parent_demand_id` 指向的原需求与当前需求属于同一生产批次，且 `product_material_id` 对应投入对象与 `item_id` 一致。
- 报废补料必须校验补料单、授权、原需求和新增需求属于同一生产批次，且 BOM 明细与物料一致。
- 生产领料损耗补料必须从损耗事实所指向的需求/分配行取得 BOM、物料、单位和批次关系；`need_number` 固定等于已确认损耗数量，不接受客户端填写，不允许改量或选择不补料。
- 需求事实和对应操作日志必须在同一事务写入。

### 10.1 `production_scrap_supplement_plan` / `production_scrap_supplement_plan_line`

设计类型：可变业务方案主表及其可变明细。

职责：承载管理员在异常正式批准报废前暂存、重开和复核的补料方案。方案不是正式物料需求，不得进入分配、出库或库存计算；只有最终确认事务才把方案明细复制为 `production_item_demand(scrap_supplement)`，并同时生成报废事实、补产授权和补料物流单。

`production_scrap_supplement_plan` 字段：

| 字段                          | 类型              | 说明                                                         |
| ----------------------------- | ----------------- | ------------------------------------------------------------ |
| `id`                          | `BIGINT UNSIGNED` | 主键，自增                                                   |
| `plan_no`                     | `VARCHAR(100)`    | 方案编号，唯一                                               |
| `abnormal_disposition_id`     | `BIGINT UNSIGNED` | 来源待处置异常 ID，唯一；同一异常只有一个当前方案            |
| `production_batch_id`         | `BIGINT UNSIGNED` | 生产批次 ID                                                  |
| `batch_step_record_id`        | `BIGINT UNSIGNED` | 异常上报工序执行节点 ID                                      |
| `source_report_id`            | `BIGINT UNSIGNED` | 来源异常报工事实 ID                                          |
| `material_end_step_record_id` | `BIGINT UNSIGNED` | 管理员选择的候选物料范围截止工序                             |
| `status`                      | `VARCHAR(20)`     | `draft`、`confirmed`                                         |
| `confirmed_supplement_id`     | `BIGINT UNSIGNED` | 最终确认后生成的补料物流单 ID；草稿为空                      |
| `remark`                      | `TEXT`            | 方案及最终审批说明                                           |
| `version`                     | `INT`             | 乐观锁版本号，默认 `0`                                       |
| 业务审计字段                  | 见统一规则        | `created_by/created_at/updated_by/updated_at`                 |

`production_scrap_supplement_plan_line` 字段：

| 字段                  | 类型              | 说明                                                     |
| --------------------- | ----------------- | -------------------------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键，自增                                               |
| `plan_id`             | `BIGINT UNSIGNED` | 所属方案 ID                                              |
| `production_batch_id` | `BIGINT UNSIGNED` | 所属生产批次 ID                                         |
| `original_demand_id`  | `BIGINT UNSIGNED` | 选中的原始正常需求 ID                                   |
| `product_material_id` | `BIGINT UNSIGNED` | BOM 明细 ID                                             |
| `item_id`             | `BIGINT UNSIGNED` | 物料 ID                                                 |
| `planned_quantity`    | `DECIMAL(12,4)`   | 管理员填写并暂存的补料数量，必须大于 `0`                |
| `unit_snapshot`       | `VARCHAR(20)`     | 原始正常需求的单位快照                                   |
| 业务审计字段          | 见统一规则        | `created_by/created_at/updated_by/updated_at`             |

数据库约束与应用规则：

- `UNIQUE (abnormal_disposition_id)`；方案与异常处置一对一，不用新增方案覆盖旧方案。
- 来源异常使用 `(abnormal_disposition_id, production_batch_id, batch_step_record_id, source_report_id)` 组合外键，禁止跨批次、跨工序或跨报工暂存。
- 物料截止工序使用 `(material_end_step_record_id, production_batch_id)` 组合外键。
- `draft` 要求 `confirmed_supplement_id IS NULL`；`confirmed` 要求其非空且指向同批次 `production_material_supplement`。
- 明细使用 `(plan_id, original_demand_id)` 唯一约束；原始需求、批次、BOM 明细和物料使用组合外键保持一致。
- 草稿可通过 `version` 乐观锁反复整体替换明细；每次保存必须记录成功操作日志。`confirmed` 为终态，不得恢复为 `draft` 或继续编辑。
- 草稿行不是需求事实，因此不写 `production_item_demand`、不产生幂等需求键，也不允许分配和出库。
- 最终确认必须锁定待处置异常及方案版本，重新校验来源报工有效、路线截止工序、候选物料和数量；同一事务批准异常、创建工序报废事实、补产授权、补料单、正式需求，将方案转为 `confirmed` 并关联补料单，同时提交成功审计和 HTTP 幂等结果。
- 当前不计算或保存推荐补料数量。路线范围只决定候选物料，`planned_quantity` 完全由管理员填写；工序级定量 BOM 未定稿前不得用产品 BOM 总用量或异常数量自动推算。

状态机：

```text
draft -> confirmed
```

### 10.2 `production_material_supplement`

设计类型：可变业务单据。

职责：作为生产补料的统一物流主单，表达补料因何产生、属于哪个生产批次，以及其直接拥有的补料需求是否已经全部确认领用。它不重复保存物料、数量和单位明细；这些需求事实只保存在 `production_item_demand`。工序报废产品补产与生产领料损耗共用本表及后续分配、出库链路，但只有工序报废来源存在产品补产授权。

| 字段                      | 类型              | 说明                                                               |
| ------------------------- | ----------------- | ------------------------------------------------------------------ |
| `id`                      | `BIGINT UNSIGNED` | 主键，自增                                                         |
| `supplement_no`           | `VARCHAR(100)`    | 补料单号，唯一                                                     |
| `source_type`             | `VARCHAR(40)`     | 来源类型：`step_scrap_reproduction`、`material_loss`               |
| `step_scrap_record_id`    | `BIGINT UNSIGNED` | 工序报废事实 ID；仅工序报废补产填写                               |
| `material_loss_scrap_id`  | `BIGINT UNSIGNED` | 生产领料损耗报废记录 ID；仅生产领料损耗填写                       |
| `production_batch_id`     | `BIGINT UNSIGNED` | 所属生产批次 ID                                                    |
| `batch_step_record_id`    | `BIGINT UNSIGNED` | 工序报废来源工序执行节点 ID；生产领料损耗为空                     |
| `status`                  | `VARCHAR(30)`     | 物流状态：`approved`、`fulfilled`                                  |
| `fulfilled_by`            | `BIGINT UNSIGNED` | 最后一项需求完成确认领用的操作人；未齐套时为空                     |
| `fulfilled_at`            | `DATETIME`        | 全部直接补料需求完成确认领用时间；未齐套时为空                     |
| `remark`                  | `TEXT`            | 来源审批或损耗确认说明                                             |
| `version`                 | `INT`             | 乐观锁版本号，默认 `0`                                             |
| 业务审计字段              | 见统一规则        | `created_by/created_at/updated_by/updated_at`                       |

数据库约束：

- 主键：`id`。
- 唯一约束：`UNIQUE (supplement_no)`、`UNIQUE (id, production_batch_id)`。
- 唯一约束：`UNIQUE (step_scrap_record_id)`、`UNIQUE (material_loss_scrap_id)`；两个可空来源分别保持一对一。
- 组合外键：`(step_scrap_record_id, production_batch_id, batch_step_record_id) -> batch_step_scrap_records(id, production_batch_id, batch_step_record_id)`。
- 组合外键：`(material_loss_scrap_id, production_batch_id) -> item_scrap(id, production_batch_id)`。
- 外键：`fulfilled_by` 及业务审计操作者字段关联 `users.id`。
- 检查约束：`CHECK (source_type IN ('step_scrap_reproduction', 'material_loss'))`。
- 检查约束：`step_scrap_reproduction` 要求 `step_scrap_record_id`、`batch_step_record_id` 非空且 `material_loss_scrap_id` 为空；`material_loss` 要求 `material_loss_scrap_id` 非空且 `step_scrap_record_id`、`batch_step_record_id` 为空。
- 检查约束：`CHECK (status IN ('approved', 'fulfilled'))`。
- 检查约束：`approved` 要求 `fulfilled_by/fulfilled_at` 均为空；`fulfilled` 要求二者均非空。
- 检查约束：`CHECK (version >= 0)`。
- 索引：`INDEX (production_batch_id, status, created_at)`、`INDEX (source_type, status, created_at)`。

状态机与来源规则：

```text
approved -> fulfilled
```

- 本表状态只表达补料物流是否齐套，不表达异常审批结果、报废事实是否成立或产品补产授权是否存在。状态转换由最后一项补料确认领用事务触发，必须递增 `version`；终态不得通过通用更新接口恢复为 `approved`。
- `source_type = 'step_scrap_reproduction'`：管理员批准工序异常为报废时，同一事务创建工序报废事实、产品补产授权、本补料单以及一到多条 `scrap_supplement` 需求。候选物料由路线范围辅助，管理员确定每种物料补料数量。
- `source_type = 'material_loss'`：管理员确认 `item_scrap.scrap_scene = 'production_consumed'` 的生产领料损耗时，同一事务创建本补料单和且仅一条 `material_loss_supplement` 需求；物料、BOM、单位和原始需求关系从损耗记录所引用的分配行复制，需求数量固定等于 `item_scrap.scrap_number`。接口不提供“不补料”或修改补料数量的参数。
- 若损耗来源分配行本身属于补料需求，新需求的 `parent_demand_id` 继续指向该链路的原始正常需求，不形成需求到需求的无限嵌套；损耗事实和补料单共同保留直接来源。
- 每张补料单必须至少拥有一条 `business_status = 'active'` 且类型与 `source_type` 匹配的直接需求。最后一项直接需求的已确认出库累计达到 `need_number` 时，同一事务把补料单转为 `fulfilled`，写入 `fulfilled_by/fulfilled_at`、递增 `version` 并记录成功审计。
- 工序报废补料单进入 `fulfilled` 后，对应 `batch_step_scrap_reproduction_authorization.authorized_quantity` 才进入路线数量公式，并按既有规则重开受影响工序。生产领料损耗补料单进入 `fulfilled` 只表示替代物料已经领齐，不创建授权、不增加 `authorized_quantity`、不重开工序，也不改变生产批次计划量或首工可报上限。
- `202608200002-production-material-loss-supplement` 已将原持久字段 `scrap_record_id` 语义化重命名为 `step_scrap_record_id`，新增 `source_type/material_loss_scrap_id/version/updated_by/updated_at`，并将历史行全部回填为 `step_scrap_reproduction`；更早已执行 migration 未被修改。

### `batch_step_scrap_records` 与半自动补料

- `batch_step_scrap_records` 是已批准不可返工的工序损失事实：对 `abnormal_disposition_id` 唯一，保存批次、工序、来源报工、异常数量和单位快照；只追加、不更新、不删除。
- `batch_step_scrap_reproduction_authorization` 是“工序报废补产授权”的不可变事实。它对报废事实和补料单分别唯一，固定生产批次、首工序入口、补产额度截止工序、物料计算截止工序、授权数量和审批人/时间。表名显式包含 `scrap`，避免与返工混淆。
- `production_material_supplement` 是两类补料共用的物流主单；完整字段与约束见上节。状态只表示 `approved`（等待补料领用）或 `fulfilled`（全部直接需求已确认领用），不承担“是否批准补产”的语义。
- 补料单直接通过 `production_item_demand.supplement_id` 拥有需求：工序报废来源拥有一到多条 `scrap_supplement`，生产领料损耗来源固定拥有一条 `material_loss_supplement`；不再设置与需求的物料、数量、单位、原需求重复的 `production_material_supplement_detail`。
- 系统只提供候选物料，不自动计算每种物料的补料数量。管理员选择物料并手工填写数量，系统不得使用工序异常数量乘 BOM 用量推算补料数量。
- 报工异常必须说明 `abnormal_origin`：`current_step` 表示当前工序加工异常，`previous_step` 表示接手时发现前置异常。管理员批准报废时必须选择 `material_end_step_record_id`。当前工序异常可选首工序至当前工序；前置异常只能选择严格早于异常上报工序的截止工序。
- 候选物料汇总路线首工序至管理员所选物料截止工序绑定的有效 `route_step_materials`，相同 BOM 明细去重；该路径没有绑定物料时，可以降级展示当前产品的全部有效 BOM 物料。候选范围只用于辅助选择，不构成数量计算或工序消耗事实。
- 系统校验管理员选择的物料属于当前产品与当前候选、补料数量大于 `0`、单位与原需求口径一致；最终选择直接固化为新增需求的 BOM/物料/数量/单位快照和 `parent_demand_id`。
- 批准报废与补料是一个原子命令：处置单批准、工序报废事实、补产授权、补料单、每条 `scrap_supplement` 需求、成功审计和 HTTP 幂等结果同事务提交。
- 工序报废数量与物料补料数量是两个口径。管理员填写的补料需求只决定物料需求；产品补产数量固定取授权的 `authorized_quantity`（批准时复制报废数量），不得按 BOM 或补料需求反推产品数量。
- 补产固定从路线首工序重新投产，补产额度的 `quota_end_step_record_id` 固定为异常上报工序；物料截止工序只缩小补料推荐范围，不能缩短产品额度的逐道传播。例如 A→B→C 中，C 上手发现前置异常并选择 B 为物料截止：物料推荐 A..B，补产仍从 A 逐道放行至 C。
- 可执行补产额度只读取“授权事实 + 对应补料单 `fulfilled`”。最后一项需求达到全量确认出库时，同一事务只把补料单改为 `fulfilled` 并重开受影响已完成工序；不得再次创建或修改授权。分配、待出库或部分确认领料均不可执行额度。
- 因此当前链路闭合为“工序报废与补产授权 → 人工补料 → 新需求 → 分配 → 确认出库 → 授权可执行 → 首工序重新生产 → 逐工序正常放行 → 来源工序补报”。当前仍不记录某次补报逐笔消费哪张授权；未来需要部分执行、指定来源消费或半成品重入时，再追加额度消费/重入事实和版本化接口。
- 工序报废补料审批只接受 `doing` 批次；生产领料损耗申报与确认接受 `material_outbound/doing` 批次。后续分配、释放分配、创建和确认领料出库在这两个状态下只允许操作符合来源状态的 `scrap_supplement/material_loss_supplement` 需求，普通需求仍受原物料阶段状态机约束。补料物流不得把批次状态退回 `material_pending/material_assigned/material_outbound`，也不得代替首工序开工把 `material_outbound` 推进为 `doing`。

---

### 11. `production_item_allocation`

职责：维护生产批次的物料分配明细，记录某条需求分配到了哪个库存批次以及分配数量。

分配代表业务预留。已分配但未出库的数量，应从可分配库存中扣除，避免其他生产批次抢占。

| 字段                  | 类型              | 说明                                                  |
| --------------------- | ----------------- | ----------------------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                                                  |
| `demand_id`           | `BIGINT UNSIGNED` | 需求 ID，关联 `production_item_demand.id`             |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID，冗余保存，便于查询和约束                 |
| `item_id`             | `BIGINT UNSIGNED` | 库存对象 ID，冗余保存，用于约束需求对象与批次对象一致 |
| `batch_id`            | `BIGINT UNSIGNED` | 分配的库存批次 ID，关联 `item_batch.id`               |
| `assigned_number`     | `DECIMAL(12,4)`   | 分配数量                                              |
| `unit_snapshot`       | `VARCHAR(20)`     | 分配时单位快照                                        |
| `allocation_status`   | `VARCHAR(30)`     | 分配业务状态，默认 `active`                           |
| `version`             | `INT`             | 乐观锁版本号，默认 `0`                                |
| `remark`              | `TEXT`            | 备注                                                  |
| 业务审计字段          | 见统一规则        | 可变业务单据审计字段                                  |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (demand_id, item_id) REFERENCES production_item_demand(id, item_id)`
- 外键：`FOREIGN KEY (demand_id, production_batch_id) REFERENCES production_item_demand(id, production_batch_id)`
- 外键：`FOREIGN KEY (batch_id, item_id) REFERENCES item_batch(id, item_id)`
- 检查约束：`CHECK (assigned_number > 0)`
- 检查约束：`CHECK (allocation_status IN ('active', 'released', 'cancelled', 'frozen', 'abnormal'))`
- 组合索引：`INDEX (production_batch_id, allocation_status)`，用于汇总批次有效预留
- 唯一约束：`UNIQUE (id, demand_id)`
- 唯一约束：`UNIQUE (id, production_batch_id)`
- 唯一约束：`UNIQUE (id, item_id)`
- 组合候选键：`UNIQUE (id, demand_id, production_batch_id, item_id, batch_id)` — 供 `outbound_detail` 和 `return_detail` 作为组合外键引用，保证出库/退料与 allocation 的需求、生产批次、物料和库存批次一致

视图版本删除字段：

| 删除字段            | 删除原因                  |
| ------------------- | ------------------------- |
| `outbound_quantity` | 由 `outbound_detail` 汇总 |
| `returned_quantity` | 由 `return_detail` 汇总   |
| `scrapped_quantity` | 由 `item_scrap` 汇总      |

说明：

- `assigned_number` 是分配事实，不是缓存字段，应保留。
- 分配创建后，应影响可分配库存。
- 分配不等于出库，库存流水不会因为分配而扣减。
- 分配只代表业务预留，实际库存减少发生在出库时。
- `allocation_status = released` 或 `cancelled` 时，不应继续占用可分配库存。

---

## 3.6 生产领料出库表

---

### 12. `outbound_order`

职责：维护生产领料出库主单，记录库管针对某个生产批次的一次出库动作。

| 字段                  | 类型              | 说明                                      |
| --------------------- | ----------------- | ----------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                                      |
| `outbound_no`         | `VARCHAR(100)`    | 出库单号                                  |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID，关联 `production_batches.id` |
| `work_order_id`       | `BIGINT UNSIGNED` | 工单 ID，冗余保存，便于查询               |
| `status`              | `VARCHAR(30)`     | 出库单状态，默认 `pending_picking`        |
| `outbound_at`         | `DATETIME`        | 实际出库时间                              |
| `operator_id`         | `BIGINT UNSIGNED` | 操作人 ID                                 |
| `version`             | `INT`             | 乐观锁版本号，默认 `0`                    |
| `remark`              | `TEXT`            | 备注                                      |
| 业务审计字段          | 见统一规则        | 可变业务单据审计字段                      |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (outbound_no)`
- 唯一约束：`UNIQUE (id, production_batch_id)`
- 外键：`FOREIGN KEY (production_batch_id, work_order_id) REFERENCES production_batches(id, work_order_id)`
- 外键：`FOREIGN KEY (operator_id) REFERENCES users(id)`
- 检查约束：`CHECK (status IN ('pending_picking', 'picked', 'partially_outbound', 'completed', 'cancelled'))`
- 组合索引：`INDEX (status, created_at)`，用于出库单状态分页

说明：

- `outbound_order` 表示一次出库动作。
- 一张出库单可以包含多个物料、多个需求、多个库存批次。
- 出库单主表建议关联 `production_batch_id`，而不是单个 `demand_id`。
- 具体出了哪些物料、哪些批次、多少数量，由 `outbound_detail` 记录。

---

### 13. `outbound_detail`

职责：维护生产领料出库明细，记录某次出库动作中每个分配行实际出库的库存对象、批次和数量。

| 字段                  | 类型              | 说明                                              |
| --------------------- | ----------------- | ------------------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                                              |
| `outbound_id`         | `BIGINT UNSIGNED` | 出库主单 ID，关联 `outbound_order.id`             |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID，冗余保存，用于查询和约束             |
| `demand_id`           | `BIGINT UNSIGNED` | 需求 ID，关联 `production_item_demand.id`         |
| `allocation_id`       | `BIGINT UNSIGNED` | 分配明细 ID，关联 `production_item_allocation.id` |
| `item_id`             | `BIGINT UNSIGNED` | 出库对象 ID，冗余保存                             |
| `batch_id`            | `BIGINT UNSIGNED` | 出库库存批次 ID，冗余保存                         |
| `outbound_number`     | `DECIMAL(12,4)`   | 本次出库数量                                      |
| `unit_snapshot`       | `VARCHAR(20)`     | 出库时单位快照                                    |
| `created_by`          | `BIGINT UNSIGNED` | 创建人                                            |
| `created_at`          | `DATETIME`        | 创建时间，默认 `CURRENT_TIMESTAMP`                |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (outbound_id, production_batch_id) REFERENCES outbound_order(id, production_batch_id)`
- 外键：`FOREIGN KEY (demand_id, production_batch_id) REFERENCES production_item_demand(id, production_batch_id)`
- 外键：`FOREIGN KEY (allocation_id, demand_id, production_batch_id, item_id, batch_id) REFERENCES production_item_allocation(id, demand_id, production_batch_id, item_id, batch_id)`
- 外键：`FOREIGN KEY (batch_id, item_id) REFERENCES item_batch(id, item_id)`
- 检查约束：`CHECK (outbound_number > 0)`
- 唯一约束：`UNIQUE (outbound_id, allocation_id)`

说明：

- `outbound_detail` 是出库事实明细表。
- `inventory_transaction` 中的生产领料出库流水应引用 `outbound_detail.id`。
- 出库明细用于判断某条分配是否已经出库、某条需求是否已经满足。
- `outbound_id` 用于表达哪些明细属于同一次出库动作。
- `production_batch_id` 是有价值的冗余字段，便于按生产批次查询出库记录。

当前 Production 实施口径：创建单据只允许写入 `pending_picking`，不生成库存流水；整单确认执行
`pending_picking -> completed` 并为每条明细生成一条负数 `production_material_outbound` 流水；取消执行
`pending_picking -> cancelled` 且不生成流水。`picked`、`partially_outbound` 只保留在数据库稳定代码集合中，
当前不开放操作入口，也不支持单据分批确认。

数量汇总必须连接父单状态：已确认出库量只汇总 `outbound_order.status = 'completed'` 的明细；
`pending_picking` 明细只占用待制单额度，`cancelled` 明细不占用。可制单数量为“分配数量 - 已确认出库量 -
待确认单据占用量”，仍可实际出库数量为“分配数量 - 已确认出库量”。

---
