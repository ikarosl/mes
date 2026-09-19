# 库存批次、库存流水与入库

> [返回 Production 数据库设计](README.md)。

本章所有入库数量与库存流水数量均为整数；库存流水可正可负但不能为 `0`，入库数量最小为 `1`。所有持久化数量除原有值域约束外还必须满足整数 `CHECK`，不得舍入或截断小数后保存。

当前执行范围为物料精确版本的外购入库与已批准产出清单的成品入库。成品通过显式 `product_id` 分支进入同一库存批次、明细、流水及批次余额，不将成品 ID 写入 `item_id`。成品字段、约束与事务详见[成品入库](finished-goods-inbound.md)；其他未开放来源和交易代码仍只是边界。

物料的基础 `item_id` 与精确 `material_variant_id` 必须成对传播：`item_batch` 保存版本 ID 和版本
编码快照；入库、出库、退料、报废、盘点明细及 `inventory_transaction` 均保存同一版本 ID，并以组合
外键校验它与 `item_id`、库存批次、需求/分配的一致性。当前实现中，版本停用只阻止新的选择，不使已经形成的历史
需求、库存批次或库存流水失效。库存汇总既可按基础物料聚合，也必须支持按精确版本对账。

后续采购目标见 [ADR-0013](../../../../../../../docs/adr/0013-procurement-source-and-stock-boundaries.md)，尚未实施：物料精确版本停用不阻止新采购、补购、到货、检验及合格入库，但应阻止该版本确认生产领料出库。当前新建外购入库仍要求启用版本，已有入库单确认不重新校验版本状态，确认出库尚无版本停用门禁；后续统一适配资格能力及出库校验。本轮不修改生产选版、基础物料或分类停用及软删除规则，库存批次 `frozen/disabled` 仍按本章独立规则处理，不因版本可采购而放宽。

### 物料身份字段与版本余额投影

`item_batch`、需求、分配和物流事实中的 `item_id` 保留现有列名，但统一指向 `materials.id`，不再表示成品。Product BOM/物料版本、`production_material_requirement_basis` 和 `inventory_material_variant_balance` 中的基础物料字段统一命名为 `material_id`。

`inventory_material_variant_balance` 是从库存流水重建的精确版本余额投影，字段为 `material_variant_id`、`material_id`、`stock_status`、`batch_status`、`current_quantity`、`version`、`updated_at`。主键为 `(material_variant_id, stock_status, batch_status)`；组合外键 `(material_variant_id, material_id) -> material_variants(id, material_id)`；数量是非负整数。流水插入/清理与批次状态变更触发器同步维护投影，业务接口不能直接覆盖余额。拆表迁移同时重建受字段重命名影响的组合外键和触发器，库存事实仍只有 `inventory_transaction`。

## 3.3 库存批次与库存流水表

---

### 6. `item_batch`

职责：维护物料精确版本或明确成品身份的库存批次。物料分支保持本章组合外键，成品分支使用 `product_id` 并强制来源工单及任务；分类为半成品的外购物料仍属于 `materials`。

| 字段                         | 类型              | 说明                                    |
| ---------------------------- | ----------------- | --------------------------------------- |
| `id`                         | `BIGINT UNSIGNED` | 主键，库存批次 ID                       |
| `item_id`                    | `BIGINT UNSIGNED` | 库存对象 ID，关联 `materials.id`         |
| `material_variant_id`        | `BIGINT UNSIGNED` | 物料精确版本 ID                         |
| `item_code_snapshot`         | `VARCHAR(100)`    | 建批时库存对象编码快照                  |
| `material_variant_code_snapshot` | `VARCHAR(180)` | 建批时物料版本编码快照                  |
| `unit_snapshot`              | `VARCHAR(20)`     | 建批时基础单位快照                      |
| `batch_code`                 | `VARCHAR(100)`    | 内部库存批次号，与批次主键 `id` 分开     |
| `source_type`                | `VARCHAR(30)`     | 来源类型，使用统一英文代码              |
| `provider`                   | `VARCHAR(100)`    | 供应商或委外方，自产时可为空            |
| `source_work_order_id`       | `BIGINT UNSIGNED` | 来源工单 ID，自产或委外时可填           |
| `source_production_batch_id` | `BIGINT UNSIGNED` | 来源生产批次 ID，自产半成品或成品时可填 |
| `production_date`            | `DATE`            | 生产日期或批次日期                      |
| `batch_status`               | `VARCHAR(20)`     | 批次业务状态，默认 `available`          |
| `remark`                     | `TEXT`            | 备注                                    |
| `version`                    | `INT`             | 乐观锁版本号，默认 `0`                  |
| 业务审计字段                 | 见统一规则        | 可变业务单据审计字段                    |

