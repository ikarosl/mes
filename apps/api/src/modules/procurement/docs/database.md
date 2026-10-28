# Procurement 数据库

本文维护当前采购字段与约束。检后核实数量、建议公式、不可变主从、采购分配及范围约束由[来料正式清单](receipt-acceptance.md)维护；跨模块选择理由见 [ADR-0015](../../../../../../docs/adr/0015-unified-quality-quantity-semantics.md)。

遵守[数据库公共规则](../../../../../../docs/database-conventions.md)。拥有供应商和采购主行、来源表，以及到货、实收修订、整批处理轮次、正式清单/分配与供应商退回表，登记于 `scripts/api-data-ownership.mjs`；不写需求、库存或 Product 主数据表。

当前采购表统一使用 `procurement_` 前缀。主单保存唯一供应商，按需来源固定一个工单；采购行不另存供应商，来源不含分摊数量。

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

采购单据由以下三表组成，同为 InnoDB、utf8mb4_0900_ai_ci。所有 ID／外键为 BIGINT UNSIGNED；下文除显式 NULL 外均非空。可变主行使用 created_by／updated_by（FK users.id）、created_at／updated_at（DATETIME DEFAULT CURRENT_TIMESTAMP，后者 ON UPDATE CURRENT_TIMESTAMP）及 version（INT DEFAULT 0，CHECK >=0）；不软删除，不持久化物料名称。外键使用默认 RESTRICT，并有对应支撑索引。

### procurement_order

| 字段 | 类型／约束 | 含义 |
| --- | --- | --- |
| id | 自增主键 | 稳定采购身份 |
| purchase_no | VARCHAR(100)，永久唯一 | 服务端采购单号 |
| supplier_id | ID，FK procurement_supplier(id) | 整张采购单的唯一供应商 |
| work_order_id | ID NULL，FK work_orders(id) | demand 必填、stock 必须为空，由 CHECK 限定 |
| source_type | VARCHAR(30)，CHECK demand／stock | 按需求／独立备料 |
| supplement_reason | VARCHAR(30) NULL，CHECK excess_purchase／quality_replacement | 补因属于整张主单 |
| status | VARCHAR(30) DEFAULT draft，CHECK draft／ordered／completed／cancelled | 采购跟进状态 |
| remark | TEXT NULL | 单据说明 |
| ordered_by / ordered_at | ID NULL，FK users(id)／DATETIME NULL | 实际下单人及时间 |
| 创建／可变审计 | 见本节公共字段 | 主单并发版本 |

业务索引为 `(status,created_at,id)`、`(work_order_id,created_at,id)`、`(supplier_id,created_at,id)`。下单元数据 CHECK 要求人和时间成组：均空时只能 draft／cancelled，均非空时只能 ordered／completed／cancelled；取消保留是否曾下单的真实依据，不从取消状态猜测。普通草稿可修改 supplier_id，补单从创建起固定继承原采购主单供应商。`trg_procurement_order_supplier_frozen` 在旧主单非 draft、曾下单或属于补单时拒绝供应商变化；命令同时在锁内核验草稿及正式冻结边界。

### procurement_order_line

| 字段 | 类型／约束 | 含义 |
| --- | --- | --- |
| id / purchase_order_id | 自增主键／ID，FK procurement_order(id) | 所属采购主单 |
| line_no | INT，CHECK >0 | 固定单内行号 |
| item_id / material_variant_id | ID | FK materials(id)；组合 FK material_variants(id,material_id) |
| item_code_snapshot / material_variant_code_snapshot / unit_snapshot | VARCHAR(100)／VARCHAR(180)／VARCHAR(20) | 身份编码及单位快照 |
| planned_quantity | INT，CHECK 1..99999999 | 本行独立计划采购量，不分摊需求 |
| tax_exclusive_amount / tax_inclusive_amount | VARCHAR(100) NULL | 无税金额／含税金额，均为手填整行总金额文本 |
| status | VARCHAR(30) DEFAULT draft，CHECK draft／open／closed／cancelled | 本行采购跟进状态 |
| origin_order_line_id | ID NULL，自 FK | 补单原采购行 |
| origin_receipt_line_id | ID NULL | 与原采购行组合 FK procurement_receipt_line(id,purchase_order_line_id) |
| supplement_evidence | TEXT NULL | 补单时必填，CHECK trim 后非空 |
| fulfillment_mode | VARCHAR(30) DEFAULT new_arrival，CHECK new_arrival／existing_receipt | 自身新到货或已有到货补购 |
| 创建／可变审计 | 见本节公共字段 | 本行乐观版本 |

唯一键为 `(purchase_order_id,line_no)`、`(purchase_order_id,item_id,material_variant_id)`、`(id,purchase_order_id)`、`(id,item_id,material_variant_id)`；业务索引为 `(origin_order_line_id,id)`。CHECK 要求两个 origin ID 同时空或同时非空，原采购行与 supplement_evidence 同时空或同时非空且说明有效；existing_receipt 必须有两个原来源。补因决定履约方式的跨表关系仍由命令核验，不能只由本行 CHECK 证明。

