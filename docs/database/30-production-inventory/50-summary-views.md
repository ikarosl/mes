# 核心汇总视图

> [返回生产与库存总览](README.md) · [返回数据库设计总览](../README.md)。本章是生产与库存规范的组成部分，不是独立副本。

所有数量来源列均受整数约束，因此本章汇总、加减和 `SUM` 投影也必须保持整数语义；视图显示为 `DECIMAL(12,4)` 不表示允许小数，应用不得对汇总结果做小数容差比较。

## 3.10 核心汇总视图

---

### 19. `v_item_batch_stock`

职责：按库存批次、库存对象和库存状态汇总现存量。

| 字段                         | 类型              | 说明            |
| ---------------------------- | ----------------- | --------------- |
| `batch_id`                   | `BIGINT UNSIGNED` | 库存批次 ID     |
| `item_id`                    | `BIGINT UNSIGNED` | 库存对象 ID     |
| `item_name`                  | `VARCHAR(200)`    | 库存对象名称    |
| `item_kind`                  | `VARCHAR(30)`     | 库存对象大类    |
| `batch_code`                 | `VARCHAR(100)`    | 库存批次号      |
| `source_type`                | `VARCHAR(30)`     | 来源类型        |
| `provider`                   | `VARCHAR(100)`    | 供应商或委外方  |
| `source_work_order_id`       | `BIGINT UNSIGNED` | 来源工单 ID     |
| `source_production_batch_id` | `BIGINT UNSIGNED` | 来源生产批次 ID |
| `batch_status`               | `VARCHAR(20)`     | 批次业务状态    |
| `available_quantity`         | `DECIMAL(12,4)`   | 可用库存数量    |
| `pending_quantity`           | `DECIMAL(12,4)`   | 待检库存数量    |
| `frozen_quantity`            | `DECIMAL(12,4)`   | 冻结库存数量    |
| `defective_quantity`         | `DECIMAL(12,4)`   | 不良库存数量    |
| `total_quantity`             | `DECIMAL(12,4)`   | 总库存数量      |

汇总口径：

| 字段                 | 计算来源                                            |
| -------------------- | --------------------------------------------------- |
| `available_quantity` | 汇总 `stock_status = available` 的库存流水          |
| `pending_quantity`   | 汇总 `stock_status = pending_inspection` 的库存流水 |
| `frozen_quantity`    | 汇总 `stock_status = frozen` 的库存流水             |
| `defective_quantity` | 汇总 `stock_status = defective` 的库存流水          |
| `total_quantity`     | 汇总该批次所有库存流水                              |

说明：

- 该视图只表达账面库存。
- 是否可被新生产批次分配，还需要结合预留数量，通过 `v_item_batch_available_to_allocate` 判断。
- 批次是否用完不写回 `item_batch.batch_status`。

---

### 20. `v_production_item_allocation_summary`

职责：按分配明细维度汇总出库、退料、报废和可再次出库数量。

| 字段                           | 类型              | 说明                           |
| ------------------------------ | ----------------- | ------------------------------ |
| `allocation_id`                | `BIGINT UNSIGNED` | 分配明细 ID                    |
| `demand_id`                    | `BIGINT UNSIGNED` | 需求 ID                        |
| `production_batch_id`          | `BIGINT UNSIGNED` | 生产批次 ID                    |
| `item_id`                      | `BIGINT UNSIGNED` | 库存对象 ID                    |
| `batch_id`                     | `BIGINT UNSIGNED` | 库存批次 ID                    |
| `assigned_number`              | `DECIMAL(12,4)`   | 分配数量                       |
| `outbound_quantity`            | `DECIMAL(12,4)`   | 累计出库数量                   |
| `returned_quantity`            | `DECIMAL(12,4)`   | 累计退料数量                   |
| `returned_available_quantity`  | `DECIMAL(12,4)`   | 退回后可用且未释放的数量       |
| `released_return_quantity`     | `DECIMAL(12,4)`   | 退回后已释放给公共库存的数量   |
| `stock_scrapped_quantity`      | `DECIMAL(12,4)`   | 仓库侧或退料后的报废数量       |
| `production_scrapped_quantity` | `DECIMAL(12,4)`   | 生产消耗报废数量               |
| `available_outbound_quantity`  | `DECIMAL(12,4)`   | 当前对原生产批次可再次出库数量 |
| `is_quantity_abnormal`         | `TINYINT`         | 数量是否异常                   |

核心计算口径：

