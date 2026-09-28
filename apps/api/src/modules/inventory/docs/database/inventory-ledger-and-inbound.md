# 库存批次、库存流水与入库

> [返回 Inventory 数据库设计](../database.md)。库存表由 Inventory 唯一所有，生产来源资格与预留仍由 Production 负责。

本章所有入库数量与库存流水数量均为整数；库存流水可正可负但不能为 `0`，入库数量最小为 `1`。所有持久化数量除原有值域约束外还必须满足整数 `CHECK`，不得舍入或截断小数后保存。

当前执行范围为物料精确版本的外购入库与已批准产出清单的成品入库。成品通过显式 `product_id` 分支进入同一库存批次、明细、流水及批次余额，不将成品 ID 写入 `item_id`。成品身份及字段约束见本章各表与[身份分支](#成品身份与范围)，生产来源资格与事务编排见[成品入库](../../../production/docs/database/finished-goods-inbound.md)；其他未开放来源和交易代码仍只是边界。

物料的基础 `item_id` 与精确 `material_variant_id` 必须成对传播：`item_batch` 保存版本 ID 和版本
编码快照；入库、出库、退料、报废、盘点明细及 `inventory_transaction` 均保存同一版本 ID，并以组合
外键校验它与 `item_id`、库存批次、需求/分配的一致性。版本停用不使已经形成的历史需求、库存批次或库存流水失效；
新增业务是否允许使用该版本由下述采购／生产用途规则决定。库存汇总既可按基础物料聚合，也必须支持按精确版本对账。

采购用途见 [ADR-0013](../../../../../../../docs/adr/0013-procurement-source-and-stock-boundaries.md)：允许停用精确版本办理采购、到货、检验及合格入库。Production 按公开 Product 用途能力拒绝停用版本的新分配／领料制单及确认，并在候选、可领齐套和短批预计量中排除其未领份额，历史库存和已确认领料仍保留。生产选版、基础物料／分类停用及软删除规则不放宽；库存批次 `frozen/disabled` 继续独立校验。

### 物料身份字段与版本余额投影

`item_batch`、需求、分配和物流事实中的 `item_id` 保留现有列名，但统一指向 `materials.id`，不再表示成品。Product BOM/物料版本、`production_material_requirement_basis` 和 `inventory_material_variant_balance` 中的基础物料字段统一命名为 `material_id`。

`inventory_material_variant_balance` 是从库存流水重建的精确版本余额投影，字段为 `material_variant_id`、`material_id`、`stock_status`、`batch_status`、`current_quantity`、`version`、`updated_at`。主键为 `(material_variant_id, stock_status, batch_status)`；组合外键 `(material_variant_id, material_id) -> material_variants(id, material_id)`；数量是非负整数。流水插入/清理与批次状态变更触发器同步维护投影，业务接口不能直接覆盖余额。拆表迁移同时重建受字段重命名影响的组合外键和触发器，库存事实仍只有 `inventory_transaction`。

## 3.3 库存批次与库存流水表

---

### 6. `item_batch`

职责：维护物料精确版本或成品身份的库存目标批次。来源集合来自实际入库明细，库批不决定采购供应商、生产任务或计划内外归属。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | 主键 |
| `item_id` / `material_variant_id` | `BIGINT UNSIGNED NULL` | 物料与精确版本；成品时均为空 |
| `product_id` | `BIGINT UNSIGNED NULL` | 成品身份；物料时为空 |
| `item_code_snapshot` | `VARCHAR(100)` | 建批时编码快照 |
| `material_variant_code_snapshot` | `VARCHAR(180) NULL` | 物料版本编码快照，成品为空 |
| `unit_snapshot` | `VARCHAR(20)` | 建批时单位快照 |
| `batch_code` | `VARCHAR(100)` | 内部库存批号，只在本表存一份 |
| `source_type` | `VARCHAR(30)` | 库批类别；成品统一 `finished_product`，不代表计划内外 |
| `provider` | `VARCHAR(100) NULL` | 历史批次来源描述；新共用批次不从此推断供应商 |
| `source_work_order_id` / `source_production_batch_id` | `BIGINT UNSIGNED NULL` | 历史来源字段；新成品库批均为空，来源见明细 |
| `production_date` | `DATE NULL` | 批次日期 |
| `batch_status` | `VARCHAR(20)` | `available/frozen/disabled`，默认 `available` |
| `remark` / `version` | `TEXT NULL` / `INT` | 备注及乐观锁版本 |
| `created_by/at`、`updated_by/at` | 业务审计类型 | 创建、更新人与时间 |

主键 `id`；唯一键 `(material_variant_id,batch_code)`、`(product_id,batch_code)`、`(id,item_id)`、`(id,item_id,material_variant_id)`、`(id,product_id)`；物料与成品身份互斥 CHECK，`batch_status` 与 `source_type` 代码 CHECK。外键分别保护物料、精确版本、成品及历史来源工单/任务，索引 `(item_id,batch_status)`、`(product_id,batch_status)` 支持候选查询。身份、批号、单位、来源描述不可回改；状态可以按批次管理动作变化。新成品库批 `source_type='finished_product'` 且 `provider/source_work_order_id/source_production_batch_id` 必须为空。

新批次可用指定批号或自动批号；同请求只有相同 `clientKey` 才共用一个新批次。同产品或同物料精确版本、相同单位且 `available` 的已有批次可再次入库。批号相同本身不自动表示复用。一个库批可以有多个来源，一份来源授权也可以分入不同库批。批次余额与已入历史从流水、明细分别推导，不能以一方替代另一方。

---

### 7. `inventory_transaction`

职责：维护唯一库存流水。物料使用 item_id + material_variant_id；成品使用 product_id，绑定同身份库存批次和成品入库明细。当前成品只允许正数 available 的 production_inbound；销售出库、已入成品报废或冲销尚未开放。

库存现存量、可分配库存、批次是否用完等结果应从该表按库存对象、批次和库存状态汇总得出，而不是写回批次表。

| 字段                         | 类型              | 说明                                                 |
| ---------------------------- | ----------------- | ---------------------------------------------------- |
| `id`                         | `BIGINT UNSIGNED` | 主键                                                 |
| `item_id`                    | `BIGINT UNSIGNED NULL` | 库存对象 ID，关联 `materials.id`                      |
| `material_variant_id`         | `BIGINT UNSIGNED NULL` | 精确物料版本 ID，与批次和基础物料一致                 |
| `product_id` | `BIGINT UNSIGNED NULL` | 成品身份；与 item_id/material_variant_id 互斥 |
| `batch_id`                   | `BIGINT UNSIGNED` | 库存批次 ID，关联 `item_batch.id`                    |
| `transaction_type`           | `VARCHAR(30)`     | 库存变动类型                                         |
| `quantity`                   | `INT`   | 库存变动数量。正数表示增加，负数表示减少，不能为 `0` |
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
| `purchase_inbound`             | 外购物料入库（含半成品分类物料） |
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

- 成品组合外键：`(batch_id, product_id) -> item_batch(id, product_id)`，`(reference_detail_id, product_id, batch_id) -> inbound_detail(id, product_id, batch_id)`。成品三列非空，不能利用部分 NULL 绕过来源引用。
- 成品流水唯一键：`(product_id, reference_type, reference_detail_id, transaction_type)`，防止同一成品明细重复记账。
- 成品仅允许正数 `production_inbound`、`reference_type=inbound_detail`、`stock_status=available`，冲销关联和状态转移分组均为空；物料/成品身份由 CHECK 互斥。
- 成品索引：`(product_id, batch_id, stock_status, created_at)`、`(batch_id, product_id)`、`(reference_detail_id, product_id, batch_id)`。

- 主键：`id`
- 检查约束：`CHECK (quantity <> 0)`
- 检查约束：`CHECK (transaction_type IN ('purchase_inbound', 'production_inbound', 'outsourced_inbound', 'production_material_outbound', 'sales_outbound', 'material_return_inbound', 'scrap_outbound', 'stock_check_adjustment', 'status_transfer_in', 'status_transfer_out'))`
- 检查约束：`CHECK (stock_status IN ('available', 'pending_inspection', 'frozen', 'defective'))`
- 唯一约束：`UNIQUE (idempotency_key)`
- 索引：`INDEX (transaction_group_key)`
- 组合索引：`INDEX (item_id, batch_id, stock_status, created_at)`，用于库存汇总和批次流水查询
- 外键：`FOREIGN KEY (item_id) REFERENCES materials(id)`
- 外键：`FOREIGN KEY (batch_id, item_id) REFERENCES item_batch(id, item_id)`
- 外键：`FOREIGN KEY (batch_id, item_id, material_variant_id) REFERENCES item_batch(id, item_id, material_variant_id)`
- 外键：`reversal_of_transaction_id -> inventory_transaction.id`
- 唯一约束：`UNIQUE (reversal_of_transaction_id)`；一期仅允许对同一原流水执行一次整笔全额冲销，不支持部分冲销或重复冲销

说明：

- 库存流水是库存数量的事实来源。
- 入库、出库、退料、报废、盘点调整都应产生对应流水。
- `reference_detail_id` 建议指向明细表，例如 `inbound_detail.id`、`outbound_detail.id`、`return_detail.id`。
- 不建议直接修改库存余额字段来表达库存变化。
- 已写入流水不可更新或删除；物料已开放的纠错入口通过数量相反、状态相同的冲销流水修正，成品当前不开放冲销。
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
| `item_id`          | `BIGINT UNSIGNED NULL` | 库存对象 ID，与批次中的物料保持一致                    |
| `product_id` | `BIGINT UNSIGNED NULL` | 成品身份；与 item_id 二选一，不复制精确版本 ID |
| `stock_status`     | `VARCHAR(20)`     | 库存状态：可用、待检、冻结或不良                       |
| `current_quantity` | `BIGINT`          | 该批次在该库存状态下的当前整数余额                     |
| `version`          | `BIGINT UNSIGNED` | 投影更新次数，默认 `0`，每次余额变化递增               |
| `updated_at`       | `DATETIME`        | 最近一次同步时间，由数据库自动更新                     |

约束与索引：

- 主键：`PRIMARY KEY (batch_id, stock_status)`；同一批次的每种库存状态只保留一行。
- 组合外键：`(batch_id, item_id) -> item_batch(id, item_id)`，防止余额行记录成其他物料。
- 成品组合外键：`(batch_id, product_id) -> item_batch(id, product_id)`；CHECK 要求物料与成品身份二选一。
- 成品索引：`(product_id, stock_status, batch_id)`、`(batch_id, product_id)`。
- 检查约束：`stock_status IN ('available', 'pending_inspection', 'frozen', 'defective')`。
- 负数余额由 `BEFORE INSERT/UPDATE` 触发器拒绝；测试专用清理变量不属于生产业务入口。
- 索引：`INDEX (item_id, stock_status, batch_id)`，用于按物料和库存状态查找批次余额。

### 7.2 基础物料库存合计

基础物料总库存由 `inventory_material_variant_balance` 按 `material_id` 汇总，不单独持久化基础物料余额表。按 `stock_status + batch_status` 分组可得到各状态总量；可用库存只包含两个状态均为 `available` 的余额。查询成本随版本余额行数增长，不随历史流水条数直接增长。

物料总量只用于合计展示，不代表各版本可互换。供需预警按精确版本分别展示和计算缺口；禁止直接用跨版本总库存抵扣需求。

### 7.3 `inventory_material_variant_balance`

职责：直接记住“某个精确物料版本当前总共有多少库存”，并按库存状态和批次状态分桶，供管理员在基础物料的候选版本中选择时查看版本级可用量。

设计类型：与批次余额表由同一库存流水同步维护、可重建的精确物料版本查询投影，不是库存事实表。

| 字段                  | 类型              | 说明                                                         |
| --------------------- | ----------------- | ------------------------------------------------------------ |
| `material_variant_id` | `BIGINT UNSIGNED` | 精确物料版本 ID，例如 `m1.077.012-v1-A` 对应的版本记录       |
| `material_id`         | `BIGINT UNSIGNED` | 所属基础物料 ID，例如编码 `m1.077.012` 对应的稳定物料身份    |
| `stock_status`        | `VARCHAR(20)`     | 库存自身状态：可用、待检、冻结或不良                         |
| `batch_status`        | `VARCHAR(20)`     | 库存批次业务状态：可用、冻结或停用                           |
| `current_quantity`    | `BIGINT`          | 该精确版本在这组状态组合下跨库存批次汇总的当前整数总量       |
| `version`             | `BIGINT UNSIGNED` | 投影更新次数，默认 `0`，每次余额变化或状态搬移时递增          |
| `updated_at`          | `DATETIME`        | 最近一次同步时间，由数据库自动更新                           |

约束与索引：

- 主键：`PRIMARY KEY (material_variant_id, stock_status, batch_status)`；每个精确版本在每组状态下只保留一行。
- 组合外键：`(material_variant_id, material_id) -> material_variants(id, material_id)`，保证版本属于所记录的基础物料。
- 检查约束：`stock_status IN ('available', 'pending_inspection', 'frozen', 'defective')`。
- 检查约束：`batch_status IN ('available', 'frozen', 'disabled')`。
- 负数余额由 `BEFORE INSERT/UPDATE` 触发器拒绝。
- 索引：`INDEX (material_id, stock_status, batch_status, material_variant_id)`，用于从基础物料进入候选版本时批量读取各版本余额。

说明：

- 本表保留精确版本维度，同时作为基础物料库存合计的查询来源；跨版本合计通过按 `material_id` 分组计算。
- 物料分支的 `item_batch` 已绑定且只能绑定一个 `material_variant_id`，因此 `inventory_batch_balance` 不重复保存版本字段；查询批次版本时通过 `item_batch` 取得。
- 版本级余额只用于库存展示、候选版本选择和校验，不改变“BOM 只绑定基础物料、具体版本由管理员选定”的业务断论。

### 7.4 余额投影维护规则

当前仅保留 `inventory_batch_balance` 和 `inventory_material_variant_balance` 两张余额投影，均归 Inventory 所有，只是 `inventory_transaction` 的可重建查询结果，不属于 Product 主数据，也不构成新的库存事实来源。其他模块不得直接写入或把它们当作跨模块主数据接口。

两张表的 `current_quantity` 使用 `BIGINT`，不接受小数。单笔业务数量仍受 `1..99999999` 限制，但累计余额允许超过单笔上限。维护规则如下：

1. 插入库存流水时，同事务更新 `inventory_batch_balance`；物料分支另更新 `inventory_material_variant_balance`，成品分支不生成虚构物料版本桶。
   精确版本余额投影先以数量 `0` 确保目标桶存在，再用流水正负数量更新余额；这样负数出库流水只在最终余额不足时被防负数约束拒绝。
2. `item_batch.batch_status` 变化时，批次余额不变；仅物料分支搬移精确版本余额，成品按批次余额及批次状态直接查询。
3. 余额变为 `0` 的空投影行可以删除；查询端必须把不存在的组合解释为数量 `0`。
4. `AFTER DELETE` 触发器只服务于 `_test/_ci` 测试库受控清理；生产库存流水禁止删除。
5. 迁移首次建立投影前先检查历史流水聚合不得为负，再从全部流水分别按以下维度回填：
   - 批次余额：`batch_id + item_id/product_id + stock_status`（按对应身份分支）；
   - 精确版本余额：`material_variant_id + material_id + stock_status + batch_status`。

对账时分别将流水按上述两个维度汇总，与对应余额逐项比较（包括缺行和多余行，缺行按零处理）；基础物料合计通过版本余额分组后与流水按物料、库存状态及批次状态的汇总比较，不依赖独立物料余额表。

库存流水仍是唯一库存事实来源。余额投影没有独立业务写入口，必须可以通过流水按批次、物料/成品身份和状态重新汇总，并通过对账发现漂移。查询当前库存和物料供需预警优先读取余额投影；物料已开放的纠错入口只能追加反向库存流水，成品当前不开放冲销；禁止直接修改余额伪造库存变化。

---

### 7.5 库存查询与可分配量

当前库存列表与明细由 Inventory Repository 执行 SQL；Production 的供需、候选及追溯展示通过已登记的只读查询组合库存字段，不建立独立数据库视图。所有汇总和加减遵守整数数量规则；库存用完不自动改写 `item_batch.batch_status`。

- 库存批次列表和详情由 [MysqlInventoryInboundRepository](../../infrastructure/mysql-inventory-inbound.repository.ts) 的 `loadInventories` 查询读取 `inventory_batch_balance` 中 `stock_status = available` 的余额，缺行按 `0` 处理；库存流水详情仍读取 `inventory_transaction`。历史账面库存保留，可分配数量还要求批次状态 `available` 且 Product 公开能力确认当前生产用途允许使用该精确版本，否则为 `0`。
- 初始物料需求配置与人工追加候选由 [MysqlProductionMaterialDemandConfigurationRepository](../../../production/infrastructure/mysql-production-material-demand-configuration.repository.ts) 只读取启用的物料版本，不查询或展示库存；库存余额投影未扣除分配预留，因此不得用于该需求配置窗口的库存提示。
- 分配候选由 [MysqlProductionMaterialRepository](../../../production/infrastructure/mysql-production-material.repository.ts) 的 `listAvailableItemBatches` 按活动需求的 `item_id + material_variant_id` 匹配库存批次，只返回批次状态为 `available` 且账面可用量大于 `0` 的批次；该入口按当前用途候选展示可用数量；分配锁内余额由 Inventory 在批次锁后对 `inventory_batch_balance` 做当前读，缺行视为零，避免使用事务早期快照。

库存批次查询与分配候选使用相同的预留口径：

```text
单条分配的未出库占用 = max(assigned_number - 已确认出库量, 0)
批次预留量 = sum(未 released/cancelled 的分配行的未出库占用)
可继续分配量 = max(账面可用库存 - 批次预留量, 0)
```

已确认出库量只统计主单 `outbound_order.status = completed` 的明细。待出库单尚未减少账面库存，其对应数量仍在分配预留内，不能再次扣除。`frozen/abnormal` 分配仍保留占用；释放或取消分配才移除相应预留。当前确认退料固定回到公共可用库存，增加库存流水余额，不重新增加原分配的可出库量，不创建或恢复需求。需求履约展示与分配门禁均不扣除退料量；净领用量只服务领退追溯，不参与短批授权或开工判断，不能用作现场实存量或新需求。

候选可能显示可继续分配量为 `0` 的正库存批次；返回候选不代表写入资格。分配写事务须锁定需求和库存批次，重新校验批次状态、精确版本、需求缺口及流水余额扣除预留后的数量。

精确版本物料库存及供需信息由 [MysqlProductionSupplyDemandRepository](../../../production/infrastructure/mysql-production-supply-demand.repository.ts) 的 `list` 计算：按 `item_id + material_variant_id` 汇总全部 `active.remaining_number`，与 `inventory_material_variant_balance` 中同物料、同版本的余额匹配，缺行按 `0` 处理。总库存包含该版本全部状态，停用版本的历史库存仍保留。用于生产供需比较的可用库存，除库存状态和批次状态均为 `available` 外，还须由 Product `MaterialVariantQuery.listEnabledByMaterials` 公开能力确认基础物料、分类及精确版本均启用且未删除；不直接读取 Product 状态表作为资格。未满足该用途资格时可用量为 `0`，该数量仍在总库存及不可领库存中展示。缺口为 `max(该版本活动需求剩余量 - 该版本可用库存, 0)`，不同版本不得合并抵扣。资格集合在 SQL 缺口排序和分页前批量解析，不能取出一页后清零可用量而保留错误排序；确认分配／领料仍须在各自写事务内重新校验。

`GET /production/inventory-material-supply-demand` 每行对应一个有正库存（含其他状态库存）或活动需求的精确版本，`total` 和分页均按版本计数；返回必填 `materialVariantId/materialVariantCode`，编码和单位优先取同版本 ID 最大的活动需求快照，无活动需求时取同版本 ID 最大的库存批次快照；名称按基础物料 ID 读取当前主数据。无需求版本的未完成需求与缺口均为 `0`。先按是否有未完成需求降序，再按缺口降序、物料编码、物料 ID、版本 ID 稳定排序。关键词匹配展示的物料编码、名称或版本编码，也匹配同版本任一活动需求的编码和版本编码快照；搜索不改变该版本完整的库存与需求汇总。无库存且无活动需求的版本不展示，零余额行是否已清理不影响候选集合。

点击版本行后，`GET /production/inventory-material-supply-demand/:itemId/demands` 必须携带 `materialVariantId` 查询参数。缺失或格式不合法由 DTO 拒绝；查询同时限定基础物料、精确版本和活动状态，返回需求的版本 ID 与编码快照，分页只计算该版本的需求。物料与版本不匹配时返回空列表，不退回物料级查询。

活动需求包含已分配但尚未领用的数量，因此供需比较不从可用库存再次扣除分配预留。基础物料跨版本合计只用于库存总览，不替代此预警的版本明细。

## 3.4 入库表

---

### 8. `inbound_order`

职责：记录一次实际入库确认的主单、操作人与时间；可包含多条来源授权及多个目标批次。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | 主键 |
| `inbound_no` | `VARCHAR(100)` | 唯一入库单号 |
| `source_type` | `VARCHAR(30)` | 采购 `purchased`；成品统一 `finished_product` |
| `provider` | `VARCHAR(100) NULL` | 采购本单供应商；成品为空 |
| `work_order_id` / `production_batch_id` | `BIGINT UNSIGNED NULL` | 成品来源工单/任务，采购为空 |
| `product_id` | `BIGINT UNSIGNED NULL` | 成品身份，采购为空 |
| `status` | `VARCHAR(30)` | `pending/completed/cancelled`；实际确认同事务完成 |
| `inbound_at` / `operator_id` | `DATETIME NULL` / `BIGINT UNSIGNED NULL` | 实际确认时间与人 |
| `version` / `remark` | `INT` / `TEXT NULL` | 乐观锁版本、备注 |
| `cancel_reason` / `cancelled_by` / `cancelled_at` | `TEXT NULL` / `BIGINT UNSIGNED NULL` / `DATETIME NULL` | 历史取消信息 |
| `created_by/at`、`updated_by/at` | 业务审计类型 | 创建、更新人与时间 |

`inbound_no` 唯一；`(id,source_type)` 与 `(id,product_id)` 支持同源明细引用；`(production_batch_id,work_order_id)` 组合外键校验任务属于工单；工单、操作人及审计用户保留外键。来源 CHECK 要求 `finished_product` 主单的产品、任务、工单非空且供应商为空，其他来源的产品为空。状态、版本仍受原 CHECK。成品不保存 `output_revision_id` 或类别唯一槽位：实际批准版由各明细授权追溯。完成触发器要求每条成品明细均有匹配正流水、批次、授权、身份、数量和单位；确认后来源不可改写。

---

### 9. `inbound_detail`

职责：保存每条实际入库的授权来源、目标批次、精确身份和数量。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` / `inbound_id` | `BIGINT UNSIGNED` | 主键与入库主单 FK |
| `item_id` / `material_variant_id` | `BIGINT UNSIGNED NULL` | 物料精确版本身份；成品为空 |
| `product_id` | `BIGINT UNSIGNED NULL` | 成品身份；物料为空 |
| `production_output_allocation_id` | `BIGINT UNSIGNED NULL` | 成品正式授权；物料为空 |
| `batch_id` | `BIGINT UNSIGNED NOT NULL` | 本条实际选择或创建的库存批次 |
| `procurement_receipt_line_id` / `procurement_receipt_revision_id` | `BIGINT UNSIGNED NULL` | 采购到货及本次采用实收修订 |
| `procurement_inspection_id` / `procurement_allocation_id` | `BIGINT UNSIGNED NULL` | 采购检验和正式授权 |
| `item_code_snapshot` | `VARCHAR(100)` | 本次入库编码快照 |
| `inbound_number` | `INT` | 本条正整数数量，单笔上限 `99999999` |
| `unit_snapshot` | `VARCHAR(20)` | 本次单位快照 |
| `stock_status` | `VARCHAR(20)` | 库存状态，实际成品及采购为 `available` |
| `source_stage` / `remark` | `VARCHAR(100) NULL` / `TEXT NULL` | 可选阶段和备注 |
| `created_by` / `created_at` | `BIGINT UNSIGNED NULL` / `DATETIME` | 创建审计 |

身份 CHECK 要求物料 `item_id/material_variant_id` 成组、成品 `product_id/production_output_allocation_id` 成组且互斥；采购四个来源列成组。外键包括主单、物料、精确版本、批次物料/版本/成品组合、采购到货/修订/检验/正式分配、成品正式授权；成品主单 `(inbound_id,product_id)` 同源校验。`(id,product_id,batch_id)` 供成品流水 FK；`(inbound_id,product_id)` 是非唯一支撑索引，同单允许多条成品明细；`(procurement_allocation_id,id)`、`(production_output_allocation_id,id)` 支持一授权多次执行。数量及库存状态保留 CHECK。

每条成品明细有一个 `production_inbound` 正流水；采购明细有匹配 `purchase_inbound` 正流水。成品插入/流水/主单完成守卫核对授权、任务、批次身份、单位、数量和状态；成品明细不可修改或删除。`requested_batch_code` 已删除，批号由 `item_batch.batch_code` 展示。采购更正、成品复检和批准版更替不会重挂历史明细或已入流水。

---

## 成品身份与范围

`item_id` 只表示 `materials.id`；成品采用独立的 `product_id -> products.id`，不建立第二套库存账本。成品库存流水目前只允许正数 `production_inbound`、`available`、`inbound_detail` 引用；不参加物料预留、领退料或盘点。物料查询明确限制 `product_id IS NULL`。成品名称从已完成入库来源工单的冻结产品名称读取，物料名称继续从当前基础物料主数据读取。
