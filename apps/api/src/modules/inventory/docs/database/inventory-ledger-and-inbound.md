# 库存批次、库存流水与出入库

> [返回 Inventory 数据库设计](../database.md)。公共出入库四表、批次、流水和余额投影由 Inventory 唯一所有；生产预留、需求与来源资格仍归 Production，采购来源和质量结论归各自模块。

本章维护公共六场景及完整字段；已批准设计的实施验证、人工验收与正式测试状态由[路线图](../../../../../../../docs/roadmap.md)维护，代码接入不表示用户验收通过。公共身份、审计和数量规则遵守[数据库约定](../../../../../../../docs/database-conventions.md)。

未写 DEFAULT 的必填列由服务端提供，可空列默认 NULL；时间为北京时间 DATETIME，ID 为 BIGINT UNSIGNED，六表使用 InnoDB、utf8mb4、utf8mb4_0900_ai_ci，`new_batch_key` 单独使用 utf8mb4_bin。操作者列均外键引用 users(id)。主单 `version` 控制整单编辑，明细没有第二份版本。

单条入出库数量为 INT、`1..99999999`，流水数量可正可负、非零且绝对值同上；余额投影使用 BIGINT 承接累计。DTO 拒绝小数，不能依赖 INT 隐式转换后再用 CHECK 修正。非空原因、单位和编码快照同时拒绝纯空白。

### 六场景来源

| 场景 | 公共来源代码 | 状态与入口 | 必须的业务来源 | 原始流水 |
| --- | --- | --- | --- | --- |
| 采购入库 | 入库 purchased | 来源确认一次成单，无仓库编辑草稿 | 明细到货行／实收修订／检验／正式分配及供应商名称快照 | purchase_inbound 正数 |
| 批准成品入库 | 入库 finished_product | 批准授权后来源确认一次成单 | 主单任务／工单／产品，明细产出授权 | production_inbound 正数 |
| 生产退料 | 入库 return_inbound | pending → completed/cancelled，不编辑 | 主单任务／工单，明细原任务／需求／return_allocation_id | material_return_inbound 正数 |
| 其他入库 | 入库 other | 可编辑 pending 草稿，整单确认／取消 | 无业务来源，办理原因必填 | other_inbound 正数 |
| 生产领料 | 出库 production_material | pending_picking → completed/cancelled，不编辑 | 主单任务／工单，明细原任务／需求／allocation_id | production_material_outbound 负数 |
| 其他出库 | 出库 other | 可编辑 pending_picking 草稿，整单确认／取消 | 无业务来源，办理原因必填 | other_outbound 负数 |

一单一种场景。采购仍可跨供应商合单；领退料一单一个任务，批准成品一单一个任务／产品；其他单可混合多个物料精确版本或成品，每行一个库存对象和目标批次。人工其他单只修正库存，不生成生产、采购、质量或审批事实，不改变原业务履约；数量／批次补差通过新单，后一单备注记录前一单号，不建立配对表或成对提交。

物料身份严格为 `item_id/material_variant_id` 非空且 `product_id` 为空；成品严格反之。来源组按上表互斥：采购只允许采购四 ID 和供应商快照；批准成品只允许产出授权；退料只允许原需求／分配组；其他来源列全空。生产领料只允许原需求／分配组；其他出库任务、工单及生产来源组全空。场景由父子组合 FK 绑定，不允许客户端独立改变行场景。

### 物料身份字段与版本余额投影

库存与业务事实中的 `item_id` 指 materials.id；Product BOM、需求基础和精确版本余额的基础物料列使用 `material_id`。物料精确版本随批次、明细、流水和原分配组合外键传播，停用或软删除不抹除历史身份。

采购允许历史停用精确版本，生产新分配、制单和确认仍按 Product 生产用途门禁；其他已有批次按历史精确身份和单位办理，可修正停用或删除身份的存量账务。其他新批次只允许未删除且启用的物料／分类／精确版本或成品。不同用途能力不互相授予写资格，批次 `frozen/disabled` 是独立状态。

## 3.3 库存批次与库存流水表

### 6. `item_batch`

库存目标批次保留物料／成品互斥身份、服务端 IB 批号及单位。来源集合来自实际入库明细，库批不决定供应商、任务或计划内外类别。其他成品单据场景是 other，库批类别仍为 finished_product，两者不使用同一个来源枚举。

