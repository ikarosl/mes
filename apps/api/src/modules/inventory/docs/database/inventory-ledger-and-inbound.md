# 库存批次、库存流水与出入库

> [返回 Inventory 数据库设计](../database.md)。公共出入库四表、批次、流水和余额投影由 Inventory 唯一所有；生产预留、需求与来源资格仍归 Production，采购来源和质量结论归各自模块。

本章维护库存批次、流水、余额投影及公共单据的职责与完整结构，字段和约束随[迁移文件](../../../../../../../packages/database/migrations/)同步；公共审计、数量和时间遵守[数据库约定](../../../../../../../docs/database-conventions.md)。

主单版本控制整单编辑，明细没有独立版本；其他草稿移除行保留软删除记录。

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

库批是实际库存目标，保留不可改写的身份、批号、单位和建批来源；状态变化不覆盖数量。来源集合由实际入库明细确定，库批不表示唯一供应商、任务或计划内外类别。

- 库存批号全局唯一，只在确认事务真实建批时按[统一编号规则](../../../../../docs/business-numbering.md)生成，不开放人工内部批号或预建空批次。
- 其他物料新批的 `source_type=other`，其他成品新批仍为 `finished_product`；单据场景与库批类别不是同一枚举。已有来源代码不自动开放新场景。
- `provider` 保留采购建批来源描述，不代表唯一供应商；其他新批的 provider、来源工单／任务、生产日期及批次备注均为空，不复制单据原因。本期新建路径不填写来源工单／任务或生产日期，历史引用继续保留。
- 物料版本编码快照仅物料分支有值。操作者列保留历史可空性，但所有新业务必须填写创建／修改人。
- 已有同身份、同单位且 available 的批次可再次入库，包括零余额批次；不取新批号或覆盖建批事实。生产退料可沿历史原冻结／停用批次回仓，但不解除状态。

组合引用保证物料精确版本属于基础物料，所有明细和流水的身份与真实库批一致；外键和查询索引列于下表。

**`item_batch` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键，自增 |
| `item_id` | `BIGINT UNSIGNED NULL` | 物料身份 |
| `material_variant_id` | `BIGINT UNSIGNED NULL` | 精确物料版本 |
| `product_id` | `BIGINT UNSIGNED NULL` | 成品身份 |
| `item_code_snapshot` | `VARCHAR(100) NOT NULL` | 建批时编码 |
| `material_variant_code_snapshot` | `VARCHAR(180) NULL` | 物料版本编码，成品为空 |
| `unit_snapshot` | `VARCHAR(20) NOT NULL` | 建批单位 |
| `batch_code` | `VARCHAR(100) NOT NULL` | 服务端按[统一编号规则](../../../../../docs/business-numbering.md)生成的库存批号，全局唯一 |
| `source_type` | `VARCHAR(30) NOT NULL` | 物料新批为purchased/other，成品恒finished_product；既有代码保留 |
| `provider` | `VARCHAR(100) NULL` | 保留采购建批来源描述；其他新批为空，不代表唯一供应商 |
| `source_work_order_id` | `BIGINT UNSIGNED NULL` | 历史建批来源工单；本期新建路径为空 |
| `source_production_batch_id` | `BIGINT UNSIGNED NULL` | 历史建批来源任务；与来源工单组成关联，本期新建路径为空 |
| `production_date` | `DATE NULL` | 保留现有列；本期不开放填写 |
| `batch_status` | `VARCHAR(20) NOT NULL DEFAULT 'available'` | available / frozen / disabled |
| `remark` | `TEXT NULL` | 批次备注；其他新批为空，不复制单据原因 |
| `version` | `INT NOT NULL DEFAULT 0` | 既有批次状态并发控制 |
| `created_by` | `BIGINT UNSIGNED NULL` | 创建人；历史可空，所有新业务必须提供 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_by` | `BIGINT UNSIGNED NULL` | 最近修改人；历史可空，所有新业务必须提供 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 更新时间 |

**`item_batch` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_item_batch_source_work_order FOREIGN KEY (source_work_order_id) REFERENCES work_orders(id)` |
| 外键 | `CONSTRAINT fk_item_batch_source_production FOREIGN KEY (source_production_batch_id, source_work_order_id) REFERENCES production_batches(id, work_order_id)` |
| 外键 | `CONSTRAINT fk_item_batch_created_by FOREIGN KEY (created_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_item_batch_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_item_batch_product FOREIGN KEY (product_id) REFERENCES products(id)` |
| 外键 | `CONSTRAINT fk_item_batch_source_product FOREIGN KEY (source_production_batch_id,product_id) REFERENCES production_batches(id,product_id)` |
| 外键 | `CONSTRAINT fk_item_batch_item FOREIGN KEY (item_id) REFERENCES materials(id)` |
| 外键 | `CONSTRAINT fk_item_batch_variant FOREIGN KEY (material_variant_id,item_id) REFERENCES material_variants(id,material_id)` |
| 唯一键 | `UNIQUE KEY uk_item_batch_id_item (id, item_id)` |
| 唯一键 | `UNIQUE KEY uk_item_batch_variant_code (material_variant_id, batch_code)` |
| 唯一键 | `UNIQUE KEY uk_item_batch_id_item_variant (id, item_id, material_variant_id)` |
| 唯一键 | `UNIQUE KEY uk_item_batch_id_product (id,product_id)` |
| 唯一键 | `UNIQUE KEY uk_item_batch_product_code (product_id,batch_code)` |
| 唯一键 | `UNIQUE KEY uk_item_batch_code (batch_code)` |
| 索引 | `KEY idx_item_batch_item_status (item_id, batch_status)` |
| 索引 | `KEY idx_item_batch_product_status (product_id,batch_status)` |
| 索引 | `KEY idx_item_batch_source_product (source_production_batch_id,product_id)` |
| CHECK | `CONSTRAINT chk_item_batch_status CHECK (batch_status IN ('available','frozen','disabled'))` |
| CHECK | `CONSTRAINT chk_item_batch_version CHECK (version >= 0)` |
| CHECK | `CONSTRAINT chk_item_batch_source_type CHECK(source_type IN('finished_product','self_made','production_extra','purchased','outsourced','return_inbound','stock_check_generated','other'))` |
| CHECK | `CONSTRAINT chk_item_batch_identity CHECK( (product_id IS NULL AND item_id IS NOT NULL AND material_variant_id IS NOT NULL AND material_variant_code_snapshot IS NOT NULL AND source_type<>'finished_product') OR (product_id IS NOT NULL AND item_id IS NULL AND material_variant_id IS NULL AND material_variant_code_snapshot IS NULL AND source_type='finished_product' AND provider IS NULL AND source_work_order_id IS NULL AND source_production_batch_id IS NULL))` |
| CHECK | `CONSTRAINT chk_item_batch_snapshots CHECK ( CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(item_code_snapshot,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0 AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(unit_snapshot,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0 AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(batch_code,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0 AND (material_variant_code_snapshot IS NULL OR CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(material_variant_code_snapshot,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0) )` |

**`item_batch` 数据库触发器**

| 触发器 | 时机 | 保护或维护范围 |
| --- | --- | --- |
| [trg_item_batch_move_variant_balance](../../../../../../../packages/database/migrations/202609170002-finished-goods-inbound.up.sql) | `AFTER UPDATE` | 批次状态变更时搬移物料版本余额桶 |
| [trg_item_batch_reject_material_identity_update](../../../../../../../packages/database/migrations/202609240001-unified-inbound-allocation-target.up.sql) | `BEFORE UPDATE` | 冻结库存身份、批号、单位及建批来源 |
| [trg_item_batch_creation_guard](../../../../../../../packages/database/migrations/202610140001-general-inventory-documents.up.sql) | `BEFORE INSERT` | 新批须有创建／修改人及初始版本；other 新批不携带业务来源或描述 |

### 7. `inventory_transaction`

唯一库存数量事实，余额和可分配量由追加流水及可重建投影得出。数量允许正负且不得为零；六场景只记 available，方向由上方场景表决定，单位、精确身份、真实批次和数量必须与未删除的实际明细一致。

