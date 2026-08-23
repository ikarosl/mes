# 产品主数据与生产批次

> [返回生产与库存总览](README.md) · [返回数据库设计总览](../README.md)。本章是生产与库存规范的组成部分，不是独立副本。

## 3.0 设计说明

本方案用于管理生产过程中的物料需求、物料分配、生产领料出库、退料、报废补料、半成品入库、成品入库、库存流水和盘点。

本章所有 BOM 单位用量、工单数量和生产批次数量均为整数，除既有正数/非负约束外还必须满足 `值 = TRUNCATE(值, 0)`；`DECIMAL(12,4)` 仅保留为兼容性物理表示，不表示允许小数。`products.spec_values` 是不参与数量计算的 JSON 记录，数值文本按用户原始内容保存，不套用本规则。

核心设计原则：

1. 物料、半成品、成品统一作为库存对象管理。
2. 所有库存对象统一使用 `products` 表维护基础信息。
3. 所有库存批次统一使用 `item_batch` 表维护。
4. 生产批次 `production_batches` 不等于库存批次 `item_batch`。
5. 库存流水 `inventory_transaction.batch_id` 统一关联 `item_batch.id`。
6. 生产领料分配代表业务预留，已分配数量不能被其他生产批次抢占。
7. 需求、分配、出库、退料、报废的累计数量通过视图汇总，不建议写回主表。
8. 入库、出库、退料、报废、盘点调整等影响库存数量的动作都应生成库存流水。

---

## 3.1 基础资料表

---

### 1. `product_categories`

职责：统一维护物料、半成品和成品分类，不再创建第二套库存分类表。

| 字段            | 类型              | 说明                                            |
| --------------- | ----------------- | ----------------------------------------------- |
| `id`            | `BIGINT UNSIGNED` | 主键，自增                                      |
| `parent_id`     | `BIGINT UNSIGNED` | 父分类 ID，可为空                               |
| `category_code` | `VARCHAR(64)`     | 分类编码                                        |
| `category_name` | `VARCHAR(100)`    | 分类名称                                        |
| `item_kind`     | `VARCHAR(30)`     | `material`、`semi_finished`、`finished_product` |
| `status`        | `TINYINT`         | `1` 启用、`0` 停用                              |
| `remark`        | `TEXT`            | 备注                                            |
| 审计字段        | 见统一规则        | 主数据审计字段                                  |

约束：

- 主键：`id`
- 自关联：`parent_id -> product_categories.id`
- 检查约束：`CHECK (item_kind IN ('material', 'semi_finished', 'finished_product'))`
- 唯一约束：`UNIQUE (category_code)`

说明：

- `material` 表示原材料、辅料、零部件等。
- `semi_finished` 表示生产过程中产生的半成品。
- `finished_product` 表示最终成品。
- 分类表达“是什么”，`products.acquire_method` 表达“如何获得”，两者不得混用。

---

### 2. `products`

职责：维护所有可生产、可采购或可库存对象，是物料、半成品和成品的唯一主数据。