| 字段 | SQL定义 | 用途 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `item_id` | `BIGINT UNSIGNED NULL` | 物料身份 |
| `material_variant_id` | `BIGINT UNSIGNED NULL` | 精确物料版本 |
| `product_id` | `BIGINT UNSIGNED NULL` | 成品身份 |
| `item_code_snapshot` | `VARCHAR(100) NOT NULL` | 建批时编码 |
| `material_variant_code_snapshot` | `VARCHAR(180) NULL` | 物料版本编码，成品为空 |
| `unit_snapshot` | `VARCHAR(20) NOT NULL` | 建批单位 |
| `batch_code` | `VARCHAR(100) NOT NULL` | 全局唯一服务端IB编号 |
| `source_type` | `VARCHAR(30) NOT NULL` | 物料新批为purchased/other，成品恒finished_product；既有代码保留 |
| `provider` | `VARCHAR(100) NULL` | 保留采购建批来源描述；其他新批为空，不代表唯一供应商 |
| `source_work_order_id` | `BIGINT UNSIGNED NULL` | 保留现有列；本期新建路径为空 |
| `source_production_batch_id` | `BIGINT UNSIGNED NULL` | 保留现有列；本期新建路径为空 |
| `production_date` | `DATE NULL` | 保留现有列；本期不开放填写 |
| `batch_status` | `VARCHAR(20) NOT NULL DEFAULT 'available'` | available / frozen / disabled |
| `remark` | `TEXT NULL` | 批次备注；其他新批为空，不复制单据原因 |
| `version` | `INT NOT NULL DEFAULT 0` | 既有批次状态并发控制 |
| `created_by` | `BIGINT UNSIGNED NULL` | 保留列可空性，所有新业务必须提供 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_by` | `BIGINT UNSIGNED NULL` | 保留列可空性，所有新业务必须提供 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 更新时间 |

主键 id；唯一键 `(batch_code)`、`(material_variant_id,batch_code)`、`(product_id,batch_code)`、`(id,item_id)`、`(id,item_id,material_variant_id)`、`(id,product_id)`。查询索引为 `(item_id,batch_status)`、`(product_id,batch_status)`、`(source_production_batch_id,product_id)`，并保留外键支撑索引。身份、批号、单位及建批来源不可回改；状态变更不覆盖数量。

外键保护 materials、`(material_variant_id,item_id) → material_variants(id,material_id)`、products，以及历史 `source_work_order_id`、`(source_production_batch_id,source_work_order_id)` 和 `(source_production_batch_id,product_id)`。身份 XOR、状态和库批来源代码由 CHECK 保护；已有八项库批来源代码不自动开放未批准场景。

新批只在确认事务真实插入时取得 IB。其他物料新批 source_type=other，其他成品新批 source_type=finished_product；provider、来源工单／任务、production_date、remark 全空，创建／修改人必须提供。本期不开放人工内部批号、生产日期或预建空批次。已有同身份同单位 available 批次可以再次入库，包括零余额批次，不取新 IB，也不重写建批事实。历史生产退料可沿原冻结或停用批次回仓，但不解除状态。

### 7. `inventory_transaction`

唯一库存数量事实，所有余额、可分配量和批次余量均由追加流水及可重建投影得出，不直接写回批次数量。来源只有 `reference_type/reference_detail_id` 可写；三个生成指针只服务有类型外键，应用不得赋值，也不形成第二份来源。

| 字段 | SQL定义 | 用途 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `item_id` | `BIGINT UNSIGNED NULL` | 物料身份 |
| `material_variant_id` | `BIGINT UNSIGNED NULL` | 物料精确版本，与item_id成组 |
| `product_id` | `BIGINT UNSIGNED NULL` | 成品身份，与物料互斥 |
| `batch_id` | `BIGINT UNSIGNED NOT NULL` | 真实库存批次 |
| `transaction_type` | `VARCHAR(30) NOT NULL` | 既有交易代码加other_inbound / other_outbound |
| `quantity` | `INT NOT NULL` | 正负变动，绝对值1..99999999 |
| `unit_snapshot` | `VARCHAR(20) NOT NULL` | 与实际明细／批次一致 |
| `stock_status` | `VARCHAR(20) NOT NULL DEFAULT 'available'` | 沿用四类库存状态，六场景仅available |
| `reference_type` | `VARCHAR(50) NOT NULL` | 六场景inbound_detail/outbound_detail，盘点stock_check_detail |
| `reference_detail_id` | `BIGINT UNSIGNED NOT NULL` | 来源明细ID，不使用主单ID |
| `idempotency_key` | `VARCHAR(150) NOT NULL` | 服务端稳定生成，唯一 |
| `transaction_group_key` | `VARCHAR(150) NULL` | 沿用分组语义，不作为两张人工补差单配对号 |
| `reversal_of_transaction_id` | `BIGINT UNSIGNED NULL` | 基础全额冲销引用；本次不新增通用撤销入口 |
| `remark` | `TEXT NULL` | 事实备注 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 确认操作者 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 记账时间 |
| `inbound_detail_ref` | `BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN reference_type='inbound_detail' THEN reference_detail_id ELSE NULL END) STORED` | 只读生成来源指针，供有类型外键使用；应用不可赋值 |
| `outbound_detail_ref` | `BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN reference_type='outbound_detail' THEN reference_detail_id ELSE NULL END) STORED` | 只读生成来源指针，供有类型外键使用；应用不可赋值 |
| `stock_check_detail_ref` | `BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN reference_type='stock_check_detail' THEN reference_detail_id ELSE NULL END) STORED` | 只读生成来源指针，供有类型外键使用；应用不可赋值 |
| `original_posting_key` | `VARCHAR(100) GENERATED ALWAYS AS (CASE WHEN reversal_of_transaction_id IS NULL AND reference_type IN ('inbound_detail','outbound_detail','stock_check_detail') THEN CONCAT(reference_type,':',reference_detail_id) ELSE NULL END) STORED` | 原始流水唯一键；不因分组非空绕过去重；冲销为空 |

原始流水唯一键 `(original_posting_key)` 对 inbound_detail、outbound_detail、stock_check_detail 的每条来源只允许一笔原始记账；不会因 `transaction_group_key` 非空跳过去重。另保留 `(idempotency_key)`、`(reversal_of_transaction_id)` 唯一键及原流水 FK。索引为 `(reference_type,reference_detail_id,id)`、物料／成品各自的 `(身份ID,batch_id,stock_status,created_at)`、`(transaction_group_key)`、`(batch_id,stock_status,id)`。

生成来源列为 STORED：只依据普通 reference 列生成，FK 统一 RESTRICT，不级联；触发器读取 NEW.reference_type/reference_detail_id，不能读取 NEW 生成列。分别建立：

| 生成分支 | 有类型来源外键 |
| --- | --- |
| inbound_detail_ref | → inbound_detail(id)；物料 `(ref,item_id,material_variant_id,batch_id)` → 对应四列候选键；成品 `(ref,product_id,batch_id)` → 对应三列候选键 |
| outbound_detail_ref | → outbound_detail(id)；物料、成品分别使用上述身份组合候选键 |
| stock_check_detail_ref | → stock_check_detail(id)；物料 `(ref,item_id,material_variant_id,batch_id)` → 对应四列候选键；盘点没有成品分支 |

流水同时建立物料、精确版本、成品及物料／成品批次组合 FK。身份 XOR 和交易类型范围使实际 FK 分支的列全部非空，不能用 NULL 绕过来源校验。旧将所有成品 reference 固定指向 inbound_detail 的 FK 由上述分支替代。六场景只记 available，每条有效明细的原始流水类型、方向、绝对数量、单位、精确身份、真实批次及未删来源必须与单据场景匹配。

交易代码完整集合为 purchase_inbound、production_inbound、outsourced_inbound、production_material_outbound、sales_outbound、material_return_inbound、scrap_outbound、stock_check_adjustment、status_transfer_in、status_transfer_out、other_inbound、other_outbound；非六场景及既有物料盘点的代码不因此开放入口。库存状态仍为 available、pending_inspection、frozen、defective；`reference_type` 保留 inbound_detail、outbound_detail、stock_check_detail、scrap、inspection_record、manual，删除 return_detail，退料改引用 inbound_detail。

流水 UPDATE/DELETE 被数据库拒绝。基础冲销保留同一原流水一次整笔全额反向事实，身份、状态、单位、交易类型和业务引用相同；不因本次结构开放撤销已确认单据、成品冲销、部分冲销或任意 manual 流水。人工补差通过新的其他单据，原业务履约和原明细保留。

测试专用 `_test/_ci` 库允许 fixture 在同一连接临时设置 `@company_inventory_test_cleanup=1` 清理自身数据，释放连接前清空；非专用库该变量无效。该例外不属于生产写入口。批次详情按时间和流水 ID 倒序展示全部正负流水、真实来源、分组及冲销引用，不只展示入库正流水。

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

库存流水仍是唯一库存事实来源。余额投影没有独立业务写入口，必须可以通过流水按批次、物料/成品身份和状态重新汇总，并通过对账发现漂移。查询当前库存和物料供需预警优先读取余额投影；库存人工补差使用新的其他出入库单，不恢复原业务履约；既有基础全额冲销结构不授予新通用撤销入口，成品当前不开放冲销；禁止直接修改余额伪造库存变化。

---

### 7.5 库存查询与可分配量

当前库存列表与明细由 Inventory Repository 执行 SQL；Production 的供需、候选及追溯展示通过已登记的只读查询组合库存字段，不建立独立数据库视图。所有汇总和加减遵守整数数量规则；库存用完不自动改写 `item_batch.batch_status`。

- 库存批次列表和详情由 [MysqlInventoryInboundRepository](../../infrastructure/mysql-inventory-inbound.repository.ts) 的 `loadInventories` 查询读取 `inventory_batch_balance` 中 `stock_status = available` 的余额，缺行按 `0` 处理；库存流水详情仍读取 `inventory_transaction`。历史账面库存保留，可分配数量还要求批次状态 `available` 且 Product 公开能力确认当前生产用途允许使用该精确版本，否则为 `0`。
- 初始物料需求配置与人工追加候选由 [MysqlProductionMaterialDemandConfigurationRepository](../../../production/infrastructure/demand/mysql-production-material-demand-configuration.repository.ts) 只读取启用的物料版本，不查询或展示库存；库存余额投影未扣除分配预留，因此不得用于该需求配置窗口的库存提示。
- 分配候选由 [MysqlProductionMaterialRepository](../../../production/infrastructure/demand/mysql-production-material.repository.ts) 的 `listAvailableItemBatches` 按活动需求的 `item_id + material_variant_id` 匹配库存批次，只返回批次状态为 `available` 且账面可用量大于 `0` 的批次；该入口按当前用途候选展示可用数量；分配锁内余额由 Inventory 在批次锁后对 `inventory_batch_balance` 做当前读，缺行视为零，避免使用事务早期快照。

库存批次查询与分配候选使用相同的预留口径：

```text
单条分配的未出库占用 = max(assigned_number - 已确认出库量, 0)
批次预留量 = sum(未 released/cancelled 的分配行的未出库占用)
可继续分配量 = max(账面可用库存 - 批次预留量, 0)
```

已确认出库量只统计 `source_type=production_material` 且主单 `completed` 的有效明细，人工其他出库不参与分配履约。待出库单尚未减少账面库存，其对应数量仍在分配预留内，不能再次扣除。`frozen/abnormal` 分配仍保留占用；释放或取消分配才移除相应预留。当前确认退料固定回到公共可用库存，增加库存流水余额，不重新增加原分配的可出库量，不创建或恢复需求。需求履约展示与分配门禁均不扣除退料量；净领用量只服务领退追溯，不参与任务开工判断，不能用作现场实存量或新需求。

候选可能显示可继续分配量为 `0` 的正库存批次；返回候选不代表写入资格。分配写事务须锁定需求和库存批次，重新校验批次状态、精确版本、需求缺口及流水余额扣除预留后的数量。

精确版本物料库存及供需信息由 [MysqlProductionSupplyDemandRepository](../../../production/infrastructure/queries/mysql-production-supply-demand.repository.ts) 的 `list` 计算：按 `item_id + material_variant_id` 汇总全部 `active.remaining_number`，与 `inventory_material_variant_balance` 中同物料、同版本的余额匹配，缺行按 `0` 处理。总库存包含该版本全部状态，停用版本的历史库存仍保留。用于生产供需比较的可用库存，除库存状态和批次状态均为 `available` 外，还须由 Product `MaterialVariantQuery.listEnabledByMaterials` 公开能力确认基础物料、分类及精确版本均启用且未删除；不直接读取 Product 状态表作为资格。未满足该用途资格时可用量为 `0`，该数量仍在总库存及不可领库存中展示。缺口为 `max(该版本活动需求剩余量 - 该版本可用库存, 0)`，不同版本不得合并抵扣。资格集合在 SQL 缺口排序和分页前批量解析，不能取出一页后清零可用量而保留错误排序；确认分配／领料仍须在各自写事务内重新校验。

`GET /production/inventory-material-supply-demand` 每行对应一个有正库存（含其他状态库存）或活动需求的精确版本，`total` 和分页均按版本计数；返回必填 `materialVariantId/materialVariantCode`，编码和单位优先取同版本 ID 最大的活动需求快照，无活动需求时取同版本 ID 最大的库存批次快照；名称按基础物料 ID 读取当前主数据。无需求版本的未完成需求与缺口均为 `0`。先按是否有未完成需求降序，再按缺口降序、物料编码、物料 ID、版本 ID 稳定排序。关键词匹配展示的物料编码、名称或版本编码，也匹配同版本任一活动需求的编码和版本编码快照；搜索不改变该版本完整的库存与需求汇总。无库存且无活动需求的版本不展示，零余额行是否已清理不影响候选集合。

点击版本行后，`GET /production/inventory-material-supply-demand/:itemId/demands` 必须携带 `materialVariantId` 查询参数。缺失或格式不合法由 DTO 拒绝；查询同时限定基础物料、精确版本和活动状态，返回需求的版本 ID 与编码快照，分页只计算该版本的需求。物料与版本不匹配时返回空列表，不退回物料级查询。

活动需求包含已分配但尚未领用的数量，因此供需比较不从可用库存再次扣除分配预留。基础物料跨版本合计只用于库存总览，不替代此预警的版本明细。

## 3.4 入库表

### 8. `inbound_order`

公共入库主单承载采购 PI、批准成品 FI、生产退料 TL、其他入库 OI。退料号也只保存在 inbound_no；主单不持有唯一供应商、总数量、通用 business_id 或复制审批状态。

| 字段 | SQL定义 | 用途 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `inbound_no` | `VARCHAR(100) NOT NULL` | 全局唯一入库号；退料TL号也在此保存 |
| `source_type` | `VARCHAR(30) NOT NULL` | purchased / finished_product / return_inbound / other，无默认场景 |
| `work_order_id` | `BIGINT UNSIGNED NULL` | 批准成品、退料所属工单，其他场景为空 |
| `production_batch_id` | `BIGINT UNSIGNED NULL` | 批准成品、退料所属任务，其他场景为空 |
| `product_id` | `BIGINT UNSIGNED NULL` | 仅批准成品主单非空；其他成品身份在行中 |
| `status` | `VARCHAR(30) NOT NULL DEFAULT 'pending'` | pending / completed / cancelled |
| `inbound_at` | `DATETIME NULL` | 系统实际确认时间，不任意回填 |
| `operator_id` | `BIGINT UNSIGNED NULL` | 确认人，未确认为空 |
| `reason` | `TEXT NULL` | 其他入库必填非空办理原因，其余场景为空 |
| `remark` | `TEXT NULL` | 单据备注；人工补差前一单号记录于此 |
| `cancel_reason` | `TEXT NULL` | 取消时非空原因 |
| `cancelled_by` | `BIGINT UNSIGNED NULL` | 取消人 |
| `cancelled_at` | `DATETIME NULL` | 取消时间 |
| `version` | `INT NOT NULL DEFAULT 0` | 非负父单乐观锁 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 创建人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_by` | `BIGINT UNSIGNED NOT NULL` | 最后修改人 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最后修改时间 |

