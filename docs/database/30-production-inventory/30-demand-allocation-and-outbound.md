# 生产需求、分配与领料出库

> [返回生产与库存总览](README.md) · [返回数据库设计总览](../README.md)。本章是生产与库存规范的组成部分，不是独立副本。

## 3.5 生产物料需求与分配表

> 当前只批准 `demand_type = 0` 的正常需求进入 application/API 实施。`demand_type = 1/2`、补料触发、审批、数量来源以及与报废事实的关系仍是待决策草案；已有物理字段和约束仅保留演进空间，不构成开放补料能力的依据。

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
| `demand_type`                      | `TINYINT`         | 需求类型，默认 `0`                        |
| `idempotency_key`                  | `VARCHAR(150)`    | 幂等键，同一键重复提交返回既有结果        |
| `parent_demand_id`                 | `BIGINT UNSIGNED` | 补料需求关联的原始需求 ID                 |
| `source_scrap_id`                  | `BIGINT UNSIGNED` | 报废补料关联的报废记录 ID，可为空         |
| `reason_type`                      | `VARCHAR(50)`     | 补料原因                                  |
| `business_status`                  | `VARCHAR(30)`     | 业务状态，默认 `active`                   |
| `version`                          | `INT`             | 乐观锁版本号，默认 `0`                    |
| `remark`                           | `TEXT`            | 备注                                      |
| 业务审计字段                       | 见统一规则        | 可变业务单据审计字段                      |

字段说明：

| 字段                                           | 说明                                             |
| ---------------------------------------------- | ------------------------------------------------ |
| `product_material_id`                          | 正常需求必须保存，用于追溯来源 BOM 明细          |
| `item_id`                                      | 受组合外键保护的需求对象冗余，便于查询和约束     |
| `quantity_per_unit_snapshot` / `unit_snapshot` | 保证 BOM 修改后仍可还原需求计算口径              |
| `need_number`                                  | 需求事实，不应因为出库、退料、报废而直接修改     |
| `demand_type`                                  | `0` 正常需求，`1` 追加补料，`2` 报废补料         |
| `parent_demand_id`                             | 补料需求关联的原始需求                           |
| `source_scrap_id`                              | 报废补料来源，同一报废记录可生成多种物料补料需求 |
| `idempotency_key`                              | 幂等键，同一键重复提交返回既有结果               |
| `business_status`                              | 业务状态，不表达数量进度                         |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (production_batch_id) REFERENCES production_batches(id)`
- 外键：`FOREIGN KEY (item_id) REFERENCES products(id)`
- 外键：`FOREIGN KEY (product_material_id, item_id) REFERENCES product_materials(id, material_product_id)`
- 外键：`FOREIGN KEY (parent_demand_id) REFERENCES production_item_demand(id)`
- 外键：`FOREIGN KEY (source_scrap_id) REFERENCES item_scrap(id)`
- 检查约束：`CHECK (need_number > 0)`
- 检查约束：`CHECK (demand_type IN (0, 1, 2))`
- 检查约束：`CHECK (business_status IN ('active', 'cancelled', 'closed', 'frozen', 'abnormal'))`
- 组合索引：`INDEX (production_batch_id, business_status)`，用于查询批次有效需求
- 检查约束：正常需求 `demand_type = 0` 时要求 `product_material_id IS NOT NULL`，且 `parent_demand_id IS NULL`、`source_scrap_id IS NULL`
- 检查约束：追加需求 `demand_type = 1` 时要求 `product_material_id IS NOT NULL`、`parent_demand_id IS NOT NULL`，且 `source_scrap_id IS NULL`
- 检查约束：报废补料 `demand_type = 2` 时要求 `product_material_id IS NOT NULL`、`parent_demand_id IS NOT NULL`、`source_scrap_id IS NOT NULL`
- 检查约束：正常需求的 BOM 快照字段不得为空且均大于 `0`
- 唯一约束：`UNIQUE (idempotency_key)`
- 唯一约束：`UNIQUE (id, item_id)`
- 唯一约束：`UNIQUE (id, production_batch_id)`
- 索引：`INDEX (source_scrap_id)`

分阶段迁移说明：在 `item_scrap` 建表前，`production_item_demand` 的物理约束先支持 `demand_type IN (0, 1)`，保留 `source_scrap_id` 字段及索引但要求其为空，并立即建立 `parent_demand_id` 自关联外键。按迁移顺序第 12 步建立 `item_scrap` 后，必须通过追加 migration 建立 `source_scrap_id` 外键并将类型及检查约束扩展到 `0、1、2`。Production 第一阶段应用仅生成 `demand_type = 0` 的正常需求。

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
- 幂等键使用稳定格式：正常需求为 `NORMAL:{production_batch_id}:{product_material_id}`，报废补料为 `SCRAP:{source_scrap_id}:{product_material_id}`，人工追加为 `ADDITIONAL:{production_batch_id}:{business_action_no}:{product_material_id}`。
- `business_action_no` 必须是一次人工追加动作的稳定唯一编号；相同幂等键重复提交时返回既有需求，不插入新记录，也不得修改既有 `need_number`。
- 应用事务必须校验 `parent_demand_id` 指向的原需求与当前需求属于同一生产批次，且 `product_material_id` 对应投入对象与 `item_id` 一致。
- 报废补料还必须校验 `source_scrap_id` 指向已确认、未取消的报废记录，且报废、原需求和补料需求属于同一生产批次。
- 需求事实和对应操作日志必须在同一事务写入。

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

---

