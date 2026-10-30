# Procurement 数据库

本文维护采购表的职责、字段、关系和数据库约束，便于查表与排错；变更须与[版本化 migration](../../../../../../packages/database/migrations/)同步。检后核实数量、建议公式、不可变主从、采购分配及范围约束由[来料正式清单](receipt-acceptance.md)维护；跨模块选择理由见 [ADR-0015](../../../../../../docs/adr/0015-unified-quality-quantity-semantics.md)。

遵守[数据库公共规则](../../../../../../docs/database-conventions.md)。拥有供应商和采购主行、来源表，以及到货、实收修订、整批处理轮次、正式清单/分配与供应商退回表，登记于 `scripts/api-data-ownership.mjs`；不写需求、库存或 Product 主数据表。

当前采购表统一使用 `procurement_` 前缀。主单保存唯一供应商，按需来源固定一个工单；采购行不另存供应商，来源不含分摊数量。

## 供应商

`procurement_supplier` 只维护供应商稳定身份和名称，采购主单引用该身份。采用 InnoDB、`utf8mb4_0900_ai_ci`。ID 和人员外键为 `BIGINT UNSIGNED`；时间按北京时间保存。

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

名称维护、并发和错误语义见[供应商接口](suppliers.md)，审计遵循[平台规则](../../../../docs/audit.md)。

供应商迁移只发布目录，不自动授予角色或创建账号；down 要求供应商表为空。

## 采购单据

采购单据由以下三表组成，同为 InnoDB、utf8mb4_0900_ai_ci。所有 ID／外键为 BIGINT UNSIGNED；下文除显式 NULL 外均非空；未写 DEFAULT 的字段无显式默认值。可变主行使用 created_by／updated_by（FK users.id）、created_at／updated_at（DATETIME DEFAULT CURRENT_TIMESTAMP，后者 ON UPDATE CURRENT_TIMESTAMP）及 version（INT DEFAULT 0，CHECK >=0）；不软删除，不持久化物料名称。外键使用默认 RESTRICT，并有对应支撑索引。

### procurement_order

主单表达一次采购意图，统一持有供应商、来源工单、整单补因和下单状态；明细不能各自改变这些归属。

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