来源只写 `reference_type/reference_detail_id`，其中 ID 是实际明细而非主单。`inbound_detail_ref`、`outbound_detail_ref`、`stock_check_detail_ref` 是只读生成指针，用有类型的组合外键核对来源、身份和批次；盘点没有成品分支。实际分支列必须齐全，不能用 NULL 绕过引用。触发器读取普通 reference 列，不读取 NEW 的生成列。

每条实际入出库明细或非零盘点差额只允许一笔原始记账，`original_posting_key` 保证该唯一性，不因 `transaction_group_key` 非空而失效。服务端按实际明细身份稳定生成流水幂等键，数据库守卫核验同一规则；两个键不能改用主单号或批次 ID，具体格式见[来源守卫迁移](../../../../../../../packages/database/migrations/202610140001-general-inventory-documents.up.sql)。

重复确认返回原结果，不换键追加流水；HTTP `Idempotency-Key` 另行保护完整命令。分组键也不作为两张人工补差单的配对号。

流水禁止 UPDATE/DELETE。基础冲销只允许对同一原流水做一次整笔全额反向记账，身份、状态、单位、交易类型和业务引用相同，`original_posting_key` 为空；当前不开放撤销已确认单据、成品冲销、部分冲销或任意 manual 流水。人工补差通过新的其他单据，保留原明细与履约。已有交易类型和来源代码不自动开放六场景及物料盘点以外的入口。

测试专用 `_test/_ci` 库允许 fixture 在同一连接临时设置 `@company_inventory_test_cleanup=1` 清理自身数据，释放连接前清空；非专用库该变量无效。该例外不属于生产写入口。批次详情按时间和流水 ID 倒序展示全部正负流水、真实来源、分组及冲销引用，不只展示入库正流水。

**`inventory_transaction` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键，自增 |
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
| `inbound_detail_ref` | `BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN reference_type='inbound_detail' THEN reference_detail_id ELSE NULL END) STORED` | 入库来源的只读生成指针；供有类型外键使用，应用不可赋值 |
| `outbound_detail_ref` | `BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN reference_type='outbound_detail' THEN reference_detail_id ELSE NULL END) STORED` | 出库来源的只读生成指针；供有类型外键使用，应用不可赋值 |
| `stock_check_detail_ref` | `BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN reference_type='stock_check_detail' THEN reference_detail_id ELSE NULL END) STORED` | 盘点来源的只读生成指针；供有类型外键使用，应用不可赋值 |
| `original_posting_key` | `VARCHAR(100) GENERATED ALWAYS AS (CASE WHEN reversal_of_transaction_id IS NULL AND reference_type IN ('inbound_detail','outbound_detail','stock_check_detail') THEN CONCAT(reference_type,':',reference_detail_id) ELSE NULL END) STORED` | 原始流水唯一键；不因分组非空绕过去重；冲销为空 |

