# 生产需求、分配与领料出库

> [返回生产与库存总览](README.md) · [返回数据库设计总览](../README.md)。本章是生产与库存规范的组成部分，不是独立副本。

## 3.5 生产物料需求与分配表

> `202608110001-production-abnormal-dispositions-and-demand-type-codes` 已把 `demand_type` 从历史数字 `0/1` 迁移为字符串。当前设计在保留 `normal/manual_additional` 的基础上定稿 `scrap_supplement`：异常批准报废时由人工补料明细生成新需求，不修改原需求。补料需求可在生产批次 `doing` 阶段继续走现有分配和领料出库链路；批准、分配或创建待出库单均不增加报工额度，只有全部补料需求确认领用后才按来源工序报废数量激活补产额度。

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
| `parent_demand_id`                 | `BIGINT UNSIGNED` | 补料需求关联的原始需求 ID                 |
| `source_scrap_id`                  | `BIGINT UNSIGNED` | 报废补料关联的报废记录 ID，可为空         |
| `source_supplement_detail_id`      | `BIGINT UNSIGNED` | 工序报废补料来源明细 ID，可为空           |
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
| `demand_type`                                  | `normal` 正常需求、`manual_additional` 人工追加、`scrap_supplement` 报废补料 |
| `parent_demand_id`                             | 补料需求关联的原始需求                           |
| `source_scrap_id`                              | 现有 `item_scrap` 报废补料来源；不得用于冒充尚未定稿的工序报废或补料明细 ID |
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
- 检查约束：`CHECK (demand_type IN ('normal', 'manual_additional', 'scrap_supplement'))`
- 检查约束：`CHECK (business_status IN ('active', 'cancelled', 'closed', 'frozen', 'abnormal'))`
- 组合索引：`INDEX (production_batch_id, business_status)`，用于查询批次有效需求
- 检查约束：正常需求 `demand_type = 'normal'` 时要求 `product_material_id IS NOT NULL`，且 `parent_demand_id IS NULL`、`source_scrap_id IS NULL`
- 检查约束：人工追加需求 `demand_type = 'manual_additional'` 时要求 `product_material_id IS NOT NULL`、`parent_demand_id IS NOT NULL`，且 `source_scrap_id IS NULL`
- 检查约束：报废补料 `demand_type = 'scrap_supplement'` 时要求 `product_material_id IS NOT NULL`、`parent_demand_id IS NOT NULL`、`source_scrap_id IS NULL`、`source_supplement_detail_id IS NOT NULL`
- 检查约束：正常需求的 BOM 快照字段不得为空且均大于 `0`
- 唯一约束：`UNIQUE (idempotency_key)`
- 唯一约束：`UNIQUE (id, item_id)`
- 唯一约束：`UNIQUE (id, production_batch_id)`
- 索引：`INDEX (source_scrap_id)`

迁移说明：追加 migration 创建工序报废与补料表后，为 `production_item_demand` 增加 `source_supplement_detail_id` 外键并扩展 `demand_type` CHECK；已执行 migration 不修改。历史 `source_scrap_id` 只保留给未来通用库存报废来源，工序报废不得借用该字段。

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
- 幂等键使用稳定格式：正常需求为 `NORMAL:{production_batch_id}:{product_material_id}`，现有库存报废补料为 `SCRAP:{source_scrap_id}:{product_material_id}`，工序主动补料为 `SCRAPSUP:{source_supplement_detail_id}`，人工追加为 `ADDITIONAL:{production_batch_id}:{business_action_no}:{product_material_id}`。
- `business_action_no` 必须是一次人工追加动作的稳定唯一编号；相同幂等键重复提交时返回既有需求，不插入新记录，也不得修改既有 `need_number`。
- 应用事务必须校验 `parent_demand_id` 指向的原需求与当前需求属于同一生产批次，且 `product_material_id` 对应投入对象与 `item_id` 一致。
- 现有 `item_scrap` 报废补料还必须校验 `source_scrap_id` 指向已确认、未取消的报废记录，且报废、原需求和补料需求属于同一生产批次。未来工序报废补料必须使用与工序报废/补料明细相匹配的新来源外键，不得把对应 ID 填入 `source_scrap_id`。
- 需求事实和对应操作日志必须在同一事务写入。

