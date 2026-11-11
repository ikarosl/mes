# Procurement 数据库

本文维护采购表的职责、字段、关系及数据库约束，变更与[版本化 migration](../../../../../../packages/database/migrations/)同步。供应商、采购主行、需求映射、到货登记和仓库说明由 Procurement 所有，不写需求、库存或 Product 表；业务协作见[到货与仓库处理](receipts.md)。

遵守[数据库公共规则](../../../../../../docs/database-conventions.md)，所有权登记于 [api-data-ownership.mjs](../../../../../../scripts/api-data-ownership.mjs)。采购表统一 procurement_ 前缀；主单保存唯一供应商，按需来源固定一工单，采购行不另存供应商，需求来源不含分摊数量。

## 供应商

`procurement_supplier` 只维护供应商稳定身份和名称，采购主单引用该身份。采用 InnoDB、`utf8mb4_0900_ai_ci`。ID 和人员外键为 `BIGINT UNSIGNED`；时间按北京时间保存。

| 字段                    | 类型与约束                                                              | 含义                               |
| ----------------------- | ----------------------------------------------------------------------- | ---------------------------------- |
| id                      | 自增主键                                                                | 稳定供应商身份                     |
| supplier_name           | VARCHAR(100) NOT NULL，永久唯一                                         | trim 后的名称；不提供其他业务字段  |
| created_by / updated_by | NOT NULL，FK users(id)                                                  | 创建与最近修改人员                 |
| created_at              | DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP                             | 创建时间                           |
| updated_at              | DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 修改时间                           |
| version                 | INT NOT NULL DEFAULT 0，CHECK >=0                                       | PATCH 乐观锁，成功修改递增一次     |
| is_deleted              | TINYINT NOT NULL DEFAULT 0，CHECK IN(0,1)                               | 主数据软删除标记                   |
| deleted_by / deleted_at | 可空人员 FK / DATETIME                                                  | 与删除标记成组完整；一期无删除入口 |

`uk_procurement_supplier_name(supplier_name)` 不包含删除标记，软删除后仍不能复用名称，大小写及重音等相等性服从数据库排序规则。CHECK 拒绝空名称和首尾普通空格；应用边界 trim 全部标准空白。`idx_procurement_supplier_list(is_deleted,supplier_name,id)` 支持稳定名称排序。人员外键使用默认 RESTRICT；身份创建后不改，名称修改不产生新的供应商 ID。

名称维护、并发和错误语义见[供应商接口](suppliers.md)，审计遵循[平台规则](../../../../docs/audit.md)。

供应商迁移只发布目录，不自动授予角色或创建账号；down 要求供应商表为空。

## 采购单据

采购单据由以下三表组成，同为 InnoDB、utf8mb4_0900_ai_ci。所有 ID／外键为 BIGINT UNSIGNED；下文除显式 NULL 外均非空；未写 DEFAULT 的字段无显式默认值。可变主行使用 created_by／updated_by（FK users.id）、created_at／updated_at（DATETIME DEFAULT CURRENT_TIMESTAMP，后者 ON UPDATE CURRENT_TIMESTAMP）及 version（INT DEFAULT 0，CHECK >=0）；不软删除，不持久化物料名称。外键使用默认 RESTRICT，并有对应支撑索引。

### procurement_order

主单表达一次采购意图，统一持有供应商、来源工单、整单补因和下单状态；明细不能各自改变这些归属。

| 字段                    | 类型／约束                                                            | 含义                                       |
| ----------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| id                      | 自增主键                                                              | 稳定采购身份                               |
| purchase_no             | VARCHAR(100)，永久唯一                                                | 服务端采购单号                             |
| supplier_id             | ID，FK procurement_supplier(id)                                       | 整张采购单的唯一供应商                     |
| work_order_id           | ID NULL，FK work_orders(id)                                           | demand 必填、stock 必须为空，由 CHECK 限定 |
| source_type             | VARCHAR(30)，CHECK demand／stock                                      | 按需求／独立备料                           |
| supplement_reason       | VARCHAR(30) NULL，CHECK excess_purchase／quality_replacement          | 补因属于整张主单                           |
| status                  | VARCHAR(30) DEFAULT draft，CHECK draft／ordered／completed／cancelled | 采购跟进状态                               |
| remark                  | TEXT NULL                                                             | 单据说明                                   |
| ordered_by / ordered_at | ID NULL，FK users(id)／DATETIME NULL                                  | 实际下单人及时间                           |
| 创建／可变审计          | 见本节公共字段                                                        | 主单并发版本                               |