唯一键 `(inbound_no)`、`(id,source_type)`、`(id,production_batch_id)`；查询索引 `(source_type,status,created_at,id)`、`(production_batch_id,source_type,status,id)`、`(work_order_id,id)`。外键为 work_order_id、product_id，及 `(production_batch_id,work_order_id)`、`(production_batch_id,product_id)` → 生产任务对应候选键；操作者及审计列引用 users。

finished_product 要求任务／工单／产品全非空，return_inbound 要求任务／工单非空且产品空，purchased/other 主单三者均空；仅 other 的 reason 非空非空白。批准版、类别、检验及采购供应商从各行实际授权追溯。其余生命周期和版本规则统一由下节维护。

### 9. `inbound_detail`

来源 FK 内嵌到公共实际明细，不另建退料关联主从或第二份退料数量。删除 source_stage、return_stock_status、release_after_return；公共 stock_status 固定 available。物料名称读取 Product 当前名称；批准成品显示来源工单冻结名称，其他成品通过历史展示能力读取当前名称，不伪造生产来源。

| 字段 | SQL定义 | 用途 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `inbound_id` | `BIGINT UNSIGNED NOT NULL` | 公共入库主单 |
| `line_no` | `INT NOT NULL` | 单内稳定正行号，移除后不复用 |
| `source_type` | `VARCHAR(30) NOT NULL` | 与父单组合FK一致；本行场景CHECK依据 |
| `item_id` | `BIGINT UNSIGNED NULL` | 物料身份，与成品互斥 |
| `material_variant_id` | `BIGINT UNSIGNED NULL` | 物料精确版本，与item_id成组 |
| `product_id` | `BIGINT UNSIGNED NULL` | 成品身份，物料行为空 |
| `batch_id` | `BIGINT UNSIGNED NULL` | 真实批次；新批次草稿未生成时可空 |
| `target_mode` | `VARCHAR(20) NOT NULL` | new / existing，确认后保留选择方式 |
| `new_batch_key` | `VARCHAR(100) COLLATE utf8mb4_bin NULL` | new时非空；单内同键共建批，确认后保留，不是人工批号 |
| `inbound_number` | `INT NOT NULL` | 本次入库正数量，1..99999999 |
| `unit_snapshot` | `VARCHAR(20) NOT NULL` | 来源／批次单位，服务端解析 |
| `item_code_snapshot` | `VARCHAR(100) NOT NULL` | 库存对象编码快照 |
| `stock_status` | `VARCHAR(20) NOT NULL DEFAULT 'available'` | 本期入库固定available |
| `procurement_receipt_line_id` | `BIGINT UNSIGNED NULL` | 采购到货行，仅purchased非空 |
| `procurement_receipt_revision_id` | `BIGINT UNSIGNED NULL` | 采购采用实收修订，仅purchased非空 |
| `procurement_inspection_id` | `BIGINT UNSIGNED NULL` | 采购采用检验依据，仅purchased非空 |
| `procurement_allocation_id` | `BIGINT UNSIGNED NULL` | 采购正式入库授权，仅purchased非空 |
| `supplier_name_snapshot` | `VARCHAR(100) NULL` | 采购确认时供应商名称，仅purchased非空 |
| `production_output_allocation_id` | `BIGINT UNSIGNED NULL` | 正式产出授权，仅finished_product非空 |
| `production_batch_id` | `BIGINT UNSIGNED NULL` | 仅退料行非空，与父单及原分配一致 |
| `demand_id` | `BIGINT UNSIGNED NULL` | 仅退料行非空，与原分配一致 |
| `return_allocation_id` | `BIGINT UNSIGNED NULL` | 退料原分配，其他场景为空 |
| `remark` | `TEXT NULL` | 行备注 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 创建人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_by` | `BIGINT UNSIGNED NOT NULL` | 最后修改人 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最后修改时间 |
| `is_deleted` | `TINYINT NOT NULL DEFAULT 0` | 其他草稿移除行，0/1；来源业务行恒0 |
| `deleted_by` | `BIGINT UNSIGNED NULL` | 软删除人，未删除为空 |
| `deleted_at` | `DATETIME NULL` | 软删除时间，未删除为空 |

唯一键 `(inbound_id,line_no)`、`(inbound_id,return_allocation_id)`、`(id,item_id,material_variant_id,batch_id)`、`(id,product_id,batch_id)`；查询索引 `(inbound_id,is_deleted,id)`、`(inbound_id,new_batch_key)`、`(batch_id,id)`、采购 allocation／到货行／inspection 各自与 id 的索引、`(production_output_allocation_id,id)`、`(return_allocation_id,id)`。同授权可在同单分到不同目标，不设授权唯一槽位或旧 `(inbound_id,batch_id,item_id)` 唯一键。

父单 FK 为 `(inbound_id,source_type)`、`(inbound_id,production_batch_id)`；物料、版本、产品及两类批次身份分别组合约束。退料以 `(demand_id,production_batch_id)` 和 `(return_allocation_id,demand_id,production_batch_id,item_id,batch_id,material_variant_id)` 引用原需求及分配，固定 existing 原批次。

采购的 `(receipt_line,item_id,material_variant_id)`、`(receipt_revision,receipt_line)`、`(inspection,receipt_line)`、`(allocation,receipt_line)` 分别引用真实来源候选键；这些字段使用各自 procurement 前缀列名。组合 FK 只保证同到货行，当前轮、采用修订／检验、disposition=inbound、正式 allocation 与本次额度仍由 Procurement public 及数据库来源守卫核验。供应商名称为该实际明细确认时的快照；稳定 ID 沿真实来源解析，不能从快照名称猜 ID。

成品授权引用 production_output_allocation(id)，跨表守卫与来源公开命令校验授权→修订→任务／产品、父单同产品及剩余量。移除旧 `(inbound_id,product_id) → inbound_order(id,product_id)` 固定成品 FK：other 主单产品为空而行可为成品，不能继续套用。流水使用本节两类身份候选键。

每个已完成有效明细恰有匹配原始正流水。采购／成品同事务确认按 pending → 明细／目标 → 流水 → completed 执行，外部仍一次来源确认，无新增仓库草稿步骤。供应商摘要、批次来源和追溯按实际明细与匹配流水汇聚，共批不合并检查、不重挂采购／生产授权，也不推断后续领用精确消费某次来源的份额。

## 3.6 出库表

### 12. `outbound_order`

公共出库整表归 Inventory。生产领料沿用 PMO，其他出库使用 OO；Production 只提供领料资格及履约。未开放 picked/partially_outbound 已移除，其他 pending_picking 在管理端表达草稿／待确认，不增加数据库同义状态。

| 字段 | SQL定义 | 用途 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `outbound_no` | `VARCHAR(100) NOT NULL` | 全局唯一出库号 |
| `source_type` | `VARCHAR(30) NOT NULL` | production_material / other，无默认场景 |
| `production_batch_id` | `BIGINT UNSIGNED NULL` | 仅生产领料非空 |
| `work_order_id` | `BIGINT UNSIGNED NULL` | 仅生产领料非空，与任务组合FK一致 |
| `status` | `VARCHAR(30) NOT NULL DEFAULT 'pending_picking'` | pending_picking / completed / cancelled |
| `outbound_at` | `DATETIME NULL` | 系统实际确认时间 |
| `operator_id` | `BIGINT UNSIGNED NULL` | 确认人 |
| `reason` | `TEXT NULL` | 其他出库必填办理原因，生产领料为空 |
| `remark` | `TEXT NULL` | 单据备注 |
| `cancel_source` | `VARCHAR(30) NULL` | 取消时manual / production_batch / production_termination；其他出库只许manual |
| `cancel_reason` | `TEXT NULL` | 取消时非空原因 |
| `cancelled_by` | `BIGINT UNSIGNED NULL` | 取消人 |
| `cancelled_at` | `DATETIME NULL` | 取消时间 |
| `version` | `INT NOT NULL DEFAULT 0` | 非负父单乐观锁 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 创建人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_by` | `BIGINT UNSIGNED NOT NULL` | 最后修改人 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最后修改时间 |

