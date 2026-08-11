# 产品主数据与生产批次

> [返回生产与库存总览](README.md) · [返回数据库设计总览](../README.md)。本章是生产与库存规范的组成部分，不是独立副本。

## 3.0 设计说明

本方案用于管理生产过程中的物料需求、物料分配、生产领料出库、退料、报废补料、半成品入库、成品入库、库存流水和盘点。

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
| `spec_values`      | `JSON`            | 轻量规格参数                            |
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
- 生产领料、生产入库、半成品入库等动作建议落到 `production_batches` 维度。
- 产品快照在工单下达时冻结，后续修改产品主数据不得回写历史工单。
- `quality_level` 是客户自定义等级，不建立固定状态字典或 `CHECK`；如后续需要客户级等级主数据，必须另行建模，不能把自由文本解释为质量结论。
- 工单实际开工时间不单独持久化，由所属批次的最早 `started_at` 推导；工单实际完工时间由已完工批次的 `completed_at` 汇总，避免形成第二执行事实来源。

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