| 字段               | 类型              | 说明                                    |
| ------------------ | ----------------- | --------------------------------------- |
| `id`               | `BIGINT UNSIGNED` | 主键，自增                              |
| `item_code`        | `VARCHAR(100)`    | 统一库存对象编码                        |
| `product_name`     | `VARCHAR(200)`    | 名称                                    |
| `category_id`      | `BIGINT UNSIGNED` | 分类 ID                                 |
| `default_route_id` | `BIGINT UNSIGNED` | 默认工艺路线，可为空                    |
| `unit`             | `VARCHAR(20)`     | 唯一基础计量单位，例如 `g`、`kg`、`pcs` |
| `acquire_method`   | `VARCHAR(32)`     | `self_made`、`outsourced`、`purchased`  |
| `spec_values`      | `JSON`            | 轻量规格参数；纯记录，不参与整数数量计算 |
| `status`           | `TINYINT`         | `1` 启用、`0` 停用                      |
| `remark`           | `TEXT`            | 备注                                    |
| 审计字段           | 见统一规则        | 主数据审计字段                          |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (item_code)`
- 外键：`FOREIGN KEY (category_id) REFERENCES product_categories(id)`
- 外键：`default_route_id -> process_routes.id ON DELETE SET NULL`，在工艺表创建后追加
- 检查约束：`CHECK (acquire_method IN ('self_made', 'outsourced', 'purchased'))`
- 检查约束：`CHECK (status IN (0, 1))`

说明：

- 物料、半成品、成品都进入该表，不再创建 `item_info` 或独立物料主表。
- 是否是物料、半成品或成品，通过 `category_id -> product_categories.item_kind` 判断。
- `item_code` 是产品、物料和半成品的唯一业务编码；编码软删除后不得被新记录复用，需要继续使用时恢复原记录。
- 一期只允许一个基础单位；需要多单位时必须另行设计单位换算，不能同时维护同义的 `unit/default_unit`。

示例：

| id  | product_name           | item_kind        | unit |
| --- | ---------------------- | ---------------- | ---- |
| pi2 | 粘合-h822              | material         | g    |
| pi3 | 6g-20g微带环形器半成品 | semi_finished    | pcs  |
| pi4 | 10g-30g微带环形器成品  | finished_product | pcs  |

---

### 3. `product_materials`

职责：维护产品或半成品的统一 BOM 明细，是生产需求生成的唯一 BOM 数据源。

| 字段                  | 类型              | 说明                           |
| --------------------- | ----------------- | ------------------------------ |
| `id`                  | `BIGINT UNSIGNED` | 主键，自增                     |
| `product_id`          | `BIGINT UNSIGNED` | 被生产对象 ID                  |
| `material_product_id` | `BIGINT UNSIGNED` | 消耗对象 ID                    |
| `quantity_per_unit`   | `DECIMAL(12,4)`   | 每生产一个目标对象的需求数量   |
| `unit`                | `VARCHAR(20)`     | 用量单位，默认等于物料基础单位 |
| `is_key_material`     | `TINYINT`         | 是否关键物料，默认 `1`         |
| `need_batch_record`   | `TINYINT`         | 是否要求批次追溯，默认 `1`     |
| `status`              | `TINYINT`         | `1` 启用、`0` 停用             |
| `remark`              | `TEXT`            | 备注                           |
| 审计字段              | 见统一规则        | 主数据审计字段                 |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (product_id) REFERENCES products(id)`
- 外键：`FOREIGN KEY (material_product_id) REFERENCES products(id)`
- 检查约束：`CHECK (product_id <> material_product_id)`
- 检查约束：`CHECK (quantity_per_unit > 0)`
- 检查约束：布尔字段与 `status` 只允许 `0/1`
- 唯一约束：`UNIQUE (product_id, material_product_id)`
- 组合引用索引：`UNIQUE (id, material_product_id)`

说明：

- `product_id` 可以是成品，也可以是半成品。
- `material_product_id` 可以是物料，也可以是半成品。
- `production_item_demand` 必须保存 `product_material_id` 和 BOM 数量、单位、追溯标志快照。
- 修改 BOM 不得回写已经生成的生产需求。
- 同一产品和投入对象的 BOM 行软删除后需要再次使用时恢复原记录，不创建相同自然键的新记录。

---

## 3.2 生产执行表

---

### 4. `work_orders`

职责：维护生产工单，记录某个产品的整体生产计划。

