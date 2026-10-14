# 通用出入库完整字段字典

状态与范围见 [README](README.md)，键、外键、CHECK及事务约束见 [constraints](constraints.md)。本稿列出本次目标的全部列，不留“其他来源字段以后补”的占位。

## 公共约定

SQL定义明确空值和默认值：未写DEFAULT的必填列由服务端提供，可空列默认NULL。时间为北京时间DATETIME；所有ID为BIGINT UNSIGNED。六表均用InnoDB、utf8mb4、utf8mb4_0900_ai_ci；new_batch_key单独使用utf8mb4_bin。各操作者ID引用users(id)。主单版本统一控制整单编辑，没有明细version。

单笔数量采用INT、1..99999999；流水可正负但非零，绝对值同上；余额仍是BIGINT投影。DTO必须拒绝小数，不能依赖INT转换后再做整数CHECK。原因及快照要求非空时须同时拒绝纯空白。

## 1. inbound_order

Inventory所有；复用现有表。没有主单供应商、总数量、是否已记账、审批状态或通用business_id。采购PI、批准成品FI、退料TL、其他入库OI；不会另存return_no。

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

## 2. inbound_detail

Inventory所有。来源外键直接内嵌，不新增来源关联表，不保存第二份退料数量。删除原source_stage：六场景没有独立写入用途。原退料release_after_return及return_stock_status不保留，公共stock_status固定available。物料名称读取Product当前名称；采购供应商ID沿真实来源解析。批准成品显示原工单冻结名称，其他成品通过Product历史展示能力取当前名称，不伪造任务来源。批号沿batch_id读取，new_batch_key不是批号。

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

## 3. outbound_order

整表所有权移交Inventory，Production仍负责领料资格及履约。保留PMO号，其他出库用OO。移除未开放picked/partially_outbound，仍整单确认；其他pending_picking在UI显示草稿／待确认，不增加数据库同义状态。

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

## 4. outbound_detail

编码、版本编码及批号继续沿已有批次读取，不为对称增加重复快照。不保存预留量、需求剩余、补料编号或需求生成组。生产领料行不可编辑，其他草稿才可编辑和软删除。

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

## 5. inventory_transaction

原始来源仍只有reference_type+reference_detail_id可写；三个STORED来源列仅用于分支外键，不是第二套可写来源。SQL展示稿给出完整表达式。保留既有基础冲销结构，不因此开放撤销已确认单据；其他补差用新单。新增原始防重不能因transaction_group_key非空被绕过。

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

## 6. item_batch

列集合保持现状，仅列全便于审阅。其他成品单据来源是other，库批类别仍为finished_product；两者不能混为一个场景枚举。身份、单位、批号不可回改；其他补差不能解冻或启用批次。

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

## 7. 保留、删除及字典变化

- 删除return_order/detail，不建production_return_inbound及production_return_inbound_detail。退料仍有独立页面和业务命令，底层使用公共入库。
- 需求、分配、采购正式分配、产出授权不增列；预留不迁移，不复制业务履约量。
- inventory_batch_balance和inventory_material_variant_balance字段不变，仍由流水同事务维护；前者已支持成品，后者仅物料。
- stock_check_order/detail字段及范围不变；明细新增唯一候选键(id,item_id,material_variant_id,batch_id)供流水外键引用。
- 编号目录新增other_inbound=OI、other_outbound=OO；采购PI、成品FI、退料TL、领料PMO、批次IB沿用。
- 入库场景代码收敛为purchased、finished_product、return_inbound、other；出库为production_material、other；库批source_type继续沿用现有八项代码，不自动开放未批准场景。
- 流水交易类型完整集合：purchase_inbound、production_inbound、outsourced_inbound、production_material_outbound、sales_outbound、material_return_inbound、scrap_outbound、stock_check_adjustment、status_transfer_in、status_transfer_out、other_inbound、other_outbound。非本期代码不新增入口。
- 来源代码移除return_detail；保留inbound_detail、outbound_detail、stock_check_detail、scrap、inspection_record、manual的既有定义，不开放任意manual写流水。
- 权限、操作审计和HTTP幂等复用现有平台表；正式接入逐入口注册，不把流水幂等当作已具备HTTP幂等。