| 字段                           | 计算来源                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `outbound_quantity`            | 汇总 `outbound_detail.outbound_number`                                              |
| `returned_quantity`            | 汇总 `return_detail.return_number`                                                  |
| `returned_available_quantity`  | 汇总 `return_stock_status = available` 且 `release_after_return = 0` 的退料数量     |
| `released_return_quantity`     | 汇总 `release_after_return = 1` 的退料数量                                          |
| `stock_scrapped_quantity`      | 汇总 `warehouse_allocated`、`return_after_outbound` 且状态为 `confirmed` 的报废数量 |
| `production_scrapped_quantity` | 汇总 `production_consumed` 且状态为 `confirmed` 的报废数量                          |
| `available_outbound_quantity`  | 分配数量 - 已出库数量 + 未释放可用退料数量 - 库存侧报废数量                         |

说明：

- `production_consumed` 不扣减 `available_outbound_quantity`。
- `release_after_return = 1` 的退料不再属于原生产批次的可再次出库量。
- 如果 `available_outbound_quantity < 0`，表示该分配行存在数量异常。

---

### 21. `v_production_item_demand_summary`

职责：按需求维度汇总分配、出库、退料、报废、缺料和数量进度状态。

| 字段                           | 类型              | 说明               |
| ------------------------------ | ----------------- | ------------------ |
| `demand_id`                    | `BIGINT UNSIGNED` | 需求 ID            |
| `production_batch_id`          | `BIGINT UNSIGNED` | 生产批次 ID        |
| `product_material_id`          | `BIGINT UNSIGNED` | BOM 行 ID          |
| `item_id`                      | `BIGINT UNSIGNED` | 需求对象 ID        |
| `need_number`                  | `DECIMAL(12,4)`   | 需求数量           |
| `demand_type`                  | `VARCHAR(30)`     | 需求类型：`normal`、`manual_additional`、`scrap_supplement`、`material_loss_supplement` |
| `parent_demand_id`             | `BIGINT UNSIGNED` | 原始需求 ID        |
| `supplement_id`                | `BIGINT UNSIGNED` | 补料物流单 ID      |
| `business_status`              | `VARCHAR(30)`     | 业务状态           |
| `allocated_quantity`           | `DECIMAL(12,4)`   | 累计已分配数量     |
| `unallocated_quantity`         | `DECIMAL(12,4)`   | 未分配数量         |
| `outbound_quantity`            | `DECIMAL(12,4)`   | 累计已出库数量     |
| `not_outbound_quantity`        | `DECIMAL(12,4)`   | 未出库数量         |
| `returned_quantity`            | `DECIMAL(12,4)`   | 累计退料数量       |
| `stock_scrapped_quantity`      | `DECIMAL(12,4)`   | 库存侧报废数量     |
| `production_scrapped_quantity` | `DECIMAL(12,4)`   | 生产消耗报废数量   |
| `available_outbound_quantity`  | `DECIMAL(12,4)`   | 当前可再次出库数量 |
| `is_shortage`                  | `TINYINT`         | 是否缺料           |
| `is_quantity_abnormal`         | `TINYINT`         | 是否数量异常       |
| `progress_status`              | `VARCHAR(30)`     | 数量进度状态       |

核心计算口径：

| 字段                    | 计算来源                                          |
| ----------------------- | ------------------------------------------------- |
| `allocated_quantity`    | 汇总该需求下所有有效分配的 `assigned_number`      |
| `unallocated_quantity`  | `need_number - allocated_quantity`，小于 0 时按 0 |
| `outbound_quantity`     | 汇总该需求下所有出库明细数量                      |
| `not_outbound_quantity` | `need_number - outbound_quantity`，小于 0 时按 0  |
| `returned_quantity`     | 汇总该需求下所有退料数量                          |
| `is_shortage`           | 当 `unallocated_quantity > 0` 时为 1              |

`progress_status` 推荐规则：

| 条件                                                             | 状态                  |
| ---------------------------------------------------------------- | --------------------- |
| `business_status` 为 `cancelled`、`closed`、`frozen`、`abnormal` | 直接使用业务状态代码  |
| 已分配数量 = 0                                                   | `pending_allocation`  |
| 已分配数量 < 需求数量，且已出库数量 = 0                          | `partially_allocated` |
| 已分配数量 >= 需求数量，且已出库数量 = 0                         | `allocated`           |
| 已出库数量 > 0，已出库数量 < 需求数量，且已分配数量 < 需求数量   | `shortage`            |
| 已出库数量 > 0，已出库数量 < 需求数量                            | `partially_outbound`  |
| 已出库数量 >= 需求数量                                           | `outbound`            |
| 其他情况                                                         | `unknown`             |

说明：

- `progress_status` 是视图计算字段，不建议写入需求表。
- `business_status` 是业务流程状态，应该存入基础表。
- 该视图适合生产批次详情、领料进度、缺料提醒使用。

---

### 22. `v_item_batch_available_to_allocate`