每行持有独立计划量、精确物料身份和报价结果；补单行另存原采购与原到货依据。金额输入及计算由[金额契约](purchase-orders.md#明细采购单位单价)维护。

| 字段 | 类型／约束 | 含义 |
| --- | --- | --- |
| id / purchase_order_id | 自增主键／ID，FK procurement_order(id) | 所属采购主单 |
| line_no | INT，CHECK >0 | 固定单内行号 |
| item_id / material_variant_id | ID | FK materials(id)；组合 FK material_variants(id,material_id) |
| item_code_snapshot / material_variant_code_snapshot / unit_snapshot | VARCHAR(100)／VARCHAR(180)／VARCHAR(20) | 身份编码及单位快照 |
| planned_quantity | INT，CHECK 1..99999999 | 本行独立计划采购量，不分摊需求 |
| tax_exclusive_amount / tax_inclusive_amount | VARCHAR(100) NULL | 无税单价／含税单价，均为按采购单位手填的非负十进制字符串 |
| tax_rate_percent | DECIMAL(7,4) NOT NULL DEFAULT 13，CHECK 0..100 | 本行百分比税率 |
| total_amount | VARCHAR(128) NULL | 最终含税总额，规范为 2 位小数字符串 |
| total_amount_source | VARCHAR(16) NULL，CHECK manual／calculated | 总额来源，与 total_amount 成对为空或非空 |
| status | VARCHAR(30) DEFAULT draft，CHECK draft／open／closed／cancelled | 本行采购跟进状态 |
| origin_order_line_id | ID NULL，自 FK | 补单原采购行 |
| origin_receipt_line_id | ID NULL | 与原采购行组合 FK procurement_receipt_line(id,purchase_order_line_id) |
| supplement_evidence | TEXT NULL | 补单时必填，CHECK trim 后非空 |
| fulfillment_mode | VARCHAR(30) DEFAULT new_arrival，CHECK new_arrival／existing_receipt | 自身新到货或已有到货补购 |
| 创建／可变审计 | 见本节公共字段 | 本行乐观版本 |

唯一键为 `(purchase_order_id,line_no)`、`(purchase_order_id,item_id,material_variant_id)`、`(id,purchase_order_id)`、`(id,item_id,material_variant_id)`；业务索引为 `(origin_order_line_id,id)`。CHECK 要求两个 origin ID 同时空或同时非空，原采购行与 supplement_evidence 同时空或同时非空且说明有效；existing_receipt 必须有两个原来源。补因决定履约方式的跨表关系仍由命令核验，不能只由本行 CHECK 证明。

单价列以 CHECK 拒绝非普通十进制或负数文本，不限制其小数位；长度由列上限保证。税率物理使用 DECIMAL，驱动按字符串读取，应用写入前拒绝超范围或超过 4 位小数，不能依赖数据库舍入。总额 CHECK 约束非负、固定 2 位小数，并要求总额及来源同时为 NULL，或总额非 NULL 且来源为 manual／calculated；不能只更新其中一项。最终总额及来源是唯一持久化结果，不另存 manual_total_amount；请求的手填值由来源为 manual 的总额投影恢复。输入默认、推算优先级及舍入规则只由[采购订单](purchase-orders.md#明细采购单位单价)维护。

`trg_procurement_order_line_amounts_frozen` 冻结正式单据的计划量；单价、税率和总额只允许在 ordered／completed 主单下、变更前后均为 open／closed 的行更正，取消单据拒绝。金额文本按逐字节、NULL 安全方式比较；身份与来源冻结仍由命令锁内核验。根／行并发、输入含义及审计见[金额更正](purchase-orders.md#正式下单后的金额更正)。

### procurement_order_line_source

本表记录采购行与正式需求的关联，不表示需求数量如何分摊。

| 字段 | 类型／约束 | 含义 |
| --- | --- | --- |
| purchase_order_line_id | ID，FK procurement_order_line(id) | 采购行 |
| demand_id | ID，FK production_item_demand(id) | 原正式需求身份 |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | 关系建立时间 |

复合主键 `(purchase_order_line_id,demand_id)`；反查索引 `(demand_id,purchase_order_line_id)`。不存分摊数量、独立版本或物料快照；需求实际工单及身份相符仍由 Production 公开资格在采购事务内校验。

补单只存固定原采购行、原到货及建单依据，不存分配或实际退回引用。创建与继续办理的资格不同，完整规则见[采购订单](purchase-orders.md#补单来源与独立物流)。

采购结束、恢复及取消按当前状态和通用日志追溯，不从它们重建旧关闭时的物流数量快照。旧结构切换及回退条件见[迁移安全](../../../../../../packages/database/docs/migration-safety.md#202610190001采购跟进状态简化)。

## 到货、整批轮次与 Quality 关联

到货主单、明细、实收修订、处理轮次、正式清单、分配及真实退回七表的职责、字段、键和触发器由[到货链表设计](database/receipts.md)维护。数量公式、去向、轮次继承及执行授权由[正式清单](receipt-acceptance.md)维护。

Quality 的来料分组主单与当前关联、逐来源 case／record 均由 [Quality 数据库](../../quality/docs/database.md)所有，Procurement 不写其表；分组不在到货主表复制指针，不改变逐来源检查和处理轮次。Inventory 的采购入库明细保存原到货、实收修订、检验及分配引用，同一 allocation 可分次实际入库，库存流水仍是唯一库存事实。

实际库存目标沿逐笔入库明细追溯，到货行不保存单一库存批次。历史结构切换、到货作废及回退限制见[迁移安全](../../../../../../packages/database/docs/migration-safety.md)。

## 单工单、主单供应商与来源约束

供应商唯一来源是采购主单，到货、处理轮、分配和退回沿原采购关联取得，不另存可修改供应商。需求所属工单须由 Production 核验，不能只凭采购主单的工单引用证明来源相符。

同一需求可关联不同采购单，映射不表示数量分摊；每张到货及其明细必须属于同一采购主单。主单身份不随后续检验分组或实际入库组织方式变化。来源资格、单据容量与补单继承见[采购订单](purchase-orders.md#主单供应商与单工单来源)。

采购和到货的历史供应商名称按稳定 supplier_id 读取当前名称，历史读取不因主数据软删除丢失；写入资格继续要求供应商有效。Inventory 的[入库明细供应商名称快照](../../inventory/docs/database/inventory-ledger-and-inbound.md#9-inbound_detail)与既有批次 provider 文本只表达历史来源，不作为供应商身份，也不反推 supplier_id；已确认明细、批次及审计中的历史文本不因供应商改名回写。基础物料名称继续按当前主数据展示，不新增名称快照。

## 正式分配、履约与退回引用

采购行 fulfillment_mode 为 new_arrival/existing_receipt。普通采购和质量补单为 new_arrival，登记自身真实到货；超量补单为 existing_receipt，只记录已有到货补购，不统计自身物流。履约方式由补因明确决定，不从分配引用有无推导。到货及所有分配的采购来源固定为 receipt_line.purchase_order_line_id。

补单来源不是仓库执行授权。实际入库与退回引用不可变分配，只有当前轮剩余额度可继续执行；规则见[到货命令](receipts.md)和[正式清单](receipt-acceptance.md)。

## 补单与物流解耦迁移

物流归属固定取到货自身采购行，不从补单推导分配承接关系。旧结构的空数据守卫、停写及回退要求见[迁移安全](../../../../../../packages/database/docs/migration-safety.md#202610200001补单与到货物流解耦)。

## 质量补单到货来源迁移

质量补单保留原采购、原到货和建单依据；仅凭到货无法还原曾选的仓库分配。保留已有补单的升级及拒绝有损回退的条件见[迁移安全](../../../../../../packages/database/docs/migration-safety.md#202610200002质量补单到货来源)。

## 主单供应商与金额迁移

主单供应商不从旧行猜测，金额和库存历史不自动回填。空数据守卫、停写及恢复要求见[迁移安全](../../../../../../packages/database/docs/migration-safety.md#202610280002采购主单供应商与明细金额)，开发样例见[演示入口](../../../../../../packages/database/demo/README.md)。

## 明细税率与最终总额迁移

当前字段与冻结边界见本章采购行，输入和更正语义见[金额契约](purchase-orders.md#明细采购单位单价)。迁移执行限制分别由[税率与最终总额](../../../../../../packages/database/docs/migration-safety.md#202610280003采购行税率与最终总额)、[税率与总额批量更正](../../../../../../packages/database/docs/migration-safety.md#202610280004采购税率与总额批量更正)和[报价更正](../../../../../../packages/database/docs/migration-safety.md#202610280005采购报价与金额更正)维护；回退结构不撤销已经发生的更正或审计。
