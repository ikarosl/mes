# 库存批次、库存流水与入库

> [返回 Production 数据库设计](README.md)。

本章所有入库数量与库存流水数量均为整数；库存流水可正可负但不能为 `0`，入库数量最小为 `1`。所有持久化数量除原有值域约束外还必须满足整数 `CHECK`，不得舍入或截断小数后保存。

## 3.3 库存批次与库存流水表

---

### 6. `item_batch`

职责：维护所有库存对象的库存批次，包括物料批次、半成品批次、成品批次。

| 字段                         | 类型              | 说明                                    |
| ---------------------------- | ----------------- | --------------------------------------- |
| `id`                         | `BIGINT UNSIGNED` | 主键，库存批次 ID                       |
| `item_id`                    | `BIGINT UNSIGNED` | 库存对象 ID，关联 `products.id`         |
| `item_code_snapshot`         | `VARCHAR(100)`    | 建批时库存对象编码快照                  |
| `product_name_snapshot`      | `VARCHAR(200)`    | 建批时名称快照                          |
| `unit_snapshot`              | `VARCHAR(20)`     | 建批时基础单位快照                      |
| `batch_code`                 | `VARCHAR(100)`    | 库存批次号                              |
| `source_type`                | `VARCHAR(30)`     | 来源类型，使用统一英文代码              |
| `provider`                   | `VARCHAR(100)`    | 供应商或委外方，自产时可为空            |
| `source_work_order_id`       | `BIGINT UNSIGNED` | 来源工单 ID，自产或委外时可填           |
| `source_production_batch_id` | `BIGINT UNSIGNED` | 来源生产批次 ID，自产半成品或成品时可填 |
| `production_date`            | `DATE`            | 生产日期或批次日期                      |
| `batch_status`               | `VARCHAR(20)`     | 批次业务状态，默认 `available`          |
| `remark`                     | `TEXT`            | 备注                                    |
| `version`                    | `INT`             | 乐观锁版本号，默认 `0`                  |
| 业务审计字段                 | 见统一规则        | 可变业务单据审计字段                    |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (item_id) REFERENCES products(id)`
- 外键：`FOREIGN KEY (source_work_order_id) REFERENCES work_orders(id)`
- 外键：`FOREIGN KEY (source_production_batch_id) REFERENCES production_batches(id)`
- 当两个来源字段同时存在时，使用组合外键 `(source_production_batch_id, source_work_order_id) -> production_batches(id, work_order_id)` 保证一致
- 唯一约束：`UNIQUE (item_id, batch_code)`
- 唯一约束：`UNIQUE (id, item_id)`
- 检查约束：`CHECK (source_type IN ('self_made', 'purchased', 'outsourced', 'return_inbound', 'stock_check_generated', 'other'))`
- 检查约束：`CHECK (batch_status IN ('available', 'frozen', 'disabled'))`
- 组合索引：`INDEX (item_id, batch_status)`，用于按库存对象查询可用批次

说明：

- `item_batch` 是统一库存批次表。
- 物料、半成品、成品都使用该表。
- `batch_status` 只表示批次是否允许参与库存业务，不表示批次是否已经入库或库存是否用完：
  - `available`：允许参与库存分配和出库，但仍须存在正数可用库存。
  - `frozen`：临时冻结，不允许新增库存分配和出库；历史库存及流水继续保留。
  - `disabled`：批次已停用，不允许继续参与库存业务；历史库存及流水继续保留。
- 库存是否存在、是否用完应通过 `inventory_transaction` 按批次和库存状态汇总判断，不得仅凭 `batch_status='available'` 判断。
- `GET /production/material-demands/:demandId/available-item-batches` 必须同时满足批次状态为 `available`，且 `available` 库存流水聚合数量大于 `0`；没有流水、聚合为 `0` 或负数的批次不得返回。
- 创建待确认入库单时可以先创建或复用 `item_batch`，确认入库后才写入库存流水；取消待确认入库单不写库存流水，也不联动修改批次状态。
- 场景示例：入库单 A 使用物料批号 `B001`，在待确认阶段创建批次记录，随后 A 被取消，因此该批次没有库存流水。之后入库单 B 仍可能收到同一物料批号 `B001`，并复用该批次记录完成真实入库。如果取消 A 时把批次改成 `disabled`，就会导致 B 后续形成的真实库存也无法使用。因此单据取消与批次停用必须分别处理。
- `frozen`、`disabled` 应由独立的批次管理操作触发，不由入库单取消、库存归零等事件自动触发。
- `source_production_batch_id` 用于追溯自产半成品或成品来自哪个生产批次。
- 编码、名称和单位快照用于历史批次标签及客户审核，不随产品主数据变化。
- 不建议将 `production_batches.id` 直接作为库存流水的 `batch_id`。

示例：

| batch_id | item_id | 类型       | source_type | source_production_batch_id |
| -------- | ------- | ---------- | ----------- | -------------------------- |
| ib1      | pi2     | 物料批次   | purchased   | NULL                       |
| ib6      | pi3     | 半成品批次 | self_made   | pb1                        |
| ib7      | pi4     | 成品批次   | self_made   | pb1                        |

---

### 7. `inventory_transaction`

职责：维护统一库存流水，记录所有会影响库存对象数量或库存状态的变动明细。物料、半成品、成品共用该表。

库存现存量、可分配库存、批次是否用完等结果应从该表按库存对象、批次和库存状态汇总得出，而不是写回批次表。

| 字段                         | 类型              | 说明                                                 |
| ---------------------------- | ----------------- | ---------------------------------------------------- |
| `id`                         | `BIGINT UNSIGNED` | 主键                                                 |
| `item_id`                    | `BIGINT UNSIGNED` | 库存对象 ID，关联 `products.id`                      |
| `batch_id`                   | `BIGINT UNSIGNED` | 库存批次 ID，关联 `item_batch.id`                    |
| `transaction_type`           | `VARCHAR(30)`     | 库存变动类型                                         |
| `quantity`                   | `DECIMAL(12,4)`   | 库存变动数量。正数表示增加，负数表示减少，不能为 `0` |
| `unit_snapshot`              | `VARCHAR(20)`     | 发生流水时的单位快照                                 |
| `stock_status`               | `VARCHAR(20)`     | 库存状态，默认 `available`                           |
| `reference_type`             | `VARCHAR(50)`     | 来源明细类型                                         |
| `reference_detail_id`        | `BIGINT UNSIGNED` | 来源明细 ID，建议指向明细行，不要只指向主单          |
| `idempotency_key`            | `VARCHAR(150)`    | 幂等键，防止同一业务动作重复生成库存流水             |
| `transaction_group_key`      | `VARCHAR(150)`    | 状态转换分组键，同事务双流水共享，可为空             |
| `reversal_of_transaction_id` | `BIGINT UNSIGNED` | 被冲销的原流水 ID，正常流水为空                      |
| `remark`                     | `TEXT`            | 备注                                                 |
| `created_by`                 | `BIGINT UNSIGNED` | 创建人                                               |
| `created_at`                 | `DATETIME`        | 创建时间，默认 `CURRENT_TIMESTAMP`                   |

`transaction_type` 可选语义：

| 值                             | 说明                               |
| ------------------------------ | ---------------------------------- |
| `purchase_inbound`             | 外购物料、外购半成品、外购成品入库 |
| `production_inbound`           | 自产半成品或成品入库               |
| `outsourced_inbound`           | 委外加工完成入库                   |
| `production_material_outbound` | 生产批次领料出库                   |
| `sales_outbound`               | 成品销售出库，后续可扩展           |
| `material_return_inbound`      | 生产退料回仓                       |
| `scrap_outbound`               | 报废扣减库存                       |
| `stock_check_adjustment`       | 盘点差异调整                       |
| `status_transfer_in`           | 库存状态转入                       |
| `status_transfer_out`          | 库存状态转出                       |

`stock_status` 可选语义：

| 值                   | 说明           |
| -------------------- | -------------- |
| `available`          | 可分配、可出库 |
| `pending_inspection` | 暂不可用       |
| `frozen`             | 被业务冻结     |
| `defective`          | 不良品         |

`reference_type` 可选语义：

| 值                   | 说明     |
| -------------------- | -------- |
| `inbound_detail`     | 入库明细 |
| `outbound_detail`    | 出库明细 |
| `return_detail`      | 退料明细 |
| `scrap`              | 报废记录 |
| `stock_check_detail` | 盘点明细 |
| `inspection_record`  | 检验记录 |
| `manual`             | 手工调整 |

约束：

- 主键：`id`
- 检查约束：`CHECK (quantity <> 0)`
- 检查约束：`CHECK (transaction_type IN ('purchase_inbound', 'production_inbound', 'outsourced_inbound', 'production_material_outbound', 'sales_outbound', 'material_return_inbound', 'scrap_outbound', 'stock_check_adjustment', 'status_transfer_in', 'status_transfer_out'))`
- 检查约束：`CHECK (stock_status IN ('available', 'pending_inspection', 'frozen', 'defective'))`
- 唯一约束：`UNIQUE (idempotency_key)`
- 索引：`INDEX (transaction_group_key)`
- 组合索引：`INDEX (item_id, batch_id, stock_status, created_at)`，用于库存汇总和批次流水查询
- 外键：`FOREIGN KEY (item_id) REFERENCES products(id)`
- 外键：`FOREIGN KEY (batch_id, item_id) REFERENCES item_batch(id, item_id)`
- 外键：`reversal_of_transaction_id -> inventory_transaction.id`
- 唯一约束：`UNIQUE (reversal_of_transaction_id)`；一期仅允许对同一原流水执行一次整笔全额冲销，不支持部分冲销或重复冲销

说明：

- 库存流水是库存数量的事实来源。
- 入库、出库、退料、报废、盘点调整都应产生对应流水。
- `reference_detail_id` 建议指向明细表，例如 `inbound_detail.id`、`outbound_detail.id`、`return_detail.id`。
- 不建议直接修改库存余额字段来表达库存变化。
- 已写入流水不可更新或删除；错误通过一条数量相反、状态相同的冲销流水修正。
- `202608130002` 起由数据库触发器直接拒绝 `inventory_transaction` 的 `UPDATE` 和 `DELETE`，应用账号和普通运维脚本不能绕过追加式纠错规则。唯一例外是名称以 `_test` 或 `_ci` 结尾的专用测试库，可由测试 fixture 在同一数据库连接上短暂设置 `@company_inventory_test_cleanup = 1` 后清理自身唯一前缀数据；该变量在非专用库无效，且 fixture 必须在释放连接前清空。
- 此处“冲销”仅表示 MES 库存流水纠错，与财务报销单、付款单或财务凭证 ID 无关；例如已确认的入库、出库、退料、报废或盘点流水录入错误时，以反向流水抵消原库存影响。
- 一期冲销流水必须与原流水保持相同的 `item_id`、`batch_id`、`stock_status`、`unit_snapshot`、`transaction_type` 和原业务引用，`quantity` 必须等于原流水数量的相反数，并填写新的唯一 `idempotency_key`。
- 原流水、冲销流水和操作日志必须保留，均不得更新或删除。未来如确需部分冲销，应通过追加迁移调整唯一约束，并增加累计冲销数量不超过原流水绝对数量的事务校验；该能力不属于一期范围。
- 状态转换流水必须填写 `transaction_group_key`；非状态转换流水可以为空。
- `GET /production/inventory-batches/:itemBatchId` 的批次详情必须按发生时间和流水 ID 倒序返回该批次全部正、负库存流水，不得只投影入库正流水；返回信息包含流水类型、数量、库存状态、业务明细引用、发生时间、备注、状态转换分组和冲销关联。

### 7.1 `inventory_batch_balance`

职责：直接记住“某个库存批次现在各有多少可用、待检、冻结或不良库存”，避免每次查看批次库存都重算全部历史流水。

设计类型：由库存流水同步维护、可从流水重建的查询投影，不是库存事实表。

| 字段               | 类型              | 说明                                                   |
| ------------------ | ----------------- | ------------------------------------------------------ |
| `batch_id`         | `BIGINT UNSIGNED` | 库存批次 ID                                            |
| `item_id`          | `BIGINT UNSIGNED` | 库存对象 ID，与批次中的物料保持一致                    |
| `stock_status`     | `VARCHAR(20)`     | 库存状态：可用、待检、冻结或不良                       |
| `current_quantity` | `BIGINT`          | 该批次在该库存状态下的当前整数余额                     |
| `version`          | `BIGINT UNSIGNED` | 投影更新次数，默认 `0`，每次余额变化递增               |
| `updated_at`       | `DATETIME`        | 最近一次同步时间，由数据库自动更新                     |

约束与索引：

- 主键：`PRIMARY KEY (batch_id, stock_status)`；同一批次的每种库存状态只保留一行。
- 组合外键：`(batch_id, item_id) -> item_batch(id, item_id)`，防止余额行记录成其他物料。
- 检查约束：`stock_status IN ('available', 'pending_inspection', 'frozen', 'defective')`。
- 负数余额由 `BEFORE INSERT/UPDATE` 触发器拒绝；测试专用清理变量不属于生产业务入口。
- 索引：`INDEX (item_id, stock_status, batch_id)`，用于按物料和库存状态查找批次余额。

### 7.2 `inventory_item_balance`

职责：直接记住“某种物料当前总共有多少库存”，并按库存状态和批次是否可用分开存放，供库存汇总和供需预警快速读取。

设计类型：由批次余额继续汇总、可重建的物料级查询投影，不是产品主数据，也不是库存事实表。

| 字段               | 类型              | 说明                                                      |
| ------------------ | ----------------- | --------------------------------------------------------- |
| `item_id`          | `BIGINT UNSIGNED` | 库存对象 ID                                               |
| `stock_status`     | `VARCHAR(20)`     | 库存自身状态：可用、待检、冻结或不良                      |
| `batch_status`     | `VARCHAR(20)`     | 库存批次业务状态：可用、冻结或停用                        |
| `current_quantity` | `BIGINT`          | 该物料在这组状态组合下的当前整数总量                      |
| `version`          | `BIGINT UNSIGNED` | 投影更新次数，默认 `0`，每次余额变化或状态搬移时递增      |
| `updated_at`       | `DATETIME`        | 最近一次同步时间，由数据库自动更新                        |

约束与索引：

- 主键：`PRIMARY KEY (item_id, stock_status, batch_status)`；每种物料在每组状态下只保留一行。
- 外键：`item_id -> products.id`，只约束稳定物料身份，不允许 Product 模块直接维护本表。
- 检查约束：`stock_status IN ('available', 'pending_inspection', 'frozen', 'defective')`。
- 检查约束：`batch_status IN ('available', 'frozen', 'disabled')`。
- 负数余额由 `BEFORE INSERT/UPDATE` 触发器拒绝。

### 7.3 余额投影维护规则

`202608250002-inventory-balances-and-demand-fulfillment` 建立上述两级同步余额投影。两张表均归 Production 模块所有，只是 `inventory_transaction` 的可重建查询结果，不属于 Product 主数据模块，也不构成新的库存事实来源。其他模块不得直接写入或把它们当作跨模块主数据接口。

两表的 `current_quantity` 使用 `BIGINT`，不接受小数。单笔业务数量仍受 `1..99999999` 限制，但累计余额允许超过单笔上限。维护规则如下：

1. 插入一条 `inventory_transaction` 时，同一数据库事务先更新对应 `inventory_batch_balance`，再更新对应 `inventory_item_balance`。
2. `item_batch.batch_status` 变化时，批次余额不变；物料总余额从旧批次状态桶扣除，并加入新批次状态桶。
3. 余额变为 `0` 的空投影行可以删除；查询端必须把不存在的组合解释为数量 `0`。
4. `AFTER DELETE` 触发器只服务于 `_test/_ci` 测试库受控清理；生产库存流水禁止删除。
5. 迁移首次建立投影前先检查历史流水聚合不得为负，再从全部流水回填两级余额。

库存流水仍是唯一库存事实来源。余额投影没有独立业务写入口，必须可以通过流水按批次、物料和状态重新汇总，并通过对账发现漂移。查询当前库存和物料供需预警优先读取余额投影；业务纠错仍只能追加反向库存流水，禁止直接修改余额伪造库存变化。

---

## 3.4 入库表

---

### 8. `inbound_order`

职责：维护入库主单，记录一次入库动作。入库来源可以是外购、自主生产、委外、退货入库、盘点生成等。

| 字段                  | 类型              | 说明                                        |
| --------------------- | ----------------- | ------------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                                        |
| `inbound_no`          | `VARCHAR(100)`    | 入库单号                                    |
| `source_type`         | `VARCHAR(30)`     | 来源类型，使用统一英文代码                  |
| `provider`            | `VARCHAR(100)`    | 供应商、委外方或来源方，自产时可为空        |
| `work_order_id`       | `BIGINT UNSIGNED` | 来源工单 ID，自产或委外时可填               |
| `production_batch_id` | `BIGINT UNSIGNED` | 来源生产批次 ID，自产半成品或成品入库时可填 |
| `status`              | `VARCHAR(30)`     | 入库单状态，默认 `pending`                  |
| `inbound_at`          | `DATETIME`        | 实际入库时间                                |
| `operator_id`         | `BIGINT UNSIGNED` | 操作人 ID                                   |
| `version`             | `INT`             | 乐观锁版本号，默认 `0`                      |
| `remark`              | `TEXT`            | 备注                                        |
| `cancel_reason`       | `TEXT`            | 取消原因；历史未记录数据可为空              |
| `cancelled_by`        | `BIGINT UNSIGNED` | 取消人；历史未记录数据可为空                |
| `cancelled_at`        | `DATETIME`        | 取消时间；历史未记录数据可为空              |
| 业务审计字段          | 见统一规则        | 可变业务单据审计字段                        |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (inbound_no)`
- 唯一约束：`UNIQUE (id, source_type)`
- 外键：`FOREIGN KEY (work_order_id) REFERENCES work_orders(id)`
- 外键：`FOREIGN KEY (production_batch_id) REFERENCES production_batches(id)`
- 当两个字段同时存在时，使用组合外键 `(production_batch_id, work_order_id) -> production_batches(id, work_order_id)` 保证一致
- 外键：`FOREIGN KEY (operator_id) REFERENCES users(id)`
- 外键：`FOREIGN KEY (cancelled_by) REFERENCES users(id)`
- 检查约束：`CHECK (source_type IN ('self_made', 'purchased', 'outsourced', 'return_inbound', 'stock_check_generated', 'other'))`
- 检查约束：`CHECK (status IN ('pending', 'completed', 'cancelled'))`
- 组合索引：`INDEX (status, created_at)`，用于入库单状态分页