| 字段                    | 类型              | 说明                                                             |
| ----------------------- | ----------------- | ---------------------------------------------------------------- |
| `id`                    | `BIGINT UNSIGNED` | 主键，自增                                                       |
| `work_order_no`         | `VARCHAR(100)`    | 工单编号                                                         |
| `product_id`            | `BIGINT UNSIGNED` | 计划生产对象 ID                                                  |
| `product_code_snapshot` | `VARCHAR(100)`    | 下达时产品编码快照                                               |
| `product_name_snapshot` | `VARCHAR(200)`    | 下达时产品名称快照                                               |
| `unit_snapshot`         | `VARCHAR(20)`     | 下达时单位快照                                                   |
| `planned_quantity`      | `DECIMAL(12,4)`   | 工单计划生产数量                                                 |
| `customer_name`         | `VARCHAR(255)`    | 客户名称，可为空                                                 |
| `quality_level`         | `VARCHAR(50)`     | 客户自定义质量等级代码，可为空                                   |
| `work_order_owner_id`   | `BIGINT UNSIGNED` | 工单负责人，负责整体计划协调，可为空                             |
| `plan_start_date`       | `DATE`            | 计划开始日期，可为空                                             |
| `plan_end_date`         | `DATE`            | 计划完工日期，可为空                                             |
| `status`                | `VARCHAR(30)`     | `draft`、`released`、`doing`、`completed`、`cancelled`、`closed` |
| `released_at`           | `DATETIME`        | 下达时间                                                         |
| `external_order_no`     | `VARCHAR(100)`    | 外部订单号，可为空                                               |
| `remark`                | `TEXT`            | 备注                                                             |
| `version`               | `INT`             | 乐观锁版本号，默认 `0`                                           |
| 业务审计字段            | 见统一规则        | 可变业务单据审计字段                                             |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (work_order_no)`
- 组合引用索引：`UNIQUE (id, product_id)`
- 外键：`FOREIGN KEY (product_id) REFERENCES products(id)`
- 外键：`work_order_owner_id -> users.id`
- 检查约束：`CHECK (planned_quantity > 0)`
- 检查约束：`CHECK (status IN ('draft', 'released', 'doing', 'completed', 'cancelled', 'closed'))`
- 检查约束：`CHECK (plan_start_date IS NULL OR plan_end_date IS NULL OR plan_end_date >= plan_start_date)`
- 索引：`INDEX (external_order_no)`
- 索引：`INDEX (work_order_owner_id, status, created_at)`
- 索引：`INDEX (plan_start_date)`
- 组合索引：`INDEX (status, created_at)`，用于工单状态分页

说明：

- 工单表示整体生产计划。
- 一个工单可以拆分为多个生产批次。
- 工单处于 `released` 或 `doing` 且仍有未分配计划量时均可继续创建生产批次；首批次开工不冻结工单剩余任务拆分能力。
- 生产领料、生产入库、半成品入库等动作建议落到 `production_batches` 维度。
- 产品快照在工单下达时冻结，后续修改产品主数据不得回写历史工单。
- `quality_level` 是客户自定义等级，不建立固定状态字典或 `CHECK`；如后续需要客户级等级主数据，必须另行建模，不能把自由文本解释为质量结论。
- 工单实际开工时间不单独持久化，由所属批次的最早 `started_at` 推导；工单实际完工时间由已完工批次的 `completed_at` 汇总，避免形成第二执行事实来源。

#### 生产工单状态与管理动作

生产工单的成功完工不由生产批次自动回写。管理员必须通过显式“确认工单完工”命令复核工单计划量、非取消批次、批次完成量及未结束批次后，再把工单转为 `completed`。管理端确认不替代后端事务校验。

| 当前状态 | 管理动作 | 后端规则与目标状态 |
| --- | --- | --- |
| `draft` | 取消工单 | 尚未下达且没有执行事实时允许，直接进入 `cancelled` |
| `draft` | 下达工单 | 冻结下达快照并进入 `released` |
| `released` | 首个生产批次实际开工 | 与批次开工同事务进入 `doing`；创建或分配批次本身不代表开工 |
| `released` / `doing` | 确认工单完工 | 所有非取消批次均为 `completed`，且其 `completed_quantity` 合计等于工单 `planned_quantity` 时，管理员二次确认后进入 `completed` |
| `released` / `doing` | 提前关闭工单 | 不存在未终态批次时允许进入 `closed`；必须填写关闭原因。没有批次或只有已取消批次属于未生产结案，已完成量小于计划量属于不足量结案 |
| `released` / `doing` | 提前关闭工单但存在未终态批次 | 拒绝并返回未处理批次摘要；管理员须先逐批完成或取消。生产批次没有 `closed` 状态，提示语固定为“请先完成或取消所有未结束生产批次” |
| `completed` | 关闭工单 | 作为成功完工后的行政归档进入 `closed` |

补充规则：

- “取消”只表达从未下达的草稿作废；工单一经下达，提前终止统一使用“关闭”，不得再执行 `released/doing -> cancelled`。
- `completed` 表达生产计划足量完成，`closed` 同时覆盖成功完工后的归档以及下达后的提前结案；查询必须结合来源状态、批次完成量和关闭原因区分，不得把提前关闭展示为正常完工。
- 提前关闭不得自动取消生产批次。存在未终态批次时返回批次编号、状态、计划量和完成量，由管理员逐批核对后执行合法的批次完成或取消命令。
- 确认完工、提前关闭和完工后归档均提交工单 `version`，在事务内重新锁定并汇总所属批次；状态更新、关闭原因和成功操作日志同事务提交。当前关闭原因可以进入命令审计载荷；若产品要求在工单列表高频查询关闭原因、关闭人或关闭时间，再以追加 migration 增加独立字段，不复用 `remark` 覆盖原备注。

---

### 5. `production_batches`

职责：维护生产批次，表示某个工单被拆分后的实际生产批次。

| 字段                     | 类型              | 说明                            |
| ------------------------ | ----------------- | ------------------------------- |
| `id`                     | `BIGINT UNSIGNED` | 主键，生产批次 ID               |
| `work_order_id`          | `BIGINT UNSIGNED` | 工单 ID                         |
| `product_id`             | `BIGINT UNSIGNED` | 冗余产品 ID，与工单组合外键约束 |
| `batch_no`               | `VARCHAR(100)`    | 生产批号                        |
| `route_id`               | `BIGINT UNSIGNED` | 工艺路线 ID，可为空             |
| `route_code_snapshot`    | `VARCHAR(64)`     | 路线编码快照                    |
| `route_version_snapshot` | `VARCHAR(64)`     | 路线版本快照                    |
| `planned_quantity`       | `DECIMAL(12,4)`   | 本批次计划生产数量              |
| `completed_quantity`     | `DECIMAL(12,4)`   | 生产执行完成数量，默认 `0`；批次完工时由服务端从报工事实推导 |
| `qualified_quantity`     | `DECIMAL(12,4)`   | 最终合格数量，默认 `0`          |
| `plan_start_date`        | `DATE`            | 本批次计划开始日期，可为空        |
| `plan_end_date`          | `DATE`            | 本批次计划完工日期，可为空        |
| `started_at`              | `DATETIME`        | 批次实际开工时间，可为空        |
| `completed_at`           | `DATETIME`        | 完工确认时间，可为空            |
| `completed_by`           | `BIGINT UNSIGNED` | 完工确认人，可为空              |
| `status`                 | `VARCHAR(40)`     | 生产批次状态                    |
| `batch_owner_id`         | `BIGINT UNSIGNED` | 批次负责人，负责该批次执行，可为空 |
| `remark`                 | `TEXT`            | 备注                            |
| `version`                | `INT`             | 乐观锁版本号，默认 `0`          |
| 业务审计字段             | 见统一规则        | 可变业务单据审计字段            |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (work_order_id, product_id) REFERENCES work_orders(id, product_id)`
- 外键：`FOREIGN KEY (route_id) REFERENCES process_routes(id)`
- 外键：`FOREIGN KEY (batch_owner_id) REFERENCES users(id)`
- 外键：`FOREIGN KEY (completed_by) REFERENCES users(id)`
- 检查约束：`CHECK (planned_quantity > 0)`
- 检查约束：`CHECK (completed_quantity >= 0)`
- 检查约束：`CHECK (qualified_quantity >= 0)`
- 检查约束：`CHECK (qualified_quantity <= completed_quantity)`
- 检查约束：`CHECK (plan_start_date IS NULL OR plan_end_date IS NULL OR plan_end_date >= plan_start_date)`
- 检查约束：`CHECK (status <> 'completed' OR (completed_at IS NOT NULL AND completed_by IS NOT NULL))`
- 唯一约束：`UNIQUE (batch_no)`；批次号在全系统范围内唯一，自动编号与手动输入均由后端校验
- 组合引用索引：`UNIQUE (id, work_order_id)`、`UNIQUE (id, product_id)`
- 检查约束：`CHECK (status IN ('pending', 'material_pending', 'material_assigned', 'material_outbound', 'doing', 'completed', 'cancelled'))`
- 组合索引：`INDEX (work_order_id, status)`，用于按工单查询有效生产批次
- 索引：`INDEX (plan_start_date)`，用于生产排程与按计划开工日筛选