唯一键 `(outbound_no)`、`(id,source_type)`、`(id,production_batch_id)`；查询索引 `(source_type,status,created_at,id)`、`(production_batch_id,source_type,status,id)`、`(work_order_id,id)`。工单、`(production_batch_id,work_order_id)` 及所有操作者保留外键。production_material 主单任务／工单必填、reason 空；other 主单任务／工单全空、reason 非空非空白。

### 13. `outbound_detail`

编码、版本编码及批号沿已有批次读取，不为对称复制快照。预留量、需求余额、补料号及生成组仍从来源事实派生。出库不创建批次，生产行不可编辑，其他草稿行可编辑／软删除。

| 字段 | SQL定义 | 用途 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `outbound_id` | `BIGINT UNSIGNED NOT NULL` | 公共出库主单 |
| `line_no` | `INT NOT NULL` | 单内稳定正行号，移除后不复用 |
| `source_type` | `VARCHAR(30) NOT NULL` | 与父单组合FK一致 |
| `production_batch_id` | `BIGINT UNSIGNED NULL` | 生产领料非空，其他为空 |
| `demand_id` | `BIGINT UNSIGNED NULL` | 生产领料非空，其他为空 |
| `allocation_id` | `BIGINT UNSIGNED NULL` | 生产领料原分配，其他为空 |
| `item_id` | `BIGINT UNSIGNED NULL` | 物料身份 |
| `material_variant_id` | `BIGINT UNSIGNED NULL` | 精确版本，与item_id成组 |
| `product_id` | `BIGINT UNSIGNED NULL` | 成品身份，与物料互斥 |
| `batch_id` | `BIGINT UNSIGNED NOT NULL` | 已有真实批次，出库不创建批次 |
| `outbound_number` | `INT NOT NULL` | 本次出库正数量，1..99999999；流水写相反数 |
| `unit_snapshot` | `VARCHAR(20) NOT NULL` | 批次／原分配单位 |
| `stock_status` | `VARCHAR(20) NOT NULL DEFAULT 'available'` | 本期出库固定available |
| `remark` | `TEXT NULL` | 行备注 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 创建人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_by` | `BIGINT UNSIGNED NOT NULL` | 最后修改人 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最后修改时间 |
| `is_deleted` | `TINYINT NOT NULL DEFAULT 0` | 其他草稿移除行，0/1；来源业务行恒0 |
| `deleted_by` | `BIGINT UNSIGNED NULL` | 软删除人，未删除为空 |
| `deleted_at` | `DATETIME NULL` | 软删除时间，未删除为空 |

唯一键 `(outbound_id,line_no)`、`(outbound_id,allocation_id)`、`(id,item_id,material_variant_id,batch_id)`、`(id,product_id,batch_id)`；索引 `(outbound_id,is_deleted,id)`、`(batch_id,id)`、`(allocation_id,id)`、`(demand_id,id)`。父子场景和任务分别以组合 FK 绑定；生产来源以需求／任务及原 allocation 的完整任务、需求、物料、精确版本、原批次组合引用。物料、版本、产品及两类批次身份保留对应 FK。

production_material 行必须有原任务／需求／allocation，且仅物料；other 行这些来源全空，可为物料或成品。同批次多行确认先合计核对余额及预留，再逐行生成唯一匹配负流水；人工其他出库不写需求、分配、补料或批准授权。

## 公共单据状态与不可变规则

只允许待确认 → completed/cancelled，以及 other 待确认内保存；不开放部分确认、恢复终态或通用 status 更新。新建 version=0，保存、确认、取消都比较父版本并恰好递增 1。终态幂等重放返回已有结果，不写任何行或版本；同次多行修改只推进一次父版本。

| 父单状态 | 确认事实 | 取消事实 | 出库取消来源 |
| --- | --- | --- | --- |
| pending / pending_picking | 时间／人全空 | 原因／人／时间全空 | 空 |
| completed | 时间／人全非空 | 全空 | 空 |
| cancelled | 全空 | 非空非空白原因及人／时间齐全 | 合法非空代码 |

生产领料取消来源允许 manual、production_batch、production_termination，other 只允许 manual；入库没有 cancel_source，退料沿用人工取消。编号、来源场景、生产归属及创建事实创建后不变。完成或取消后的父单及全部明细（含软删行）冻结，禁止物理删除。

其他首次保存和每次修改／确认保留 1–50 条有效行；空编辑表单不持久化。行号在父锁内按历史最大值 +1 分配，不复用；移除行 is_deleted=1 且 deleted_by/at 齐全，未删行三者为 0/NULL/NULL。已删行不恢复、不改内容，需要时追加新行。保存数量、原因、备注、对象和目标变更记录前后审计；行没有额外版本或修订表。

只有 other+待确认且从未记账的有效行可编辑／软删除；采购、成品、领料和退料行 is_deleted 恒 0。来源行创建后的系统修改仅为确认时将 new 的 batch_id 从 NULL 落为真实目标及修改审计；来源、身份、数量保持不变。

### 入库目标与其他草稿

| target_mode | new_batch_key | batch_id | 行规则 |
| --- | --- | --- | --- |
| existing | NULL | 非空 | 已有精确身份、单位一致批次；退料只能原批次 |
| new | trim 后非空，≤100 字符 | 草稿 NULL，确认回填 | 同单同键有效行共建一次 IB 批次，跨单不共用 |

同 new 键有效行的库存对象／精确版本、编码快照及单位必须一致。新目标保存时不产生真实批次；other 新行的 batch_id 必须为空，确认分组建批再统一回填。父单在回填期间仍 pending，因此 CHECK 不能简单限制所有 pending+new 的 batch_id 必空。采购／成品直接确认可以在该事务中先建批再插入已带 batch_id 的 new 行。失败整体回滚，取消不留下空批次。

已软删 new 行不建批，可以永远 batch_id=NULL；completed 仅要求所有有效行有真实目标与匹配流水。target_mode/new_batch_key 确认后保留，键不是人工批号；客户端不能用尾随空格区分组。其他草稿不占库存、不新增生产预留；待确认生产领料占可制单量、生产退料占可退量。

其他已有目标只办理 available 库存，要求批次 available；其他新批次须 ProductOtherStockQuery 返回的当前启用资格。退料保留历史原批次回仓资格，不能解除其冻结／停用；其他单也不能解冻批次或把损坏实物冒充 available。所有 FK 使用 ON UPDATE/DELETE RESTRICT，CHECK 显式检查 IS NULL/IS NOT NULL，不能通过 UNKNOWN 绕过来源互斥。数据库跨表只读守卫不授予其他模块应用写权。

## 成品身份与范围

成品使用 `product_id → products.id`，与物料／精确版本严格互斥，不建第二套账本。批准成品正流水为 production_inbound；其他成品可经 other_inbound/other_outbound 修正 available 存量。成品不参加 Production 物料预留、领退料或现有物料盘点。物料查询限定 product_id IS NULL。

批准成品名称按来源工单冻结信息展示，其他成品通过 Product 历史展示能力取得名称。销售、委外、通用仓库报废、状态转换与完整质量范围仍按产品范围保留为未开放场景，不能由已有代码值推断入口。其他补差只影响库存，不调整批准产出、累计已入授权或原需求履约。