状态场景说明：
   **即使物料在入库前由人工剔除 不可用类型后，后期仓库也会产生，物料报废这样的情况**
可能的业务场景：同一供应商批次入库 100 个物料，检查发现：

| 数量 | 库存状态 |
|---|---|
| 80 个 | 可用 |
| 15 个 | 待检 |
| 5 个 | 不良 |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (item_id) REFERENCES materials(id)`
- 外键：`FOREIGN KEY (source_work_order_id) REFERENCES work_orders(id)`
- 组合外键 `fk_item_batch_source_production`：`FOREIGN KEY (source_production_batch_id, source_work_order_id) REFERENCES production_batches(id, work_order_id)`；不存在独立的 `source_production_batch_id -> production_batches(id)` 单列外键。
- 唯一约束：`UNIQUE (material_variant_id, batch_code)`
- 唯一约束：`UNIQUE (id, item_id, material_variant_id)`
- 外键：`FOREIGN KEY (material_variant_id, item_id) REFERENCES material_variants(id, material_id)`
- 检查约束：`CHECK (source_type IN ('self_made', 'production_extra', 'purchased', 'outsourced', 'return_inbound', 'stock_check_generated', 'other'))`
- 检查约束：`CHECK (batch_status IN ('available', 'frozen', 'disabled'))`
- 组合索引：`INDEX (item_id, batch_status)`，用于按库存对象查询可用批次

说明：

- `item_batch` 是统一库存批次表。真实关联链为 `inbound_detail.batch_id -> item_batch.id`，展示批号读取该批次的 `item_batch.batch_code`；入库明细不另存一份内部批号。
- `item_id` 只指向 `materials.id`，不得写入成品 ID。成品使用独立 `product_id` 分支，并以 CHECK 与组合 FK 保证归属；物料分支不允许将 `material_variant_id` 置空。
- `batch_status` 只表示批次是否允许参与库存业务，不表示批次是否已经入库或库存是否用完：
  - `available`：允许参与库存分配和出库，但仍须存在正数可用库存。
  - `frozen`：临时冻结，不允许新增库存分配和出库；历史库存及流水继续保留。
  - `disabled`：批次已停用，不允许继续参与库存业务；历史库存及流水继续保留。
- 库存是否存在、是否用完应通过 `inventory_transaction` 按批次和库存状态汇总判断，不得仅凭 `batch_status='available'` 判断。
- `GET /production/material-demands/:demandId/available-item-batches` 必须同时满足批次状态为 `available`，且 `available` 库存流水聚合数量大于 `0`；没有流水、聚合为 `0` 或负数的批次不得返回。
- 当前外购入库由人员填写 `batchCode`，创建待确认入库单时按物料、精确版本及批号创建或复用 `item_batch`，将批次 ID 写入 `inbound_detail.batch_id`；确认入库后才写入库存流水。取消待确认入库单不写库存流水，也不联动修改批次状态。下述采购目标尚未替换这一现行行为。
- 现行流程示例：入库单 A 使用内部批号 `B001`，在待确认阶段创建批次记录，随后 A 被取消，因此该批次没有库存流水。之后入库单 B 仍可能使用同一物料版本的内部批号 `B001`，并复用该批次记录完成真实入库。如果取消 A 时把批次改成 `disabled`，就会导致 B 后续形成的真实库存也无法使用。因此单据取消与批次停用必须分别处理。
- `frozen`、`disabled` 应由独立的批次管理操作触发，不由入库单取消、库存归零等事件自动触发。
- `source_production_batch_id` 对外购为空，对成品生产流转／额外入库必填，并与工单及成品组合外键校验。
- 两个来源 ID 均可为 `NULL`。组合外键仅在两列均非空时校验生产批次存在且属于该工单；任一列为 `NULL` 时不执行该组合引用校验。`source_work_order_id` 非空时仍受其单列工单外键约束，但仅填写 `source_production_batch_id`、工单为空时，不能依靠现有外键保证该生产批次存在。
- 编码和单位快照用于历史批次身份；基础物料名称按 `item_id` 读取当前 `materials.material_name`，改名后历史批次展示和名称搜索同步变化。
- 不建议将 `production_batches.id` 直接作为库存流水的 `batch_id`。

示例：

| batch_id | item_id | 类型       | source_type | source_production_batch_id |
| -------- | ------- | ---------- | ----------- | -------------------------- |
| ib1      | pi2     | 物料批次   | purchased   | NULL                       |
| ib6      | mi3     | 外购半成品物料批次 | purchased   | NULL                       |

#### 采购分次入库与内部批号：已确认目标，尚未实施

后续采购支持同一到货明细分次入库，规则见[采购与外购物料入库质检设计](../../../../../../../docs/procurement-inbound-design.md)。首次实际确认入库时，系统为该到货明细生成内部批号，仍写入现有 `item_batch.batch_code`，并固定绑定现有 `item_batch.id`；后续各次入库通过现有 `inbound_detail.batch_id` 复用该批次。到货实收修订或质检复检不改变同一实物的库存批次身份，不新增重复的内部批号字段或第二套库存批次表。

供应商来料批号另作到货追溯字段保存，不充当内部批次主键或强制合批依据。不同真实到货明细分别绑定内部批次；同一明细分次入库的次数不决定批次数量。每次入库默认带出当前批准剩余量，仓管可调小；确认时重新核对有效放行依据及剩余数量，库存仍只由本次确认的正流水形成。后续自动编号规则、到货与批次绑定约束及来源关联在阶段 2 定稿，这些目标不改变现有成品按批准类别一次确认的规则。

---

### 7. `inventory_transaction`

职责：维护唯一库存流水。物料使用 item_id + material_variant_id；成品使用 product_id，绑定同身份库存批次和成品入库明细。当前成品只允许正数 available 的 production_inbound；销售出库、已入成品报废或冲销尚未开放。

库存现存量、可分配库存、批次是否用完等结果应从该表按库存对象、批次和库存状态汇总得出，而不是写回批次表。

| 字段                         | 类型              | 说明                                                 |
| ---------------------------- | ----------------- | ---------------------------------------------------- |
| `id`                         | `BIGINT UNSIGNED` | 主键                                                 |
| `item_id`                    | `BIGINT UNSIGNED` | 库存对象 ID，关联 `materials.id`                      |
| `material_variant_id`         | `BIGINT UNSIGNED` | 精确物料版本 ID，与批次和基础物料一致                 |
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
- 单个 `item_batch` 已绑定且只能绑定一个 `material_variant_id`，因此 `inventory_batch_balance` 不重复保存版本字段；查询批次版本时通过 `item_batch` 取得。
- 版本级余额只用于库存展示、候选版本选择和校验，不改变“BOM 只绑定基础物料、具体版本由管理员选定”的业务断论。

### 7.4 余额投影维护规则

当前仅保留 `inventory_batch_balance` 和 `inventory_material_variant_balance` 两张余额投影，均归 Production 所有，只是 `inventory_transaction` 的可重建查询结果，不属于 Product 主数据，也不构成新的库存事实来源。其他模块不得直接写入或把它们当作跨模块主数据接口。

两张表的 `current_quantity` 使用 `BIGINT`，不接受小数。单笔业务数量仍受 `1..99999999` 限制，但累计余额允许超过单笔上限。维护规则如下：

1. 插入库存流水时，同事务更新 `inventory_batch_balance`；物料分支另更新 `inventory_material_variant_balance`，成品分支不生成虚构物料版本桶。
   精确版本余额投影先以数量 `0` 确保目标桶存在，再用流水正负数量更新余额；这样负数出库流水只在最终余额不足时被防负数约束拒绝。
2. `item_batch.batch_status` 变化时，批次余额不变；仅物料分支搬移精确版本余额，成品按批次余额及批次状态直接查询。
3. 余额变为 `0` 的空投影行可以删除；查询端必须把不存在的组合解释为数量 `0`。
4. `AFTER DELETE` 触发器只服务于 `_test/_ci` 测试库受控清理；生产库存流水禁止删除。
5. 迁移首次建立投影前先检查历史流水聚合不得为负，再从全部流水分别按以下维度回填：
   - 批次余额：`batch_id + item_id + stock_status`；
   - 精确版本余额：`material_variant_id + material_id + stock_status + batch_status`。

对账时分别将流水按上述两个维度汇总，与对应余额逐项比较（包括缺行和多余行，缺行按零处理）；基础物料合计通过版本余额分组后与流水按物料、库存状态及批次状态的汇总比较，不依赖独立物料余额表。

库存流水仍是唯一库存事实来源。余额投影没有独立业务写入口，必须可以通过流水按批次、物料和状态重新汇总，并通过对账发现漂移。查询当前库存和物料供需预警优先读取余额投影；业务纠错仍只能追加反向库存流水，禁止直接修改余额伪造库存变化。

---

### 7.5 库存查询与可分配量

当前库存查询由 Production Repository 执行 SQL，不建立独立数据库视图。所有汇总和加减遵守整数数量规则；库存用完不自动改写 `item_batch.batch_status`。

- 库存批次列表和详情由 [MysqlProductionInboundRepository](../../infrastructure/mysql-production-inbound.repository.ts) 的 `loadInventories` 读取 `inventory_batch_balance` 中 `stock_status = available` 的余额，缺行按 `0` 处理；库存流水详情仍读取 `inventory_transaction`。
- 初始物料需求配置与人工追加候选由 [MysqlProductionMaterialDemandConfigurationRepository](../../infrastructure/mysql-production-material-demand-configuration.repository.ts) 只读取启用的物料版本，不查询或展示库存；库存余额投影未扣除分配预留，因此不得用于该需求配置窗口的库存提示。
- 分配候选由 [MysqlProductionMaterialRepository](../../infrastructure/mysql-production-material.repository.ts) 的 `listAvailableItemBatches` 按活动需求的 `item_id + material_variant_id` 匹配库存批次，只返回批次状态为 `available` 且账面可用量大于 `0` 的批次；该入口从 `inventory_transaction` 汇总可用状态余额。

库存批次查询与分配候选使用相同的预留口径：

```text
单条分配的未出库占用 = max(assigned_number - 已确认出库量, 0)
批次预留量 = sum(未 released/cancelled 的分配行的未出库占用)
可继续分配量 = max(账面可用库存 - 批次预留量, 0)
```

已确认出库量只统计主单 `outbound_order.status = completed` 的明细。待出库单尚未减少账面库存，其对应数量仍在分配预留内，不能再次扣除。`frozen/abnormal` 分配仍保留占用；释放或取消分配才移除相应预留。当前确认退料固定回到公共可用库存，增加库存流水余额，不重新增加原分配的可出库量，不创建或恢复需求。需求履约展示与分配门禁均不扣除退料量；净领用量只服务领退追溯，不参与短批授权或开工判断，不能用作现场实存量或新需求。

候选可能显示可继续分配量为 `0` 的正库存批次；返回候选不代表写入资格。分配写事务须锁定需求和库存批次，重新校验批次状态、精确版本、需求缺口及流水余额扣除预留后的数量。

精确版本物料库存及供需信息由 [MysqlProductionSupplyDemandRepository](../../infrastructure/mysql-production-supply-demand.repository.ts) 的 `list` 计算：按 `item_id + material_variant_id` 汇总全部 `active.remaining_number`，与 `inventory_material_variant_balance` 中同物料、同版本的余额匹配，缺行按 `0` 处理。总库存包含该版本全部状态，可用库存只包含库存状态和批次状态均为 `available` 的余额；其他状态库存为总库存减可用库存。缺口为 `max(该版本活动需求剩余量 - 该版本可用库存, 0)`，不同版本不得合并抵扣。

`GET /production/inventory-material-supply-demand` 每行对应一个有正库存（含其他状态库存）或活动需求的精确版本，`total` 和分页均按版本计数；返回必填 `materialVariantId/materialVariantCode`，编码和单位优先取同版本 ID 最大的活动需求快照，无活动需求时取同版本 ID 最大的库存批次快照；名称按基础物料 ID 读取当前主数据。无需求版本的未完成需求与缺口均为 `0`。先按是否有未完成需求降序，再按缺口降序、物料编码、物料 ID、版本 ID 稳定排序。关键词匹配展示的物料编码、名称或版本编码，也匹配同版本任一活动需求的编码和版本编码快照；搜索不改变该版本完整的库存与需求汇总。无库存且无活动需求的版本不展示，零余额行是否已清理不影响候选集合。

点击版本行后，`GET /production/inventory-material-supply-demand/:itemId/demands` 必须携带 `materialVariantId` 查询参数。缺失或格式不合法由 DTO 拒绝；查询同时限定基础物料、精确版本和活动状态，返回需求的版本 ID 与编码快照，分页只计算该版本的需求。物料与版本不匹配时返回空列表，不退回物料级查询。

活动需求包含已分配但尚未领用的数量，因此供需比较不从可用库存再次扣除分配预留。基础物料跨版本合计只用于库存总览，不替代此预警的版本明细。

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
- 组合外键 `fk_inbound_order_batch_work_order`：`FOREIGN KEY (production_batch_id, work_order_id) REFERENCES production_batches(id, work_order_id)`；不存在独立的 `production_batch_id -> production_batches(id)` 单列外键。
- 外键：`FOREIGN KEY (operator_id) REFERENCES users(id)`
- 外键：`FOREIGN KEY (cancelled_by) REFERENCES users(id)`
- 检查约束：`CHECK (source_type IN ('self_made', 'production_extra', 'purchased', 'outsourced', 'return_inbound', 'stock_check_generated', 'other'))`
- 检查约束：`CHECK (status IN ('pending', 'completed', 'cancelled'))`
- 组合索引：`INDEX (status, created_at)`，用于入库单状态分页

说明：

- 入库主单表达“这一次入库动作”。
- 具体入库了哪些对象、哪些批次、多少数量，由 `inbound_detail` 记录。
- 外购命令仅接受 `purchased` 物料精确版本。成品独立命令接受 `self_made/production_extra` 并要求批准清单，复用本表；不接其他自产半成品场景。
- 成品主单必须填写 product_id、output_revision_id、production_batch_id、work_order_id，保证与批准版本同源。
- `production_batch_id` 与 `work_order_id` 均可为 `NULL`。组合外键仅在两列均非空时校验生产批次及其所属工单；任一列为 `NULL` 时不执行该组合引用校验。`work_order_id` 非空时仍须满足其单列工单外键，但仅填写 `production_batch_id`、工单为空时，不能依靠现有外键保证该生产批次存在。
- 外购入库时，`provider` 建议填写，`production_batch_id` 为空。
- 待确认入库单取消必须填写原因；取消事实与状态、成功操作日志在同一事务中提交，不覆盖制单备注。

---

### 9. `inbound_detail`

职责：维护入库明细，记录本次入库的具体库存对象、库存批次、入库数量和库存状态。

| 字段             | 类型              | 说明                                 |
| ---------------- | ----------------- | ------------------------------------ |
| `id`             | `BIGINT UNSIGNED` | 主键                                 |
| `inbound_id`     | `BIGINT UNSIGNED` | 入库主单 ID，关联 `inbound_order.id` |
| `item_id`        | `BIGINT UNSIGNED` | 入库对象 ID，关联 `materials.id`      |
| `material_variant_id` | `BIGINT UNSIGNED` | 入库选择的精确物料版本 ID             |
| `batch_id`       | `BIGINT UNSIGNED` | 入库批次 ID，关联 `item_batch.id`    |
| `item_code_snapshot` | `VARCHAR(100)` | 非空，本次入库制单时的基础物料编码快照 |
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
- 外键：`FOREIGN KEY (item_id) REFERENCES materials(id)`
- 外键：`FOREIGN KEY (batch_id, item_id) REFERENCES item_batch(id, item_id)`
- 外键：`FOREIGN KEY (material_variant_id, item_id) REFERENCES material_variants(id, material_id)`
- 外键：`FOREIGN KEY (batch_id, item_id, material_variant_id) REFERENCES item_batch(id, item_id, material_variant_id)`
- 检查约束：`CHECK (inbound_number > 0)`
- 检查约束：`CHECK (stock_status IN ('available', 'pending_inspection', 'frozen', 'defective'))`
- 唯一约束：`UNIQUE (inbound_id, batch_id, item_id)`

说明：

- `inbound_detail` 保存单据明细；库存只在确认时由流水形成。成品 pending 明细的 batch_id 可空，requested_batch_code 保存草稿批号，确认事务才创建批次；已确认成品明细不可改。
- 编码在创建入库单时从 Product 公共能力写入本明细，历史详情保留本次编码快照。名称不持久化，按明细 `item_id` 读取当前物料名称，展示、搜索使用同一口径。即使复用已有库存批次，本次明细仍保留本次编码；批次保留建批时编码和精确版本。
- 每条入库明细应生成一条或多条 `inventory_transaction`。
- 生产入库、采购入库、委外入库都可以走该表。
- 入库数量不建议写回 `item_batch`，应通过库存流水汇总。

#### 后续采购来源及实收更正的接入边界

现有 `batch_id` 足以记录每次入库使用哪个库存批次，同一批次可出现在不同入库单。当前库存批次查询已按已完成入库明细及对应正库存流水展示各次入库来源；采购接入后继续复用这条链路，另补到货明细、实收修订及质检放行范围的来源引用。历史累计已入量须跨该到货明细的全部历史修订汇总，不能仅查询当前质检版本，也不能以领料后的当前库存余额代替。

已确认的后续实收更正仅处理同一原到货、同一物料精确版本及实际来料批次的数量录错：保留修订历史，由质检复核受影响的未处置范围后更新有效依据。已有实际入库或退回时，只能更正剩余范围，已入／已退事实及当时引用保持不变；至少满足更正后实收量不小于累计已入加已退量，并核对实际实物及检验覆盖。正式提交更正后，受影响的未处置范围暂停入库和退回；旧草稿重新核对，不能自动扩大批准量或覆盖旧检验。采购已关闭时仍可办理这种更正，保留关闭依据且不重开普通新到货入口。更正后继续入库复用原 `batch_id`，不撤销已入流水或借更正重建已有库存。

上述来源关联及更正流程尚未实施，属于阶段 2 待落定的数据和事务设计。当前物料分支的 CHECK 仍要求待确认入库明细具有非空 `batch_id`，首次实际确认才建批需同步适配该约束；当前 `UNIQUE (inbound_id, batch_id, item_id)` 及同单重复批次校验也需结合质检来源粒度评审。复用现有字段不表示无需新增来源引用或调整约束；届时追加 migration，不修改已执行迁移，不引入双写或影子批次表。

---

### 成品分支与物料业务隔离

`item_batch`、`inbound_detail`、`inventory_transaction` 的 `item_id/material_variant_id` 在结构上可空，但物料分支 CHECK 强制两者非空且 `product_id` 为空；成品分支则相反。物料的原单列／组合 FK 均保留。`inventory_batch_balance` 不复制版本 ID，只在 item_id/product_id 中选一个身份，均通过批次组合 FK 校验。产品不会进入物料分配、精确版本供需、物料退料或现有盘点候选。

库存批次查询使用 `itemKind`、`sourceType` 筛选，成品显示来源任务／工单及实际采用的批准清单版本；成品名称取所属工单快照，物料名称仍按稳定物料 ID 读当前名称。预留和可分配只对物料有业务含义，成品不可通过此页面分配。明细与余额不会以 `String(null)` 伪造物料或版本身份。