**`inventory_transaction` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_inventory_transaction_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inventory_transaction_item FOREIGN KEY (item_id) REFERENCES materials (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inventory_transaction_variant FOREIGN KEY (material_variant_id,item_id) REFERENCES material_variants (id,material_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inventory_transaction_product FOREIGN KEY (product_id) REFERENCES products (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inventory_transaction_batch_material FOREIGN KEY (batch_id,item_id,material_variant_id) REFERENCES item_batch (id,item_id,material_variant_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inventory_transaction_batch_product FOREIGN KEY (batch_id,product_id) REFERENCES item_batch (id,product_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inventory_transaction_reversal FOREIGN KEY (reversal_of_transaction_id) REFERENCES inventory_transaction (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inventory_transaction_inbound_detail FOREIGN KEY (inbound_detail_ref) REFERENCES inbound_detail (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inventory_transaction_inbound_material FOREIGN KEY (inbound_detail_ref,item_id,material_variant_id,batch_id) REFERENCES inbound_detail (id,item_id,material_variant_id,batch_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inventory_transaction_inbound_product FOREIGN KEY (inbound_detail_ref,product_id,batch_id) REFERENCES inbound_detail (id,product_id,batch_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inventory_transaction_outbound_detail FOREIGN KEY (outbound_detail_ref) REFERENCES outbound_detail (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inventory_transaction_outbound_material FOREIGN KEY (outbound_detail_ref,item_id,material_variant_id,batch_id) REFERENCES outbound_detail (id,item_id,material_variant_id,batch_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inventory_transaction_outbound_product FOREIGN KEY (outbound_detail_ref,product_id,batch_id) REFERENCES outbound_detail (id,product_id,batch_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inventory_transaction_stock_check_detail FOREIGN KEY (stock_check_detail_ref) REFERENCES stock_check_detail (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inventory_transaction_stock_check_material FOREIGN KEY (stock_check_detail_ref,item_id,material_variant_id,batch_id) REFERENCES stock_check_detail (id,item_id,material_variant_id,batch_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 唯一键 | `UNIQUE KEY uk_inventory_transaction_idempotency (idempotency_key)` |
| 唯一键 | `UNIQUE KEY uk_inventory_transaction_reversal (reversal_of_transaction_id)` |
| 唯一键 | `UNIQUE KEY uk_inventory_transaction_original_posting (original_posting_key)` |
| 索引 | `KEY idx_inventory_transaction_reference (reference_type,reference_detail_id,id)` |
| 索引 | `KEY idx_inventory_transaction_stock (item_id,batch_id,stock_status,created_at)` |
| 索引 | `KEY idx_inventory_transaction_product_stock (product_id,batch_id,stock_status,created_at)` |
| 索引 | `KEY idx_inventory_transaction_group (transaction_group_key)` |
| 索引 | `KEY idx_inventory_transaction_batch_status (batch_id,stock_status,id)` |
| 索引 | `KEY idx_inventory_transaction_variant (material_variant_id,item_id)` |
| 索引 | `KEY idx_inventory_transaction_batch_material (batch_id,item_id,material_variant_id)` |
| 索引 | `KEY idx_inventory_transaction_batch_product (batch_id,product_id)` |
| 索引 | `KEY idx_inventory_transaction_created_by (created_by)` |
| 索引 | `KEY idx_inventory_transaction_inbound_material (inbound_detail_ref,item_id,material_variant_id,batch_id)` |
| 索引 | `KEY idx_inventory_transaction_inbound_product (inbound_detail_ref,product_id,batch_id)` |
| 索引 | `KEY idx_inventory_transaction_outbound_material (outbound_detail_ref,item_id,material_variant_id,batch_id)` |
| 索引 | `KEY idx_inventory_transaction_outbound_product (outbound_detail_ref,product_id,batch_id)` |
| 索引 | `KEY idx_inventory_transaction_stock_check_material (stock_check_detail_ref,item_id,material_variant_id,batch_id)` |
| CHECK | `CONSTRAINT chk_inventory_transaction_identity CHECK ((item_id IS NOT NULL AND material_variant_id IS NOT NULL AND product_id IS NULL) OR (item_id IS NULL AND material_variant_id IS NULL AND product_id IS NOT NULL))` |
| CHECK | `CONSTRAINT chk_inventory_transaction_quantity CHECK (quantity<>0 AND quantity BETWEEN -99999999 AND 99999999)` |
| CHECK | `CONSTRAINT chk_inventory_transaction_unit CHECK (CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(unit_snapshot,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0)` |
| CHECK | `CONSTRAINT chk_inventory_transaction_idempotency CHECK (CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(idempotency_key,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0)` |
| CHECK | `CONSTRAINT chk_inventory_transaction_reference CHECK (reference_type IN ('inbound_detail','outbound_detail','stock_check_detail','scrap','inspection_record','manual'))` |
| CHECK | `CONSTRAINT chk_inventory_transaction_stock_status CHECK (stock_status IN ('available','pending_inspection','frozen','defective'))` |
| CHECK | `CONSTRAINT chk_inventory_transaction_type CHECK (transaction_type IN ('purchase_inbound','production_inbound','outsourced_inbound','production_material_outbound','sales_outbound','material_return_inbound','scrap_outbound','stock_check_adjustment','status_transfer_in','status_transfer_out','other_inbound','other_outbound'))` |
| CHECK | `CONSTRAINT chk_inventory_transaction_type_source CHECK ( (transaction_type IN ('purchase_inbound','production_inbound','material_return_inbound','other_inbound') AND reference_type='inbound_detail' AND stock_status='available') OR (transaction_type IN ('production_material_outbound','other_outbound') AND reference_type='outbound_detail' AND stock_status='available') OR (transaction_type='stock_check_adjustment' AND reference_type='stock_check_detail' AND product_id IS NULL) OR (transaction_type IN ('outsourced_inbound','sales_outbound','scrap_outbound','status_transfer_in','status_transfer_out') AND reference_type IN ('scrap','inspection_record','manual') AND product_id IS NULL) )` |
| CHECK | `CONSTRAINT chk_inventory_transaction_direction CHECK ( transaction_type='stock_check_adjustment' OR (transaction_type IN ('purchase_inbound','production_inbound','outsourced_inbound','material_return_inbound','status_transfer_in','other_inbound') AND ((reversal_of_transaction_id IS NULL AND quantity>0) OR (reversal_of_transaction_id IS NOT NULL AND quantity<0))) OR (transaction_type IN ('production_material_outbound','sales_outbound','scrap_outbound','status_transfer_out','other_outbound') AND ((reversal_of_transaction_id IS NULL AND quantity<0) OR (reversal_of_transaction_id IS NOT NULL AND quantity>0))) )` |
| CHECK | `CONSTRAINT chk_inventory_transaction_finished_scope CHECK (product_id IS NULL OR (transaction_type IN ('production_inbound','other_inbound','other_outbound') AND stock_status='available' AND reversal_of_transaction_id IS NULL AND transaction_group_key IS NULL))` |
| CHECK | `CONSTRAINT chk_inventory_transaction_other_original CHECK (transaction_type NOT IN ('other_inbound','other_outbound') OR reversal_of_transaction_id IS NULL)` |
| CHECK | `CONSTRAINT chk_inventory_transaction_transfer_group CHECK (transaction_type NOT IN ('status_transfer_in','status_transfer_out') OR (transaction_group_key IS NOT NULL AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(transaction_group_key,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0))` |

**`inventory_transaction` 数据库触发器**

| 触发器 | 时机 | 保护或维护范围 |
| --- | --- | --- |
| [trg_inventory_transaction_reject_update](../../../../../../../packages/database/migrations/202608130002-inventory-transaction-immutability.up.sql) | `BEFORE UPDATE` | 禁止改写流水；仅保留受控测试库清理例外 |
| [trg_inventory_transaction_reject_delete](../../../../../../../packages/database/migrations/202608130002-inventory-transaction-immutability.up.sql) | `BEFORE DELETE` | 禁止删除流水；仅保留受控测试库清理例外 |
| [trg_inventory_transaction_update_balances](../../../../../../../packages/database/migrations/202609170002-finished-goods-inbound.up.sql) | `AFTER INSERT` | 新流水同事务维护库批余额 |
| [trg_inventory_transaction_cleanup_balances](../../../../../../../packages/database/migrations/202609170002-finished-goods-inbound.up.sql) | `AFTER DELETE` | 受控测试清理同步冲减库批余额 |
| [trg_inventory_transaction_update_variant_balance](../../../../../../../packages/database/migrations/202609170002-finished-goods-inbound.up.sql) | `AFTER INSERT` | 物料流水同事务维护精确版本余额 |
| [trg_inventory_transaction_cleanup_variant_balance](../../../../../../../packages/database/migrations/202609170002-finished-goods-inbound.up.sql) | `AFTER DELETE` | 受控测试清理同步冲减精确版本余额 |
| [trg_inventory_transaction_source_guard](../../../../../../../packages/database/migrations/202610140001-general-inventory-documents.up.sql) | `BEFORE INSERT` | 核验实际来源、完整身份、数量方向、单据阶段及稳定记账键 |

### 7.1 `inventory_batch_balance`

每个库批、库存状态只保留一份余额，覆盖可用、待检、冻结和不良库存。物料／成品身份与库批一致，精确物料版本沿库批读取，不重复保存。负余额由数据库拒绝；`version` 记录余额变化次数。

本表是可从流水重建的投影，更新及对账规则见下方[余额投影维护规则](#74-余额投影维护规则)。

**`inventory_batch_balance` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `batch_id` | `BIGINT UNSIGNED NOT NULL` | 库存批次 ID |
| `item_id` | `BIGINT UNSIGNED NULL` | 库存对象 ID，与批次中的物料保持一致 |
| `product_id` | `BIGINT UNSIGNED NULL` | 成品身份；与 item_id 二选一，不复制精确版本 ID |
| `stock_status` | `VARCHAR(20) NOT NULL` | 库存状态：可用、待检、冻结或不良 |
| `current_quantity` | `BIGINT NOT NULL` | 该批次在该库存状态下的当前整数余额 |
| `version` | `BIGINT UNSIGNED NOT NULL DEFAULT 0` | 投影更新次数，默认 `0`，每次余额变化递增 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近一次同步时间，由数据库自动更新 |

**`inventory_batch_balance` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (batch_id,stock_status)` |
| 外键 | `CONSTRAINT fk_inventory_batch_balance_batch_product FOREIGN KEY (batch_id,product_id) REFERENCES item_batch(id,product_id)` |
| 外键 | `CONSTRAINT fk_inventory_batch_balance_batch_item FOREIGN KEY (batch_id,item_id) REFERENCES item_batch(id,item_id)` |
| 索引 | `KEY idx_inventory_batch_balance_item_status (item_id,stock_status,batch_id)` |
| 索引 | `KEY idx_inventory_batch_balance_product_status (product_id,stock_status,batch_id)` |
| 索引 | `KEY idx_inventory_batch_balance_batch_product (batch_id,product_id)` |
| CHECK | `CONSTRAINT chk_inventory_batch_balance_status CHECK ( stock_status IN ('available','pending_inspection','frozen','defective') )` |
| CHECK | `CONSTRAINT chk_inventory_batch_balance_identity CHECK ( (product_id IS NULL AND item_id IS NOT NULL) OR (product_id IS NOT NULL AND item_id IS NULL) )` |

**`inventory_batch_balance` 数据库触发器**

| 触发器 | 时机 | 保护或维护范围 |
| --- | --- | --- |
| [trg_inventory_batch_balance_reject_negative_insert](../../../../../../../packages/database/migrations/202608250002-inventory-balances-and-demand-fulfillment.up.sql) | `BEFORE INSERT` | 拒绝负库存余额 |
| [trg_inventory_batch_balance_reject_negative_update](../../../../../../../packages/database/migrations/202608250002-inventory-balances-and-demand-fulfillment.up.sql) | `BEFORE UPDATE` | 拒绝负库存余额 |

### 7.2 基础物料库存合计

基础物料总库存由 `inventory_material_variant_balance` 按 `material_id` 汇总，不单独持久化基础物料余额表。按 `stock_status + batch_status` 分组可得到各状态总量；可用库存只包含两个状态均为 `available` 的余额。查询成本随版本余额行数增长，不随历史流水条数直接增长。

物料总量只用于合计展示，不代表各版本可互换。供需预警按精确版本分别展示和计算缺口；禁止直接用跨版本总库存抵扣需求。

### 7.3 `inventory_material_variant_balance`

每个精确物料版本按“库存状态 × 批次状态”分桶汇总，基础物料身份必须与版本一致。每组只保留一行，负余额由数据库拒绝；`version` 在余额变化或状态搬移时递增。

本表用于版本库存展示、候选选择、库存校验及基础物料合计，不改变“BOM 绑定基础物料、管理员选定精确版本”的规则，也不构成独立库存事实。

**`inventory_material_variant_balance` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `material_variant_id` | `BIGINT UNSIGNED NOT NULL` | 精确物料版本 ID，例如 `m1.077.012-v1-A` 对应的版本记录 |
| `material_id` | `BIGINT UNSIGNED NOT NULL` | 所属基础物料 ID，例如编码 `m1.077.012` 对应的稳定物料身份 |
| `stock_status` | `VARCHAR(20) NOT NULL` | 库存自身状态：可用、待检、冻结或不良 |
| `batch_status` | `VARCHAR(20) NOT NULL` | 库存批次业务状态：可用、冻结或停用 |
| `current_quantity` | `BIGINT NOT NULL` | 该精确版本在这组状态组合下跨库存批次汇总的当前整数总量 |
| `version` | `BIGINT UNSIGNED NOT NULL DEFAULT 0` | 投影更新次数，默认 `0`，每次余额变化或状态搬移时递增 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近一次同步时间，由数据库自动更新 |

**`inventory_material_variant_balance` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (material_variant_id, stock_status, batch_status)` |
| 外键 | `CONSTRAINT fk_inventory_variant_balance_variant FOREIGN KEY (material_variant_id, material_id) REFERENCES material_variants(id, material_id)` |
| 索引 | `KEY idx_inventory_variant_balance_material ( material_id, stock_status, batch_status, material_variant_id )` |
| CHECK | `CONSTRAINT chk_inventory_variant_balance_stock_status CHECK ( stock_status IN ('available', 'pending_inspection', 'frozen', 'defective') )` |
| CHECK | `CONSTRAINT chk_inventory_variant_balance_batch_status CHECK ( batch_status IN ('available', 'frozen', 'disabled') )` |

**`inventory_material_variant_balance` 数据库触发器**

| 触发器 | 时机 | 保护或维护范围 |
| --- | --- | --- |
| [trg_inventory_variant_balance_reject_negative_insert](../../../../../../../packages/database/migrations/202609040002-production-material-variant-demand.up.sql) | `BEFORE INSERT` | 拒绝负库存余额 |
| [trg_inventory_variant_balance_reject_negative_update](../../../../../../../packages/database/migrations/202609040002-production-material-variant-demand.up.sql) | `BEFORE UPDATE` | 拒绝负库存余额 |

### 7.4 余额投影维护规则

当前仅保留 `inventory_batch_balance` 和 `inventory_material_variant_balance` 两张余额投影，均归 Inventory 所有，只是 `inventory_transaction` 的可重建查询结果，不属于 Product 主数据，也不构成新的库存事实来源。其他模块不得直接写入或把它们当作跨模块主数据接口。

累计余额允许超过单笔数量上限。维护规则如下：

1. 插入库存流水时，同事务更新 `inventory_batch_balance`；物料分支另更新 `inventory_material_variant_balance`，成品分支不生成虚构物料版本桶。
   精确版本余额投影先以数量 `0` 确保目标桶存在，再用流水正负数量更新余额；这样负数出库流水只在最终余额不足时被防负数约束拒绝。
2. `item_batch.batch_status` 变化时，批次余额不变；仅物料分支搬移精确版本余额，成品按批次余额及批次状态直接查询。
3. 余额变为 `0` 的空投影行可以删除；查询端必须把不存在的组合解释为数量 `0`。
4. `AFTER DELETE` 触发器只服务于 `_test/_ci` 测试库受控清理；生产库存流水禁止删除。
5. 迁移首次建立投影前先检查历史流水聚合不得为负，再从全部流水分别按以下维度回填：
   - 批次余额：`batch_id + item_id/product_id + stock_status`（按对应身份分支）；
   - 精确版本余额：`material_variant_id + material_id + stock_status + batch_status`。

对账时分别将流水按上述两个维度汇总，与对应余额逐项比较（包括缺行和多余行，缺行按零处理）；基础物料合计通过版本余额分组后与流水按物料、库存状态及批次状态的汇总比较，不依赖独立物料余额表。

当前库存和供需预警优先读余额投影，人工补差仍通过其他出入库事实办理，不直接改余额。

---

### 7.5 库存查询与可分配量

库存用完不自动改写 `item_batch.batch_status`；账面数量与批次可用状态分别表达。

- 库存批次列表和详情读取 `inventory_batch_balance` 中 `stock_status = available` 的余额，缺行按 `0` 处理；库存流水详情仍读取 `inventory_transaction`。历史账面库存保留，可分配数量还要求批次状态 `available` 且 Product 公开能力确认当前生产用途允许使用该精确版本，否则为 `0`。
- 初始物料需求配置与人工追加候选只读取启用的物料版本，不查询或展示库存；库存余额投影未扣除分配预留，因此不得用于该需求配置窗口的库存提示。
- 分配候选按活动需求的 `item_id + material_variant_id` 匹配库存批次，只返回批次状态为 `available` 且账面可用量大于 `0` 的批次；该入口按当前用途候选展示可用数量；分配锁内余额由 Inventory 在批次锁后对 `inventory_batch_balance` 做当前读，缺行视为零，避免使用事务早期快照。

库存批次查询与分配候选使用相同的预留口径：

```text
单条分配的未出库占用 = max(assigned_number - 已确认出库量, 0)
批次预留量 = sum(未 released/cancelled 的分配行的未出库占用)
可继续分配量 = max(账面可用库存 - 批次预留量, 0)
```

已确认出库量只统计 `source_type=production_material` 且主单 `completed` 的有效明细，人工其他出库不参与分配履约。待出库单尚未减少账面库存，其对应数量仍在分配预留内，不能再次扣除。`frozen/abnormal` 分配仍保留占用；释放或取消分配才移除相应预留。当前确认退料固定回到公共可用库存，增加库存流水余额，不重新增加原分配的可出库量，不创建或恢复需求。需求履约展示与分配门禁均不扣除退料量；净领用量只服务领退追溯，不参与任务开工判断，不能用作现场实存量或新需求。

候选可能显示可继续分配量为 `0` 的正库存批次；返回候选不代表写入资格。分配写事务须锁定需求和库存批次，重新校验批次状态、精确版本、需求缺口及流水余额扣除预留后的数量。

精确版本供需计算：按 `item_id + material_variant_id` 汇总全部 `active.remaining_number`，与 `inventory_material_variant_balance` 中同物料、同版本的余额匹配，缺行按 `0` 处理。总库存包含该版本全部状态，停用版本的历史库存仍保留。用于生产供需比较的可用库存，除库存状态和批次状态均为 `available` 外，还须由 Product `MaterialVariantQuery.listEnabledByMaterials` 公开能力确认基础物料、分类及精确版本均启用且未删除；不直接读取 Product 状态表作为资格。未满足该用途资格时可用量为 `0`，该数量仍在总库存及不可领库存中展示。缺口为 `max(该版本活动需求剩余量 - 该版本可用库存, 0)`，不同版本不得合并抵扣。资格集合在 SQL 缺口排序和分页前批量解析，不能取出一页后清零可用量而保留错误排序；确认分配／领料仍须在各自写事务内重新校验。

`GET /production/inventory-material-supply-demand` 每行对应一个有正库存（含其他状态库存）或活动需求的精确版本，`total` 和分页均按版本计数；返回必填 `materialVariantId/materialVariantCode`，编码和单位优先取同版本 ID 最大的活动需求快照，无活动需求时取同版本 ID 最大的库存批次快照；名称按基础物料 ID 读取当前主数据。无需求版本的未完成需求与缺口均为 `0`。先按是否有未完成需求降序，再按缺口降序、物料编码、物料 ID、版本 ID 稳定排序。关键词匹配展示的物料编码、名称或版本编码，也匹配同版本任一活动需求的编码和版本编码快照；搜索不改变该版本完整的库存与需求汇总。无库存且无活动需求的版本不展示，零余额行是否已清理不影响候选集合。

点击版本行后，`GET /production/inventory-material-supply-demand/:itemId/demands` 必须携带 `materialVariantId` 查询参数。查询同时限定基础物料、精确版本和活动状态，返回需求的版本 ID 与编码快照，分页只计算该版本的需求。物料与版本不匹配时返回空列表，不退回物料级查询。

活动需求包含已分配但尚未领用的数量，因此供需比较不从可用库存再次扣除分配预留。基础物料跨版本合计只用于库存总览，不替代此预警的版本明细。

## 3.4 入库表

### 8. `inbound_order`

公共入库主单承载采购入库、批准成品入库、生产退料和其他入库，按对应业务类型统一取号；退料号也只保存在 `inbound_no`。主单不持有唯一供应商、总数量、通用 business_id 或复制审批状态。

批准成品必须关联同一任务、工单及产品；退料关联同一任务、工单，主单产品为空；采购和其他入库的三项生产归属均为空。其他成品身份在明细中。批准版、类别、检验及采购供应商沿各行实际授权追溯。

其他入库必须填写办理原因，其余场景不填；人工补差的前一单号写在备注。实际确认时间由系统记录，不任意回填。状态、取消记录与版本统一见[公共单据规则](#公共单据状态与不可变规则)。

**`inbound_order` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键，自增 |
| `inbound_no` | `VARCHAR(100) NOT NULL` | 全局唯一入库号；退料单号也在此保存 |
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

**`inbound_order` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_inbound_order_work_order FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_order_batch_work_order FOREIGN KEY (production_batch_id,work_order_id) REFERENCES production_batches (id,work_order_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_order_operator_id FOREIGN KEY (operator_id) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_order_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_order_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_order_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_order_product FOREIGN KEY (product_id) REFERENCES products (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_order_batch_product FOREIGN KEY (production_batch_id,product_id) REFERENCES production_batches (id,product_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 唯一键 | `UNIQUE KEY uk_inbound_order_no (inbound_no)` |
| 唯一键 | `UNIQUE KEY uk_inbound_order_id_source (id,source_type)` |
| 唯一键 | `UNIQUE KEY uk_inbound_order_id_batch (id,production_batch_id)` |
| 索引 | `KEY idx_inbound_order_source_status_created (source_type,status,created_at,id)` |
| 索引 | `KEY idx_inbound_order_batch_source_status (production_batch_id,source_type,status,id)` |
| 索引 | `KEY idx_inbound_order_work_order (work_order_id,id)` |
| 索引 | `KEY idx_inbound_order_batch_work_order (production_batch_id,work_order_id)` |
| 索引 | `KEY idx_inbound_order_operator_id (operator_id)` |
| 索引 | `KEY idx_inbound_order_cancelled_by (cancelled_by)` |
| 索引 | `KEY idx_inbound_order_created_by (created_by)` |
| 索引 | `KEY idx_inbound_order_updated_by (updated_by)` |
| 索引 | `KEY idx_inbound_order_product (product_id)` |
| 索引 | `KEY idx_inbound_order_batch_product (production_batch_id,product_id)` |
| CHECK | `CONSTRAINT chk_inbound_order_status CHECK (status IN ('pending','completed','cancelled'))` |
| CHECK | `CONSTRAINT chk_inbound_order_version CHECK (version>=0)` |
| CHECK | `CONSTRAINT chk_inbound_order_number CHECK (CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(inbound_no,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0)` |
| CHECK | `CONSTRAINT chk_inbound_order_state CHECK ( (status='pending' AND inbound_at IS NULL AND operator_id IS NULL AND cancel_reason IS NULL AND cancelled_by IS NULL AND cancelled_at IS NULL) OR (status='completed' AND inbound_at IS NOT NULL AND operator_id IS NOT NULL AND cancel_reason IS NULL AND cancelled_by IS NULL AND cancelled_at IS NULL) OR (status='cancelled' AND inbound_at IS NULL AND operator_id IS NULL AND cancel_reason IS NOT NULL AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(cancel_reason,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0) )` |
| CHECK | `CONSTRAINT chk_inbound_order_source_type CHECK (source_type IN ('purchased','finished_product','return_inbound','other'))` |
| CHECK | `CONSTRAINT chk_inbound_order_source CHECK ( (source_type='purchased' AND work_order_id IS NULL AND production_batch_id IS NULL AND product_id IS NULL AND reason IS NULL) OR (source_type='finished_product' AND work_order_id IS NOT NULL AND production_batch_id IS NOT NULL AND product_id IS NOT NULL AND reason IS NULL) OR (source_type='return_inbound' AND work_order_id IS NOT NULL AND production_batch_id IS NOT NULL AND product_id IS NULL AND reason IS NULL) OR (source_type='other' AND work_order_id IS NULL AND production_batch_id IS NULL AND product_id IS NULL AND reason IS NOT NULL AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(reason,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0) )` |

**`inbound_order` 数据库触发器**

| 触发器 | 时机 | 保护或维护范围 |
| --- | --- | --- |
| [trg_inbound_order_insert_guard](../../../../../../../packages/database/migrations/202610140001-general-inventory-documents.up.sql) | `BEFORE INSERT` | 以待确认状态、初始版本及完整创建审计建单 |
| [trg_inbound_order_update_guard](../../../../../../../packages/database/migrations/202610140001-general-inventory-documents.up.sql) | `BEFORE UPDATE` | 保护身份和版本，核对草稿、确认、取消及终态条件 |
| [trg_inbound_order_delete_guard](../../../../../../../packages/database/migrations/202610140001-general-inventory-documents.up.sql) | `BEFORE DELETE` | 禁止物理删除；保留受控测试库清理例外 |

### 9. `inbound_detail`

来源直接关联公共实际明细，不另存退料数量。每条明细对应一个实际库存目标；新批次草稿允许尚无 `batch_id`，目标规则见[下文](#入库目标与其他草稿)。物料名称读取 Product 当前名称；批准成品显示来源工单冻结名称，其他成品使用历史展示能力，不伪造生产来源。

- 单内行号稳定，移除后不复用；只有其他草稿行可软删除，来源业务行始终保留。
- 同一退料单内每个原分配只出现一次；任务、需求、物料精确版本及原批次必须与该分配一致，退料固定回到原批次。
- 采购保存真实到货行、采用的实收修订、检验和正式授权，以及确认时供应商名称。组合引用只保证同一到货行；当前轮、采用依据、入库处置和剩余额度仍由 Procurement 公开能力与数据库来源守卫核验。稳定供应商 ID 沿来源取得，不能从名称猜测。
- 成品明细引用正式产出授权；来源命令和守卫核对授权、批准版、任务／产品及剩余额度。其他成品行的主单产品为空，不能用“明细产品必须等于主单产品”的统一外键限制所有场景。
- 同授权可在同单分到不同目标，同批次也可承接多条来源；不设置授权或“单据＋批次＋物料”的唯一槽位。流水按实际明细及完整身份引用，保证每个已完成有效明细恰有匹配原始正流水。

采购／成品在同事务按 pending → 明细／目标 → 流水 → completed 完成，外部一次来源确认，没有新增仓库草稿步骤。供应商摘要、批次来源和追溯按实际明细与匹配流水汇聚；共批不合并检查、不重挂采购／生产授权，也不推断后续领用精确消费某次来源的份额。

**`inbound_detail` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键，自增 |
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

**`inbound_detail` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_inbound_detail_order_source FOREIGN KEY (inbound_id,source_type) REFERENCES inbound_order (id,source_type) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_detail_order_batch FOREIGN KEY (inbound_id,production_batch_id) REFERENCES inbound_order (id,production_batch_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_detail_demand_batch FOREIGN KEY (demand_id,production_batch_id) REFERENCES production_item_demand (id,production_batch_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_detail_item FOREIGN KEY (item_id) REFERENCES materials (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_detail_variant FOREIGN KEY (material_variant_id,item_id) REFERENCES material_variants (id,material_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_detail_product FOREIGN KEY (product_id) REFERENCES products (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_detail_batch_material FOREIGN KEY (batch_id,item_id,material_variant_id) REFERENCES item_batch (id,item_id,material_variant_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_detail_batch_product FOREIGN KEY (batch_id,product_id) REFERENCES item_batch (id,product_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_detail_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_detail_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_detail_deleted_by FOREIGN KEY (deleted_by) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_detail_return_allocation FOREIGN KEY (return_allocation_id,demand_id,production_batch_id,item_id,batch_id,material_variant_id) REFERENCES production_item_allocation (id,demand_id,production_batch_id,item_id,batch_id,material_variant_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_detail_procurement_material FOREIGN KEY (procurement_receipt_line_id,item_id,material_variant_id) REFERENCES procurement_receipt_line (id,item_id,material_variant_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_detail_procurement_revision FOREIGN KEY (procurement_receipt_revision_id,procurement_receipt_line_id) REFERENCES procurement_receipt_revision (id,receipt_line_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_detail_procurement_inspection FOREIGN KEY (procurement_inspection_id,procurement_receipt_line_id) REFERENCES quality_inspection_record (id,receipt_line_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_detail_procurement_allocation FOREIGN KEY (procurement_allocation_id,procurement_receipt_line_id) REFERENCES procurement_receipt_allocation (id,receipt_line_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_inbound_detail_output_allocation FOREIGN KEY (production_output_allocation_id) REFERENCES production_output_allocation (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 唯一键 | `UNIQUE KEY uk_inbound_detail_procurement_scope(procurement_scope_id)` |
| 唯一键 | `UNIQUE KEY uk_inbound_detail_order_line (inbound_id,line_no)` |
| 唯一键 | `UNIQUE KEY uk_inbound_detail_order_allocation (inbound_id,return_allocation_id)` |
| 唯一键 | `UNIQUE KEY uk_inbound_detail_material_reference (id,item_id,material_variant_id,batch_id)` |
| 唯一键 | `UNIQUE KEY uk_inbound_detail_product_reference (id,product_id,batch_id)` |
| 索引 | `KEY idx_inbound_detail_order_deleted (inbound_id,is_deleted,id)` |
| 索引 | `KEY idx_inbound_detail_order_source (inbound_id,source_type)` |
| 索引 | `KEY idx_inbound_detail_order_batch (inbound_id,production_batch_id)` |
| 索引 | `KEY idx_inbound_detail_batch (batch_id,id)` |
| 索引 | `KEY idx_inbound_detail_batch_material (batch_id,item_id,material_variant_id)` |
| 索引 | `KEY idx_inbound_detail_batch_product (batch_id,product_id)` |
| 索引 | `KEY idx_inbound_detail_item (item_id,id)` |
| 索引 | `KEY idx_inbound_detail_variant (material_variant_id,item_id)` |
| 索引 | `KEY idx_inbound_detail_product (product_id,id)` |
| 索引 | `KEY idx_inbound_detail_demand_batch (demand_id,production_batch_id)` |
| 索引 | `KEY idx_inbound_detail_created_by (created_by)` |
| 索引 | `KEY idx_inbound_detail_updated_by (updated_by)` |
| 索引 | `KEY idx_inbound_detail_deleted_by (deleted_by)` |
| 索引 | `KEY idx_inbound_detail_new_batch (inbound_id,new_batch_key)` |
| 索引 | `KEY idx_inbound_detail_procurement_allocation (procurement_allocation_id,id)` |
| 索引 | `KEY idx_inbound_detail_procurement_receipt (procurement_receipt_line_id,id)` |
| 索引 | `KEY idx_inbound_detail_procurement_inspection (procurement_inspection_id,id)` |
| 索引 | `KEY idx_inbound_detail_output_allocation (production_output_allocation_id,id)` |
| 索引 | `KEY idx_inbound_detail_return_allocation (return_allocation_id,id)` |
| 索引 | `KEY idx_inbound_detail_return_source (return_allocation_id,demand_id,production_batch_id,item_id,batch_id,material_variant_id)` |
| 索引 | `KEY idx_inbound_detail_procurement_material (procurement_receipt_line_id,item_id,material_variant_id)` |
| 索引 | `KEY idx_inbound_detail_procurement_revision (procurement_receipt_revision_id,procurement_receipt_line_id)` |
| 索引 | `KEY idx_inbound_detail_procurement_inspection_source (procurement_inspection_id,procurement_receipt_line_id)` |
| 索引 | `KEY idx_inbound_detail_procurement_allocation_source (procurement_allocation_id,procurement_receipt_line_id)` |
| CHECK | `CONSTRAINT chk_inbound_detail_identity CHECK ((item_id IS NOT NULL AND material_variant_id IS NOT NULL AND product_id IS NULL) OR (item_id IS NULL AND material_variant_id IS NULL AND product_id IS NOT NULL))` |
| CHECK | `CONSTRAINT chk_inbound_detail_quantity CHECK (inbound_number BETWEEN 1 AND 99999999)` |
| CHECK | `CONSTRAINT chk_inbound_detail_line CHECK (line_no>0)` |
| CHECK | `CONSTRAINT chk_inbound_detail_unit CHECK (CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(unit_snapshot,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0)` |
| CHECK | `CONSTRAINT chk_inbound_detail_stock_status CHECK (stock_status='available')` |
| CHECK | `CONSTRAINT chk_inbound_detail_deletion CHECK ((is_deleted=0 AND deleted_by IS NULL AND deleted_at IS NULL) OR (is_deleted=1 AND source_type='other' AND deleted_by IS NOT NULL AND deleted_at IS NOT NULL))` |
| CHECK | `CONSTRAINT chk_inbound_detail_code CHECK (CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(item_code_snapshot,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0)` |
| CHECK | `CONSTRAINT chk_inbound_detail_target CHECK ( (target_mode='existing' AND batch_id IS NOT NULL AND new_batch_key IS NULL) OR (target_mode='new' AND new_batch_key IS NOT NULL AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(new_batch_key,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0 AND OCTET_LENGTH(new_batch_key)=OCTET_LENGTH(TRIM(new_batch_key))) )` |
| CHECK | `CONSTRAINT chk_inbound_detail_source CHECK ( (source_type='purchased' AND item_id IS NOT NULL AND procurement_receipt_line_id IS NOT NULL AND procurement_receipt_revision_id IS NOT NULL AND procurement_inspection_id IS NOT NULL AND procurement_allocation_id IS NOT NULL AND supplier_name_snapshot IS NOT NULL AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(supplier_name_snapshot,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0 AND production_output_allocation_id IS NULL AND production_batch_id IS NULL AND demand_id IS NULL AND return_allocation_id IS NULL) OR (source_type='finished_product' AND product_id IS NOT NULL AND procurement_receipt_line_id IS NULL AND procurement_receipt_revision_id IS NULL AND procurement_inspection_id IS NULL AND procurement_allocation_id IS NULL AND supplier_name_snapshot IS NULL AND production_output_allocation_id IS NOT NULL AND production_batch_id IS NULL AND demand_id IS NULL AND return_allocation_id IS NULL) OR (source_type='return_inbound' AND item_id IS NOT NULL AND procurement_receipt_line_id IS NULL AND procurement_receipt_revision_id IS NULL AND procurement_inspection_id IS NULL AND procurement_allocation_id IS NULL AND supplier_name_snapshot IS NULL AND production_output_allocation_id IS NULL AND production_batch_id IS NOT NULL AND demand_id IS NOT NULL AND return_allocation_id IS NOT NULL AND target_mode='existing') OR (source_type='other' AND procurement_receipt_line_id IS NULL AND procurement_receipt_revision_id IS NULL AND procurement_inspection_id IS NULL AND procurement_allocation_id IS NULL AND supplier_name_snapshot IS NULL AND production_output_allocation_id IS NULL AND production_batch_id IS NULL AND demand_id IS NULL AND return_allocation_id IS NULL) )` |

**`inbound_detail` 数据库触发器**

| 触发器 | 时机 | 保护或维护范围 |
| --- | --- | --- |
| [trg_inbound_detail_delete_guard](../../../../../../../packages/database/migrations/202610140001-general-inventory-documents.up.sql) | `BEFORE DELETE` | 禁止物理删除；保留受控测试库清理例外 |
| [trg_inbound_detail_insert_guard](../../../../../../../packages/database/migrations/202610200001-procurement-supplement-logistics-decoupling.up.sql) | `BEFORE INSERT` | 锁定父单并核验来源、身份、目标和待确认阶段 |
| [trg_inbound_detail_update_guard](../../../../../../../packages/database/migrations/202610200001-procurement-supplement-logistics-decoupling.up.sql) | `BEFORE UPDATE` | 仅放行符合阶段的草稿编辑、软删除或新目标落批，保护来源及终态 |

## 3.6 出库表

### 12. `outbound_order`

公共出库整表归 Inventory。生产领料与其他出库分别按业务类型取号；Production 只提供领料资格及履约。生产领料必须关联同一任务／工单，办理原因为空；其他出库没有生产归属，办理原因必填。

其他出库的 `pending_picking` 在管理端表达草稿／待确认，不增加同义状态。实际确认时间由系统记录；取消来源和终态约束见[公共单据规则](#公共单据状态与不可变规则)。

**`outbound_order` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键，自增 |
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

**`outbound_order` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_outbound_order_work_order FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_outbound_order_batch_work_order FOREIGN KEY (production_batch_id,work_order_id) REFERENCES production_batches (id,work_order_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_outbound_order_operator_id FOREIGN KEY (operator_id) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_outbound_order_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_outbound_order_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_outbound_order_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 唯一键 | `UNIQUE KEY uk_outbound_order_no (outbound_no)` |
| 唯一键 | `UNIQUE KEY uk_outbound_order_id_source (id,source_type)` |
| 唯一键 | `UNIQUE KEY uk_outbound_order_id_batch (id,production_batch_id)` |
| 索引 | `KEY idx_outbound_order_source_status_created (source_type,status,created_at,id)` |
| 索引 | `KEY idx_outbound_order_batch_source_status (production_batch_id,source_type,status,id)` |
| 索引 | `KEY idx_outbound_order_work_order (work_order_id,id)` |
| 索引 | `KEY idx_outbound_order_batch_work_order (production_batch_id,work_order_id)` |
| 索引 | `KEY idx_outbound_order_operator_id (operator_id)` |
| 索引 | `KEY idx_outbound_order_cancelled_by (cancelled_by)` |
| 索引 | `KEY idx_outbound_order_created_by (created_by)` |
| 索引 | `KEY idx_outbound_order_updated_by (updated_by)` |
| CHECK | `CONSTRAINT chk_outbound_order_status CHECK (status IN ('pending_picking','completed','cancelled'))` |
| CHECK | `CONSTRAINT chk_outbound_order_version CHECK (version>=0)` |
| CHECK | `CONSTRAINT chk_outbound_order_number CHECK (CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(outbound_no,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0)` |
| CHECK | `CONSTRAINT chk_outbound_order_state CHECK ( (status='pending_picking' AND outbound_at IS NULL AND operator_id IS NULL AND cancel_reason IS NULL AND cancelled_by IS NULL AND cancelled_at IS NULL AND cancel_source IS NULL) OR (status='completed' AND outbound_at IS NOT NULL AND operator_id IS NOT NULL AND cancel_reason IS NULL AND cancelled_by IS NULL AND cancelled_at IS NULL AND cancel_source IS NULL) OR (status='cancelled' AND outbound_at IS NULL AND operator_id IS NULL AND cancel_reason IS NOT NULL AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL AND cancel_source IS NOT NULL AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(cancel_reason,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0) )` |
| CHECK | `CONSTRAINT chk_outbound_order_source_type CHECK (source_type IN ('production_material','other'))` |
| CHECK | `CONSTRAINT chk_outbound_order_source CHECK ( (source_type='production_material' AND production_batch_id IS NOT NULL AND work_order_id IS NOT NULL AND reason IS NULL) OR (source_type='other' AND production_batch_id IS NULL AND work_order_id IS NULL AND reason IS NOT NULL AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(reason,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0) )` |
| CHECK | `CONSTRAINT chk_outbound_order_cancel_source CHECK (cancel_source IS NULL OR (source_type='other' AND cancel_source='manual') OR (source_type='production_material' AND cancel_source IN ('manual','production_batch','production_termination')))` |

**`outbound_order` 数据库触发器**

| 触发器 | 时机 | 保护或维护范围 |
| --- | --- | --- |
| [trg_outbound_order_insert_guard](../../../../../../../packages/database/migrations/202610140001-general-inventory-documents.up.sql) | `BEFORE INSERT` | 以待确认状态、初始版本及完整创建审计建单 |
| [trg_outbound_order_update_guard](../../../../../../../packages/database/migrations/202610140001-general-inventory-documents.up.sql) | `BEFORE UPDATE` | 保护身份和版本，核对草稿、确认、取消及终态条件 |
| [trg_outbound_order_delete_guard](../../../../../../../packages/database/migrations/202610140001-general-inventory-documents.up.sql) | `BEFORE DELETE` | 禁止物理删除；保留受控测试库清理例外 |

### 13. `outbound_detail`

出库只使用已有真实批次，不建新批；编码、版本编码和批号沿批次读取，不为对称复制快照。需求余额、预留、补料号及生成组仍从来源事实派生。

生产领料行必须关联原任务、需求和分配，物料精确版本、批次和单位与原分配一致；同一出库单内每个原分配只出现一次。其他出库的生产来源全空，可以是物料或成品。父子场景及任务保持一致。

生产行不可编辑，其他草稿行可编辑／软删除，稳定行号不复用。同批次多行确认先合计核对余额和预留，再逐行生成与明细等量、方向相反的唯一流水；其他出库不写需求、分配、补料或批准授权。

**`outbound_detail` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键，自增 |
| `outbound_id` | `BIGINT UNSIGNED NOT NULL` | 公共出库主单 |
| `line_no` | `INT NOT NULL` | 单内稳定正行号，移除后不复用 |
| `source_type` | `VARCHAR(30) NOT NULL` | 与父单组合FK一致 |
| `production_batch_id` | `BIGINT UNSIGNED NULL` | 生产领料所属任务，其他出库为空 |
| `demand_id` | `BIGINT UNSIGNED NULL` | 生产领料来源需求，其他出库为空 |
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

**`outbound_detail` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_outbound_detail_order_source FOREIGN KEY (outbound_id,source_type) REFERENCES outbound_order (id,source_type) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_outbound_detail_order_batch FOREIGN KEY (outbound_id,production_batch_id) REFERENCES outbound_order (id,production_batch_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_outbound_detail_demand_batch FOREIGN KEY (demand_id,production_batch_id) REFERENCES production_item_demand (id,production_batch_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_outbound_detail_item FOREIGN KEY (item_id) REFERENCES materials (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_outbound_detail_variant FOREIGN KEY (material_variant_id,item_id) REFERENCES material_variants (id,material_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_outbound_detail_product FOREIGN KEY (product_id) REFERENCES products (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_outbound_detail_batch_material FOREIGN KEY (batch_id,item_id,material_variant_id) REFERENCES item_batch (id,item_id,material_variant_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_outbound_detail_batch_product FOREIGN KEY (batch_id,product_id) REFERENCES item_batch (id,product_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_outbound_detail_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_outbound_detail_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_outbound_detail_deleted_by FOREIGN KEY (deleted_by) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 外键 | `CONSTRAINT fk_outbound_detail_allocation FOREIGN KEY (allocation_id,demand_id,production_batch_id,item_id,batch_id,material_variant_id) REFERENCES production_item_allocation (id,demand_id,production_batch_id,item_id,batch_id,material_variant_id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| 唯一键 | `UNIQUE KEY uk_outbound_detail_order_line (outbound_id,line_no)` |
| 唯一键 | `UNIQUE KEY uk_outbound_detail_order_allocation (outbound_id,allocation_id)` |
| 唯一键 | `UNIQUE KEY uk_outbound_detail_material_reference (id,item_id,material_variant_id,batch_id)` |
| 唯一键 | `UNIQUE KEY uk_outbound_detail_product_reference (id,product_id,batch_id)` |
| 索引 | `KEY idx_outbound_detail_order_deleted (outbound_id,is_deleted,id)` |
| 索引 | `KEY idx_outbound_detail_order_source (outbound_id,source_type)` |
| 索引 | `KEY idx_outbound_detail_order_batch (outbound_id,production_batch_id)` |
| 索引 | `KEY idx_outbound_detail_batch (batch_id,id)` |
| 索引 | `KEY idx_outbound_detail_batch_material (batch_id,item_id,material_variant_id)` |
| 索引 | `KEY idx_outbound_detail_batch_product (batch_id,product_id)` |
| 索引 | `KEY idx_outbound_detail_item (item_id,id)` |
| 索引 | `KEY idx_outbound_detail_variant (material_variant_id,item_id)` |
| 索引 | `KEY idx_outbound_detail_product (product_id,id)` |
| 索引 | `KEY idx_outbound_detail_demand_batch (demand_id,production_batch_id)` |
| 索引 | `KEY idx_outbound_detail_created_by (created_by)` |
| 索引 | `KEY idx_outbound_detail_updated_by (updated_by)` |
| 索引 | `KEY idx_outbound_detail_deleted_by (deleted_by)` |
| 索引 | `KEY idx_outbound_detail_allocation (allocation_id,id)` |
| 索引 | `KEY idx_outbound_detail_demand (demand_id,id)` |
| 索引 | `KEY idx_outbound_detail_allocation_source (allocation_id,demand_id,production_batch_id,item_id,batch_id,material_variant_id)` |
| CHECK | `CONSTRAINT chk_outbound_detail_identity CHECK ((item_id IS NOT NULL AND material_variant_id IS NOT NULL AND product_id IS NULL) OR (item_id IS NULL AND material_variant_id IS NULL AND product_id IS NOT NULL))` |
| CHECK | `CONSTRAINT chk_outbound_detail_quantity CHECK (outbound_number BETWEEN 1 AND 99999999)` |
| CHECK | `CONSTRAINT chk_outbound_detail_line CHECK (line_no>0)` |
| CHECK | `CONSTRAINT chk_outbound_detail_unit CHECK (CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(unit_snapshot,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0)` |
| CHECK | `CONSTRAINT chk_outbound_detail_stock_status CHECK (stock_status='available')` |
| CHECK | `CONSTRAINT chk_outbound_detail_deletion CHECK ((is_deleted=0 AND deleted_by IS NULL AND deleted_at IS NULL) OR (is_deleted=1 AND source_type='other' AND deleted_by IS NOT NULL AND deleted_at IS NOT NULL))` |
| CHECK | `CONSTRAINT chk_outbound_detail_source CHECK ((source_type='production_material' AND item_id IS NOT NULL AND production_batch_id IS NOT NULL AND demand_id IS NOT NULL AND allocation_id IS NOT NULL) OR (source_type='other' AND production_batch_id IS NULL AND demand_id IS NULL AND allocation_id IS NULL))` |

**`outbound_detail` 数据库触发器**

| 触发器 | 时机 | 保护或维护范围 |
| --- | --- | --- |
| [trg_outbound_detail_insert_guard](../../../../../../../packages/database/migrations/202610140001-general-inventory-documents.up.sql) | `BEFORE INSERT` | 锁定父单并核验来源、身份、目标和待确认阶段 |
| [trg_outbound_detail_delete_guard](../../../../../../../packages/database/migrations/202610140001-general-inventory-documents.up.sql) | `BEFORE DELETE` | 禁止物理删除；保留受控测试库清理例外 |
| [trg_outbound_detail_update_guard](../../../../../../../packages/database/migrations/202610140002-other-draft-history-deletion.up.sql) | `BEFORE UPDATE` | 仅允许未记账的其他出库草稿编辑或软删除，保护创建身份、来源及终态 |

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
| new | trim 后非空，≤100 字符 | 草稿 NULL，确认回填 | 同单同键有效行共建一次库存批次并取号，跨单不共用 |

`new_batch_key` 区分大小写；同键有效行的库存对象／精确版本、编码快照及单位必须一致。新目标保存时不产生真实批次；other 新行的 batch_id 必须为空，确认分组建批再统一回填。父单在回填期间仍 pending，因此 CHECK 不能简单限制所有 pending+new 的 batch_id 必空。采购／成品直接确认可以在该事务中先建批再插入已带 batch_id 的 new 行。失败整体回滚，取消不留下空批次。

已软删 new 行不建批，可以永远 batch_id=NULL；completed 仅要求所有有效行有真实目标与匹配流水。target_mode/new_batch_key 确认后保留，键不是人工批号；客户端不能用尾随空格区分组。其他草稿不占库存、不新增生产预留；待确认生产领料占可制单量、生产退料占可退量。

其他已有目标只办理 available 库存，要求批次 available；其他新批次须 ProductOtherStockQuery 返回的当前启用资格。退料保留历史原批次回仓资格，不能解除其冻结／停用；其他单也不能解冻批次或把损坏实物冒充 available。所有 FK 使用 ON UPDATE/DELETE RESTRICT，CHECK 显式检查 IS NULL/IS NOT NULL，不能通过 UNKNOWN 绕过来源互斥。数据库跨表只读守卫不授予其他模块应用写权。

### 数据库守卫职责

CHECK 负责本章定义的值域、身份与来源互斥、字段组和空白限制，FK／UNIQUE 负责真实引用、组合身份及重复事实。以下跨行和生命周期条件由数据库触发器强制，不能只依赖应用校验；来源模块仍须在同事务锁内独立核验权限、当前轮、放行、授权额度及办理资格。

| 写入位置 | 数据库强制条件 |
| --- | --- |
| 主单 INSERT | 四种入库均以 `pending`、两种出库均以 `pending_picking` 建立，创建人和修改人齐全；采购／成品一次确认内部也遵守该顺序 |
| 明细 INSERT／UPDATE | 锁定父单，核对待确认、场景、来源、身份、单位和目标；仅未记账的其他草稿有效行可编辑／软删除，来源行不可改业务内容，已删行不可恢复或改写 |
| 入库确认落批 | `new` 目标仅允许 `batch_id` 从 NULL 变为同身份真实批次并维护修改审计；数量、来源、目标键和单位不变 |
| 六场景原始流水 INSERT | 按真实来源锁定父单并读取有效明细；父单须待确认，核对场景对应的类型、方向、精确数量、单位、身份、批次、available 状态及稳定记账键 |
| 盘点／基础冲销 INSERT | 使用独立分支：盘点核验原盘点阶段、四类库存状态及非零实盘差额；基础冲销核验原已完成事实的同身份同来源反向全额镜像，不要求原父单恢复待确认 |
| 主单完成 | 至少一条有效行；有效行都有真实批次和唯一匹配原始流水，软删行无流水，确认人／时间齐全 |
| 主单取消 | 包括软删行在内的全部明细均无流水，取消字段齐全，历史行保留 |
| 主单 UPDATE／终态 | 数据库要求 `NEW.version=OLD.version+1`；终态父单及全部明细冻结，禁止物理删除；幂等重放不执行 UPDATE |
| 流水 UPDATE／DELETE | 禁止修改或删除；基础冲销受原流水唯一引用约束，测试库清理仅使用本章规定的受控例外 |

应用保存明细必须同步推进父单版本，同一命令的多行变更只推进一次；编号和场景由授权命令生成。数据库守卫不授予通用流水写入或撤销已确认单据的业务能力。

## 成品身份与范围

成品使用 `product_id → products.id`，与物料／精确版本严格互斥，不建第二套账本。批准成品正流水为 production_inbound；其他成品可经 other_inbound/other_outbound 修正 available 存量。成品不参加 Production 物料预留、领退料或现有物料盘点。物料查询限定 product_id IS NULL。

批准成品名称按来源工单冻结信息展示，其他成品通过 Product 历史展示能力取得名称。销售、委外、通用仓库报废、状态转换与完整质量范围仍按产品范围保留为未开放场景，不能由已有代码值推断入口。其他补差只影响库存，不调整批准产出、累计已入授权或原需求履约。
