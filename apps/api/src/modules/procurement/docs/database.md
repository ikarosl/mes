# Procurement 数据库

遵守[数据库公共规则](../../../../../../docs/database-conventions.md)。拥有供应商和采购主行、来源及关闭表，以及到货、实收修订、实物范围与供应商退回表，登记于 `scripts/api-data-ownership.mjs`；不写需求、库存或 Product 主数据表。

## 供应商

`procurement_supplier` 为主数据，InnoDB、`utf8mb4_0900_ai_ci`。ID 和人员外键为 `BIGINT UNSIGNED`；时间按北京时间保存。

| 字段 | 类型与约束 | 含义 |
| --- | --- | --- |
| id | 自增主键 | 稳定供应商身份 |
| supplier_name | VARCHAR(100) NOT NULL，永久唯一 | trim 后的名称；不提供其他业务字段 |
| created_by / updated_by | NOT NULL，FK users(id) | 创建与最近修改人员 |
| created_at | DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 修改时间 |
| version | INT NOT NULL DEFAULT 0，CHECK >=0 | PATCH 乐观锁，成功修改递增一次 |
| is_deleted | TINYINT NOT NULL DEFAULT 0，CHECK IN(0,1) | 主数据软删除标记 |
| deleted_by / deleted_at | 可空人员 FK / DATETIME | 与删除标记成组完整；一期无删除入口 |

`uk_procurement_supplier_name(supplier_name)` 不包含删除标记，软删除后仍不能复用名称，大小写及重音等相等性服从数据库排序规则。CHECK 拒绝空名称和首尾普通空格；应用边界 trim 全部标准空白。`idx_procurement_supplier_list(is_deleted,supplier_name,id)` 支持稳定名称排序。人员外键使用默认 RESTRICT；身份创建后不改，名称修改不产生新的供应商 ID。

新增在单事务内插入后写 `supplier.create` 成功审计。修改先锁本行，比较请求版本，再以 `id+version` 更新名称与操作者、递增版本，同事务写 `supplier.update` 前后快照。重复名由唯一键兜底；失败不保留业务写入或成功日志。

追加 migration `202609190001-procurement-suppliers` 建表并发布采购目录、供应商查看/新增/修改权限。不会写角色授权或账户；seed 继续只提供管理员通配权限。down 先要求供应商表为空，随后删除表及对应权限关联/目录；开发环境可重置，不做兼容双写。

## 采购单据

`202609190002-procurement-purchase-orders` 追加以下四表，同为 InnoDB、utf8mb4_0900_ai_ci、BIGINT UNSIGNED ID。可变主行具备 created_by/at、updated_by/at、version，人员 FK 指向 users；数量 INT 且 CHECK 限制 0～99999999（计划必须 >0），不持久化物料名称。

| 表 | 字段与约束 |
| --- | --- |
| purchase_order | 自增 id；永久唯一 purchase_no VARCHAR(100)；supplier_id FK；source_type demand/stock；supplement_reason excess_purchase/quality_replacement 或 NULL；status draft/ordered/completed/cancelled；remark TEXT；ordered_by/at 成组，草稿无下单信息、正式下单后保留；索引(status,created_at,id)、(supplier_id,created_at,id) |
| purchase_order_line | id、purchase_order_id FK、正 line_no；item_id FK、material_variant_id 与 item_id 组合 FK；item_code_snapshot VARCHAR(100)、material_variant_code_snapshot VARCHAR(180)、unit_snapshot VARCHAR(20)；planned_quantity INT；status draft/open/closed/cancelled；可空 origin_order_line_id 自FK及非空 supplement_evidence 成组；唯一(单,line_no)、(单,item,variant)、(id,单)、(id,item,variant)，原行索引 |
| purchase_order_line_source | 联合PK(purchase_order_line_id,demand_id)，分别FK采购行、Production需求；created_at；反查索引(demand_id,purchase_order_line_id)，无采购分摊量 |
| purchase_order_line_closure | id、唯一purchase_order_line_id FK；reason_type为4种关闭原因；manual_end/cancelled原因非空；planned/received/undetermined/approved/inbound/return_due/returned/quality_returned_quantity整数；evidence_json冻结依据；created_by/at；触发器拒绝更新和删除 |

source 和 supplier 等跨行归属在锁内校验，不借展示查询判断资格。190004 为采购行追加 origin_receipt_line_id、origin_supplier_return_id 及同原行／原到货组合 FK；退回引用必须有原到货。关闭事实只冻结关闭证据，累计入库始终由 Inventory 流水事实决定。

down 首先要求采购根为空，之后依赖顺序删除触发器、关闭／来源／行／主单和6个订单权限。迁移不写角色或业务种子。已执行 migration 不修改；开发环境允许按统一命令重置。

## 到货、范围与 Quality 关联

`202609190004-procurement-receipts-and-quality` 新增五张 Procurement 表及两张 Quality 表，后两张由 Quality 独占写入。详细字段和组合 FK 见[技术设计](../../../../../../docs/procurement-inbound-technical-design.md)§3；行为见[到货处置](receipts.md)，纯读白名单及历史窗口见[到货查询](receipt-queries.md)。

| 表 | 类型与关键约束 |
| --- | --- |
| procurement_receipt | 不可变交接事实；永久唯一 receipt_no，采购根 FK，真实 received_at／handover_evidence，创建审计，触发器拒绝改删 |
| procurement_receipt_line | 可变聚合；采购根／行和物料精确版本组合 FK，供应商批号单存，current_receipt_revision_id 同明细 FK，nullable batch_id 组合 FK 到 item_batch 且唯一，M 审计和 version；绑定后触发器拒绝改批次和身份 |
| procurement_receipt_revision | 不可变实收事实；同明细连续 revision_no 唯一，previous_revision_id 同明细 FK，非负 INT 实收及显式原实物核对、原因，创建审计及不可变触发器 |
| procurement_receipt_scope | 可变范围节点；正 INT 数量，parent_scope_id／revision／inspection／review_case／termination_root 均同明细组合 FK，显式 disposition 与 transition_type，M 审计/version；superseded 父范围仅追溯，不计当前数量池 |
| procurement_supplier_return | 不可变交接；return_no 和 scope_id 永久唯一，同明细修订／范围／检验 FK，真实交接时间、数量和凭据，quality 原因必须有检验，创建审计及不可变触发器 |

Inventory 原表 inbound_detail 追加四个来源 FK：procurement_receipt_line_id、procurement_receipt_revision_id、procurement_scope_id、procurement_inspection_id，四列成组非空且必须物料身份；同一消费 scope 唯一。保留原 batch_id→item_batch.id，不另造批次或内部批号字段；替换旧单/批次/物料唯一键以允许同批多个消费范围同次入库。成品唯一约束保持。

migration 首先拒绝存在旧 purchased 入库数据的开发库，要求重置，不构造伪采购、伪检验或双写。down 在已有到货或检验时拒绝回退，空库按 FK 依赖拆除新关联和表。新增到货/Quality 页面与操作权限不自动授权普通角色；管理员继续 seed 通配权限。