状态说明：

| 状态                | 含义                   |
| ------------------- | ---------------------- |
| `pending`           | 待开始                 |
| `material_pending`  | 待生成或待确认物料需求 |
| `material_assigned` | 物料已分配             |
| `material_outbound` | 物料已领料出库         |
| `doing`             | 生产中                 |
| `completed`         | 生产完成               |
| `cancelled`         | 已取消                 |

任务生成与取消规则：

- 创建生产批次只接受 `released`、`doing` 工单，并在事务内重新汇总非取消批次计划量；本次新增后不得超过工单计划量。创建批次本身不推动工单进入 `doing`。
- 第一版生产批次没有 `closed` 状态，管理动作统一称为“取消任务”。只允许 `pending`、`material_pending`、`material_assigned` 取消，即任务尚未开工且物料尚未实际出库。
- 取消前管理端必须读取服务端实时影响摘要，展示将取消的待确认出库单、有效预留和活动需求数量，并要求填写取消原因；提交事务仍须重新锁定批次及相关单据校验，不能信任前端摘要。
- 取消事务把 `pending_picking` 待出库单转为 `cancelled`、把活动分配转为 `cancelled` 以释放库存预留、把活动需求转为 `cancelled`，最后把生产批次转为 `cancelled`；这些写入、原因和成功审计同事务提交，不生成 `inventory_transaction`。
- `material_outbound`、`doing`、`completed` 明令禁止取消。只要存在已确认出库事实，即使批次状态异常滞后也必须拒绝；第一版不提供强制取消或绕过入口。未来若要终止已开工批次，必须先定稿短批结案、生产损失、在制品及已领物料处置，不能复用本取消命令。