职责：按库存批次计算可继续分配给新生产批次的数量。

| 字段                             | 类型              | 说明             |
| -------------------------------- | ----------------- | ---------------- |
| `batch_id`                       | `BIGINT UNSIGNED` | 库存批次 ID      |
| `item_id`                        | `BIGINT UNSIGNED` | 库存对象 ID      |
| `item_name`                      | `VARCHAR(200)`    | 库存对象名称     |
| `item_kind`                      | `VARCHAR(30)`     | 库存对象大类     |
| `batch_code`                     | `VARCHAR(100)`    | 批次号           |
| `on_hand_available_quantity`     | `DECIMAL(12,4)`   | 账面可用库存数量 |
| `reserved_quantity`              | `DECIMAL(12,4)`   | 已预留未释放数量 |
| `available_to_allocate_quantity` | `DECIMAL(12,4)`   | 可继续分配数量   |

核心计算口径：

| 字段                             | 计算来源                                         |
| -------------------------------- | ------------------------------------------------ |
| `on_hand_available_quantity`     | 来自 `v_item_batch_stock.available_quantity`     |
| `reserved_quantity`              | 来自有效分配行的未出库、未释放占用数量           |
| `available_to_allocate_quantity` | `on_hand_available_quantity - reserved_quantity` |

说明：

- 该视图用于新生产批次分配物料时判断可用量。
- 不能只看账面库存，因为已分配但未出库的数量已经被预留。
- `allocation_status IN ('released', 'cancelled')` 的分配不应继续占用库存。
- 退料后如果 `release_after_return = 1`，退回数量应释放给公共库存，不继续占用原生产批次。

---

### 23. `v_production_batch_item_summary`

职责：按生产批次和投入对象汇总需求、分配、出库、退料、报废和实际消耗。

| 字段                                 | 类型              | 说明                                    |
| ------------------------------------ | ----------------- | --------------------------------------- |
| `production_batch_id`                | `BIGINT UNSIGNED` | 生产批次 ID                             |
| `item_id`                            | `BIGINT UNSIGNED` | 投入对象 ID                             |
| `item_name`                          | `VARCHAR(200)`    | 投入对象名称                            |
| `total_need_number`                  | `DECIMAL(12,4)`   | 总需求数量                              |
| `total_allocated_quantity`           | `DECIMAL(12,4)`   | 总分配数量                              |
| `total_unallocated_quantity`         | `DECIMAL(12,4)`   | 总未分配数量                            |
| `total_outbound_quantity`            | `DECIMAL(12,4)`   | 总出库数量                              |
| `total_returned_quantity`            | `DECIMAL(12,4)`   | 总退料数量                              |
| `actual_consumed_quantity`           | `DECIMAL(12,4)`   | 实际消耗数量，建议为出库数量 - 退料数量 |
| `total_stock_scrapped_quantity`      | `DECIMAL(12,4)`   | 总库存侧报废数量                        |
| `total_production_scrapped_quantity` | `DECIMAL(12,4)`   | 总生产消耗报废数量                      |
| `is_shortage`                        | `TINYINT`         | 是否存在缺料                            |
| `is_quantity_abnormal`               | `TINYINT`         | 是否存在数量异常                        |

说明：

- 该视图适合生产批次投入汇总。
- 生产报废补料会让同一 `item_id` 的总需求增加。
- `actual_consumed_quantity` 可用于生产成本、用料分析和损耗分析。

---

### 24. `v_production_batch_output_summary`

职责：按生产批次汇总半成品和成品入库产出。

| 字段                  | 类型              | 说明                       |
| --------------------- | ----------------- | -------------------------- |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID                |
| `work_order_id`       | `BIGINT UNSIGNED` | 工单 ID                    |
| `item_id`             | `BIGINT UNSIGNED` | 产出对象 ID                |
| `item_name`           | `VARCHAR(200)`    | 产出对象名称               |
| `item_kind`           | `VARCHAR(30)`     | 产出对象类型：半成品或成品 |
| `batch_id`            | `BIGINT UNSIGNED` | 产出库存批次 ID            |
| `batch_code`          | `VARCHAR(100)`    | 产出库存批次号             |
| `inbound_quantity`    | `DECIMAL(12,4)`   | 生产入库数量               |
| `stock_status`        | `VARCHAR(20)`     | 入库库存状态               |
| `source_stage`        | `VARCHAR(100)`    | 来源工序或阶段             |

说明：

- 该视图适合查看某个生产批次产出了哪些半成品和成品。
- 半成品和成品都来自 `inbound_detail`。
- 当前库存数量不一定等于生产入库数量，因为后续可能发生销售出库、盘点调整、报废出库等。

---