说明：

- 入库主单表达“这一次入库动作”。
- 具体入库了哪些对象、哪些批次、多少数量，由 `inbound_detail` 记录。
- 半成品入库和成品入库都可以使用该表。
- 自产入库时，`provider` 可以为空，`production_batch_id` 应建议填写。
- 外购入库时，`provider` 建议填写，`production_batch_id` 为空。
- 待确认入库单取消必须填写原因；取消事实与状态、成功操作日志在同一事务中提交，不覆盖制单备注。

---

### 9. `inbound_detail`

职责：维护入库明细，记录本次入库的具体库存对象、库存批次、入库数量和库存状态。

| 字段             | 类型              | 说明                                 |
| ---------------- | ----------------- | ------------------------------------ |
| `id`             | `BIGINT UNSIGNED` | 主键                                 |
| `inbound_id`     | `BIGINT UNSIGNED` | 入库主单 ID，关联 `inbound_order.id` |
| `item_id`        | `BIGINT UNSIGNED` | 入库对象 ID，关联 `products.id`      |
| `batch_id`       | `BIGINT UNSIGNED` | 入库批次 ID，关联 `item_batch.id`    |
| `inbound_number` | `DECIMAL(12,4)`   | 本次入库数量                         |
| `unit_snapshot`  | `VARCHAR(20)`     | 入库时单位快照                       |
| `stock_status`   | `VARCHAR(20)`     | 入库后的库存状态，默认 `available`   |
| `source_stage`   | `VARCHAR(100)`    | 来源工序或生产阶段，半成品入库时有用 |
| `remark`         | `TEXT`            | 备注                                 |
| `created_by`     | `BIGINT UNSIGNED` | 创建人                               |
| `created_at`     | `DATETIME`        | 创建时间，默认 `CURRENT_TIMESTAMP`   |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (inbound_id) REFERENCES inbound_order(id)`
- 外键：`FOREIGN KEY (item_id) REFERENCES products(id)`
- 外键：`FOREIGN KEY (batch_id, item_id) REFERENCES item_batch(id, item_id)`
- 检查约束：`CHECK (inbound_number > 0)`
- 检查约束：`CHECK (stock_status IN ('available', 'pending_inspection', 'frozen', 'defective'))`
- 唯一约束：`UNIQUE (inbound_id, batch_id, item_id)`

说明：

- `inbound_detail` 是入库事实表。
- 每条入库明细应生成一条或多条 `inventory_transaction`。
- 生产入库、采购入库、委外入库都可以走该表。
- 入库数量不建议写回 `item_batch`，应通过库存流水汇总。

---