两项金额由应用 trim，省略、null 或空文本统一为 NULL，不解析数值或参与计算。它们不是数量或库存成本字段，正式下单后与计划一起冻结；补单只保存此次输入，缺省为 NULL，不复制原行金额。`trg_procurement_order_line_amounts_frozen` 以逐字节、NULL 安全比较拒绝非草稿行、非草稿根或曾下单根的金额变化；现有身份、来源和计划冻结继续由命令锁内核验。完整输入语义由[采购订单](purchase-orders.md#明细整行总金额)维护。

### procurement_order_line_source

| 字段 | 类型／约束 | 含义 |
| --- | --- | --- |
| purchase_order_line_id | ID，FK procurement_order_line(id) | 采购行 |
| demand_id | ID，FK production_item_demand(id) | 原正式需求身份 |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | 关系建立时间 |

复合主键 `(purchase_order_line_id,demand_id)`；反查索引 `(demand_id,purchase_order_line_id)`。不存分摊数量、独立版本或物料快照；需求实际工单及身份相符仍由 Production 公开资格在采购事务内校验。

source 和 supplier 等跨行归属在锁内校验，不借展示查询判断资格。两种补单行都保存 origin_order_line_id、origin_receipt_line_id 和非空 supplement_evidence；原到货与原采购行由组合 FK 保证同源，原采购与原到货的空值成对。采购行不保存 origin_allocation_id 或具体实际退回引用。质量新建资格由到货明细上的当前正式质量退回或真实质量退回历史提供，仓库实际退回仍保留自己的分配引用。采购状态、原因及人员时间通过平台 `operation_logs` 追溯，成功审计使用[统一事务 Writer](../../../../docs/audit.md)。

同一原采购主单、同一 supplement_reason 可生成多行补单；补因和唯一供应商属于主单，原采购行、原到货和约定说明属于各行。每行仅一份原到货，同单 `(item_id,material_variant_id)` 唯一；不跨原采购主单合并或混合补因。创建核验来源及新建资格，下单只核验固定身份、未作废及采购资格；草稿改量及金额保留供应商与各行来源。

`202610190001-purchase-order-state-simplification` 的 up 在永久 DDL 前要求采购主单和旧关闭快照表为空，再移除旧关闭快照表及触发器；down 要求采购主单为空后仅恢复空的旧关闭快照结构，不能从当前状态或通用日志猜造关闭数量快照。开发库通过统一 migration／seed 重建。迁移不修改采购主行身份、数量、来源、权限目录或通用操作日志。

## 到货、整批轮次与 Quality 关联

到货主单、明细、实收修订、处理轮次、正式清单、分配及真实退回七表的完整字段、空值、键、索引、外键及触发器统一由[到货链表设计](database/receipts.md)维护。数量公式、去向、轮次继承及执行授权由[正式清单](receipt-acceptance.md)维护，不将职责摘要代替表设计。

Quality 的来料分组主单与当前关联、逐来源 case／record 均由 [Quality 数据库](../../quality/docs/database.md)所有，Procurement 不写其表；分组不在到货主表复制指针，不改变逐来源检查和处理轮次。Inventory 的采购入库明细保存原到货、实收修订、检验及分配引用，同一 allocation 可分次实际入库，库存流水仍是唯一库存事实。

`202609220001-receipt-processing-rounds`、`202609230001-receipt-allocations` 的 up/down 在永久 DDL 前保护既有到货事实，不猜历史范围、不双写。`202609240001-unified-inbound-allocation-target` 移除到货行单一库存批次，实际目标沿逐笔入库明细追溯。`202610190002-procurement-receipt-void` 以空到货主单守卫增加一次性作废、修改审计及版本，保留原登记和不可变事实；down 还拒绝任何作废终止轮。开发环境通过统一初始化重建，停写、回退及失败恢复见[迁移安全](../../../../../../packages/database/docs/migration-safety.md)。

## 单工单、主单供应商与来源约束

Quality 的 quality_inspection_case/record 与 Inventory 表由各自模块所有。供应商唯一来源为 procurement_order.supplier_id，不在采购行、到货、实收修订、处理轮、正式分配、质量结论或退回表建立独立可修改的供应商字段。

需求所属工单沿 `production_item_demand → production_batches → work_orders` 解析，不能仅靠 `work_order_id` 外键证明来源相符。普通按需草稿保存和正式下单均须通过 Production 公开能力核对来源资格，并检查全部来源属于同一指定工单；普通备料的 work_order_id 为 NULL、无需求映射。按需补单继承原行来源及原主单工单、供应商，核对原始归属，不对已结束工单或已关闭需求重新要求普通采购资格。同一需求可关联不同采购单，不表示数量分摊。同一主单完全相同的物料、精确版本只保留一行，来源去重，由用户核对最终计划量；后端拒绝重复行。

应用继续限制每单最多 100 行及合计 100 条来源映射，不放宽为每行各 100 条。来源表复合主键继续禁止同一行重复需求，Production 公开校验输入则按需求 ID 去重。

到货主表不新增 supplier_id。供应商身份统一沿 `procurement_receipt_line.purchase_order_line_id → procurement_order_line.purchase_order_id → procurement_order.supplier_id` 取得；同源组合 FK 保证到货自身采购主单与来源采购行一致。每张到货只有其采购主单的唯一供应商，概览返回单个 supplierId/supplierName。来料质检分组仍可关联跨采购、跨供应商的完整到货，外购实际入库仍允许跨供应商合单；这些后续组织边界不改变采购主单身份。补单原行 FK、到货归属组合 FK 与来源 FK 均引用本章采购表。

HTTP 资源使用 `/procurement/purchase-orders`，领域使用 `PurchaseOrder`，稳定来源 ID 保持采购语义；数据库表统一使用 `procurement_` 前缀。

采购和到货的历史供应商名称按稳定 supplier_id 读取当前名称，历史读取不因主数据软删除丢失；写入资格继续要求供应商有效。Inventory 的[入库明细供应商名称快照](../../inventory/docs/database/inventory-ledger-and-inbound.md#9-inbound_detail)与既有批次 provider 文本只表达历史来源，不作为供应商身份，也不反推 supplier_id；已确认明细、批次及审计中的历史文本不因供应商改名回写。基础物料名称继续按当前主数据展示，不新增名称快照。

本项目处于开发阶段，允许完全重置数据库，无需保留兼容性数据。结构变更追加成对 migration，并同步 FK、唯一键、索引及 `scripts/api-data-ownership.mjs`；所有权登记保留旧表名的历史所有者。不能从旧多供应商采购行任取一行作为主单供应商，也不建立新旧字段双写。开发库从空库执行统一 migration／seed 恢复。

## 正式分配、履约与退回引用

采购行 fulfillment_mode 为 new_arrival/existing_receipt。普通采购和质量补单为 new_arrival，登记自身真实到货；超量补单为 existing_receipt，只记录已有到货补购，不统计自身物流。履约方式由补因明确决定，不从分配引用有无推导。到货及所有分配的采购来源固定为 receipt_line.purchase_order_line_id。

质量补单只引用原到货明细；新建要求该到货有当前有效正式质量退回或真实质量退回历史，人工拒收不提供资格。既有引用继续办理不重新套新建资格。仓库正常入库／退回仍直接关联不可变 allocation，历史实际执行保留，仅当前轮授权余额可以继续执行。采购行来源不替代仓库授权。其余规则见[到货命令](receipts.md)和[正式清单](receipt-acceptance.md)。

## 补单与物流解耦迁移

`202610200001-procurement-supplement-logistics-decoupling` 删除 allocation 的 purchase_order_line_id、对应采购 FK／索引及 owner 必填 CHECK，并重建 Inventory 入库明细 INSERT／UPDATE 守卫，采购身份沿 receipt_line 解析。不可变分配、同源引用、真实执行及其他入库场景的守卫继续有效。up/down 均在永久 DDL 前拒绝已有 allocation、supplier_return、采购 inbound_detail 或含 origin_receipt_line_id 的补单；开发库按统一初始化重建，不转换历史归属。回滚只恢复空的旧字段和原触发器，不伪造承接关系。具体执行边界见[迁移安全](../../../../../../packages/database/docs/migration-safety.md#202610200001补单与到货物流解耦)。

## 质量补单到货来源迁移

`202610200002-quality-supplement-receipt-source` 只删除采购行 origin_allocation_id、对应同源外键／支撑索引及质量分配引用 CHECK，保留原采购、原到货、建单说明、采购状态／数量／版本及所有物流事实，补充原采购和原到货空值成对 CHECK。up 允许已有补单，不重置数据，不改写审计和 HTTP 幂等历史。down 在永久 DDL 前拒绝已有质量补单，不能从到货或日志猜造旧分配引用；仅在无质量补单时恢复空列及旧约束。执行边界见[迁移安全](../../../../../../packages/database/docs/migration-safety.md#202610200002质量补单到货来源)。

## 主单供应商与金额迁移

`202610280002-purchase-order-supplier-and-amounts` 新增主单 supplier_id 及其 FK／查询索引，移除行 supplier_id 及其 FK／索引，将同单行身份唯一键缩为物料与精确版本，并新增两项可空金额文本及上述冻结触发器。up/down 均在永久 DDL 前要求采购主行、到货主单、采购来源入库明细和全部 HTTP 幂等记录为空，不推导旧主单供应商、不回填金额或改写库存历史。down 仅在守卫通过后恢复空的逐行供应商结构并移除新字段和触发器；当前 Inventory 来源触发器不依赖采购行供应商，无需替换。停写及恢复顺序见[迁移安全](../../../../../../packages/database/docs/migration-safety.md#202610280002采购主单供应商与明细金额)，开发样例由[演示入口](../../../../../../packages/database/demo/README.md)重建。