### `batch_step_scrap_records` 与半自动补料

- `batch_step_scrap_records` 是已批准不可返工的工序损失事实：对 `abnormal_disposition_id` 唯一，保存批次、工序、来源报工、异常数量和单位快照；只追加、不更新、不删除。
- `production_material_supplement` 对工序报废记录唯一，保存补料单号、批次、工序和审批说明；状态从审批创建时的 `approved` 转为全部补料确认领用后的 `activated`。`activated_at/activated_by` 固化补产授权生效的时间和操作人，激活后不得退回 `approved`；一张补料单包含一到多条 `production_material_supplement_detail`。
- 系统只提供候选物料，不自动计算每种物料的补料数量。管理员选择物料并手工填写数量，系统不得使用工序异常数量乘 BOM 用量推算补料数量。
- 候选物料优先汇总路线首工序至异常来源工序绑定的有效 `route_step_materials`，相同 BOM 明细去重；该路径没有绑定物料时，可以降级展示当前产品的全部有效 BOM 物料。候选范围只用于辅助选择，不构成数量计算或工序消耗事实。
- 系统只校验管理员选择的物料属于当前产品与当前候选、补料数量大于 `0`、单位与原需求口径一致，并在补料明细中冻结最终选中的 `product_material_id`、`item_id`、人工填写数量、单位快照和原始需求 ID；同一补料单内原始需求不得重复。
- 批准报废与补料是一个原子命令：处置单批准、工序报废事实、补料单/明细、每条 `demand_type = 'scrap_supplement'` 的需求、成功审计和 HTTP 幂等结果同事务提交。新需求复制原正常需求的 BOM 与单位快照，`need_number` 等于人工填写量，`parent_demand_id` 指向原需求，`source_supplement_detail_id` 指向唯一补料明细。
- 工序报废数量与物料补料数量是两个口径。管理员填写的补料明细只决定物料需求；产品补产数量固定取 `batch_step_scrap_records.scrap_quantity`，不得按 BOM 或补料明细反推产品数量。
- 当前最小闭环固定从路线首工序重新投产。报废来源位于后续工序时，补料候选应覆盖路线首工序至来源工序实际需要重新投入的有效路线物料；不得只因异常发生在后续工序，就把候选范围限制为来源工序绑定物料。未配置路线用料时仍可降级到当前产品有效 BOM，由管理员确认实际补料项和数量。
- 路线补产授权只在本补料单生成的全部 `scrap_supplement` 需求均完成确认领料出库后整笔激活。最后一张相关出库单确认时，在同一事务把补料单更新为 `status = 'activated'` 并写入 `activated_at/activated_by`；分配完成、创建待出库单或部分确认领料均不激活。应用按权威报工章节的公式从已激活补料单、报废事实和路线顺序派生每道工序目标，不接收客户端填写。
- 因此当前链路闭合为“工序报废 → 人工补料 → 新需求 → 分配 → 确认出库 → 激活路线补产 → 首工序重新生产 → 逐工序正常放行 → 来源工序补报”。当前仍不记录某次补报逐笔消费哪张补料单；未来需要部分激活、指定来源消费或半成品重入时，再追加额度消费/重入事实和版本化接口。
- 补料审批只接受 `doing` 批次；后续分配、释放分配、创建和确认领料出库在 `doing` 状态下只允许操作 `scrap_supplement` 需求，普通需求仍受原物料阶段状态机约束。批次保持 `doing`，补料物流不得把批次状态退回 `material_pending/material_assigned/material_outbound`。

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