当前生产执行完工数量规则：

- 以本批次中 `need_record_snapshot = 1` 且 `step_order_snapshot` 最大的工序作为数量来源工序；`completed_quantity` 等于该工序从 `batch_step_reports` 聚合得到的 `effective_normal`。
- 完工命令必须在事务内重新锁定并校验所有必报工工序均为 `completed`，重新聚合数量后写入；客户端不得提交或覆盖 `completed_quantity`。
- 当前至少需要存在一道必报工工序；没有数量来源工序的批次不得执行完工确认。
- 当前不支持正常数量低于要求数量时的短批完工。确需按不足数量结束时，未来以独立的短批完工/生产损失确认命令记录差额、原因、确认人与审计，不得通过人工填写 `completed_quantity` 绕过报工事实。
- `qualified_quantity` 不由生产执行完工命令写入；它只允许来自未来独立的最终质量结论。

说明：

- `production_batches` 是生产执行批次，不是库存批次。
- 生产批次负责表达“这一批怎么生产”。
- `product_id` 是受组合外键保护的查询冗余，不允许与工单产品不一致。
- 路线快照在批次创建时冻结；批次执行期间不能跟随路线主数据变化。
- `plan_start_date`、`plan_end_date` 是批次排程，不是实际执行事实；实际开工、完工分别只以 `started_at`、`completed_at` 为准。
- 成品或半成品入库后，应生成 `item_batch` 库存批次，并通过 `item_batch.source_production_batch_id` 关联回生产批次。
- 一个生产批次可以产生多个库存批次，例如半成品批次、成品批次、待检批次。

---