业务索引为 `(status,created_at,id)`、`(work_order_id,created_at,id)`、`(supplier_id,created_at,id)`。下单元数据 CHECK 要求人和时间成组：均空时只能 draft／cancelled，均非空时只能 ordered／completed／cancelled；取消保留是否曾下单的真实依据，不从取消状态猜测。普通草稿可修改 supplier_id，补单从创建起固定继承原采购主单供应商。`trg_procurement_order_supplier_frozen` 在旧主单非 draft、曾下单或属于补单时拒绝供应商变化；命令同时在锁内核验草稿及正式冻结边界。

### procurement_order_line

每行持有独立计划量、精确物料身份和报价结果；补单行另存原采购与原到货依据。金额输入及计算由[金额契约](purchase-orders.md#明细采购单位单价)维护。

| 字段                                                                | 类型／约束                                                           | 含义                                                                  |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| id / purchase_order_id                                              | 自增主键／ID，FK procurement_order(id)                               | 所属采购主单                                                          |
| line_no                                                             | INT，CHECK >0                                                        | 固定单内行号                                                          |
| item_id / material_variant_id                                       | ID                                                                   | FK materials(id)；组合 FK material_variants(id,material_id)           |
| item_code_snapshot / material_variant_code_snapshot / unit_snapshot | VARCHAR(100)／VARCHAR(180)／VARCHAR(20)                              | 身份编码及单位快照                                                    |
| planned_quantity                                                    | INT，CHECK 1..99999999                                               | 本行独立计划采购量，不分摊需求                                        |
| tax_exclusive_amount / tax_inclusive_amount                         | VARCHAR(100) NULL                                                    | 无税单价／含税单价，均为按采购单位手填的非负十进制字符串              |
| tax_rate_percent                                                    | DECIMAL(7,4) NOT NULL DEFAULT 13，CHECK 0..100                       | 本行百分比税率                                                        |
| total_amount                                                        | VARCHAR(128) NULL                                                    | 最终含税总额，规范为 2 位小数字符串                                   |
| total_amount_source                                                 | VARCHAR(16) NULL，CHECK manual／calculated                           | 总额来源，与 total_amount 成对为空或非空                              |
| status                                                              | VARCHAR(30) DEFAULT draft，CHECK draft／open／closed／cancelled      | 本行采购跟进状态                                                      |
| origin_order_line_id                                                | ID NULL，自 FK                                                       | 补单原采购行                                                          |
| origin_receipt_line_id                                              | ID NULL                                                              | 与原采购行组合 FK procurement_receipt_line(id,purchase_order_line_id) |
| supplement_evidence                                                 | TEXT NULL                                                            | 补单时必填，CHECK trim 后非空                                         |
| fulfillment_mode                                                    | VARCHAR(30) DEFAULT new_arrival，CHECK new_arrival／existing_receipt | 自身新到货或已有到货补购                                              |
| 创建／可变审计                                                      | 见本节公共字段                                                       | 本行乐观版本                                                          |

唯一键为 `(purchase_order_id,line_no)`、`(purchase_order_id,item_id,material_variant_id)`、`(id,purchase_order_id)`、`(id,item_id,material_variant_id)`；业务索引为 `(origin_order_line_id,id)`。CHECK 要求两个 origin ID 同时空或同时非空，原采购行与 supplement_evidence 同时空或同时非空且说明有效；existing_receipt 必须有两个原来源。补因决定履约方式的跨表关系仍由命令核验，不能只由本行 CHECK 证明。

单价列以 CHECK 拒绝非普通十进制或负数文本，不限制其小数位；长度由列上限保证。税率物理使用 DECIMAL，驱动按字符串读取，应用写入前拒绝超范围或超过 4 位小数，不能依赖数据库舍入。总额 CHECK 约束非负、固定 2 位小数，并要求总额及来源同时为 NULL，或总额非 NULL 且来源为 manual／calculated；不能只更新其中一项。最终总额及来源是唯一持久化结果，不另存 manual_total_amount；请求的手填值由来源为 manual 的总额投影恢复。输入默认、推算优先级及舍入规则只由[采购订单](purchase-orders.md#明细采购单位单价)维护。

`trg_procurement_order_line_amounts_frozen` 冻结正式单据的计划量；单价、税率和总额只允许在 ordered／completed 主单下、变更前后均为 open／closed 的行更正，取消单据拒绝。金额文本按逐字节、NULL 安全方式比较；身份与来源冻结仍由命令锁内核验。根／行并发、输入含义及审计见[金额更正](purchase-orders.md#正式下单后的金额更正)。

### procurement_order_line_source

本表记录采购行与正式需求的关联，不表示需求数量如何分摊。

| 字段                   | 类型／约束                         | 含义           |
| ---------------------- | ---------------------------------- | -------------- |
| purchase_order_line_id | ID，FK procurement_order_line(id)  | 采购行         |
| demand_id              | ID，FK production_item_demand(id)  | 原正式需求身份 |
| created_at             | DATETIME DEFAULT CURRENT_TIMESTAMP | 关系建立时间   |

复合主键 `(purchase_order_line_id,demand_id)`；反查索引 `(demand_id,purchase_order_line_id)`。不存分摊数量、独立版本或物料快照；需求实际工单及身份相符仍由 Production 公开资格在采购事务内校验。

补单只存固定原采购行、原到货及建单依据，不存分配或实际退回引用。有效来源校验与补因规则见[采购订单](purchase-orders.md#补单来源与独立物流)。

采购结束、恢复及取消按当前状态和通用日志追溯，不从这些动作推造物流数量事实。

## 到货与仓库说明

到货主单、到货明细与仓库说明三表的职责、字段、键及守卫由[到货表](database/receipts.md)维护。Quality 独立报告及分组归 [Quality 数据库](../../quality/docs/database.md)，Procurement 在来源锁内编排公开命令，不写 Quality 表。

实际库存目标沿逐笔入库明细和正流水追溯，到货行没有唯一批次、到货数量、检验轮次或数量授权。Inventory 保存到货来源与供应商确认时名称快照；检验和说明不写库存。

## 单工单、主单供应商与来源约束

供应商唯一身份来自采购主单，到货沿固定原采购取得；需求工单及用途由 Production 校验。每张到货及全部明细属于同一采购主单，检验分组、合并入库和补单不改变该归属。

采购与到货历史供应商沿稳定 supplier_id 读取当前名称，不因软删除丢失；写入仍要求供应商有效。Inventory 入库明细的供应商名称快照和批次 provider 只表达历史文字，不反推身份、不随改名回写。物料名称遵守公共规则。

普通采购和质量补发 fulfillment_mode=new_arrival，登记自身真实到货；超量补购 existing_receipt 只引用已有到货，不新增自身物流或转移原入库。补单仅固定原采购、有效原到货和人工商定依据，规则见[采购订单](purchase-orders.md#补单来源与独立物流)。

## 初始化与回退边界

本实验通过追加 [202611110010](../../../../../../packages/database/migrations/202611110010-warehouse-simplification.up.sql)在独立空库退出旧到货授权结构。任何已有采购业务、旧检查或采购入库均在 DDL 前拒绝，不转换、不清除旧环境数据；此前基线和已登记 migration 保持不可变。down 明确拒绝恢复旧工作流，按[迁移安全](../../../../../../packages/database/docs/migration-safety.md)使用匹配分支的另一独立空库；演示入口见[数据说明](../../../../../../packages/database/demo/README.md)。
