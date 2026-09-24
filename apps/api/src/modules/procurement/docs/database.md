# Procurement 数据库

本文维护当前采购字段与约束。检后核实数量、建议公式、不可变主从、采购分配及范围约束由[来料正式清单](receipt-acceptance.md)维护；跨模块选择理由见 [ADR-0015](../../../../../../docs/adr/0015-unified-quality-quantity-semantics.md)。

遵守[数据库公共规则](../../../../../../docs/database-conventions.md)。拥有供应商和采购主行、来源及关闭表，以及到货、实收修订、整批处理轮次、正式清单/分配与供应商退回表，登记于 `scripts/api-data-ownership.mjs`；不写需求、库存或 Product 主数据表。

当前采购表统一使用 `procurement_` 前缀。主单按需来源固定一个工单，各采购行保存实际供应商；来源不含分摊数量。

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

`202609190002` 建立采购单据，`202609200002-procurement-order-sources` 追加迁移切换为以下四表，同为 InnoDB、utf8mb4_0900_ai_ci、BIGINT UNSIGNED ID。可变主行具备 created_by/at、updated_by/at、version，人员 FK 指向 users；数量 INT 且 CHECK 限制 0～99999999（计划必须 >0），不持久化物料名称。

| 表 | 字段与约束 |
| --- | --- |
| procurement_order | 自增 id；永久唯一 purchase_no VARCHAR(100)；work_order_id FK，demand 必填、stock 为空；source_type demand/stock；supplement_reason excess_purchase/quality_replacement 或 NULL；status draft/ordered/completed/cancelled；remark TEXT；ordered_by/at 成组；索引(status,created_at,id)、(work_order_id,created_at,id) |
| procurement_order_line | id、purchase_order_id FK、正 line_no；supplier_id FK；item_id FK、material_variant_id 与 item_id 组合 FK；item_code_snapshot VARCHAR(100)、material_variant_code_snapshot VARCHAR(180)、unit_snapshot VARCHAR(20)；planned_quantity INT；status draft/open/closed/cancelled；可空 origin_order_line_id 自FK及非空 supplement_evidence 成组；唯一(单,line_no)、(单,item,variant,supplier)、(id,单)、(id,item,variant)，原行与供应商组合索引 |
| procurement_order_line_source | 联合PK(purchase_order_line_id,demand_id)，分别FK采购行、Production需求；created_at；反查索引(demand_id,purchase_order_line_id)，无采购分摊量 |
| procurement_order_line_closure | id、唯一purchase_order_line_id FK；reason_type为4种关闭原因；manual_end/cancelled原因非空；planned/received/undetermined/approved/inbound/return_due/returned/quality_returned_quantity整数；evidence_json冻结依据；created_by/at；触发器拒绝更新和删除 |

source 和 supplier 等跨行归属在锁内校验，不借展示查询判断资格。采购行当前保存 origin_receipt_line_id（同原采购行组合FK）和 origin_allocation_id（同到货正式分配组合FK）。质量处置引用必须同时有原采购行/原到货且履约方式为 new_arrival；补发依据 supplement_evidence 必填。实际退回通过分配反查，不再在采购行保存 origin_supplier_return_id。关闭事实只冻结关闭证据，累计入库始终由 Inventory 流水事实决定。

down 首先要求采购根为空，之后依赖顺序删除触发器、关闭／来源／行／主单和6个订单权限。迁移不写角色或业务种子。已执行 migration 不修改；开发环境允许按统一命令重置。

## 到货、整批轮次与 Quality 关联

当前六表结构由追加的 `202609230001-receipt-allocations` 切换，完整职责和字段见[正式清单](receipt-acceptance.md)。原 scope 删除，acceptance_line 替换为 allocation，不兼容双写。

| 表 | 类型与关键约束 |
| --- | --- |
| procurement_receipt | 不可变交接事实；唯一 receipt_no、采购根、真实时间／凭据、创建审计 |
| procurement_receipt_line | 可变聚合；精确身份及原采购行固定；current_revision/current_round 同到货 FK；batch 首次绑定；M审计/version |
| procurement_receipt_revision | 不可变本次到货核实总量；同明细 revision_no 唯一、previous_revision_id 同源、非负 T、同批确认及原因 |
| procurement_receipt_round | 可变资格；同明细 round_no 唯一；previous/source_allocation_round_id 同到货 FK；起始 revision/starting_quantity；当前 QC；原因及 M审计/version |
| procurement_receipt_acceptance | 不可变定稿；每 round 唯一、同到货；正常 QC 必填；前后 revision、C、override_reason、previous_acceptance及创建审计 |
| procurement_receipt_allocation | 不可变去向授权；同轮 line_no 唯一；同到货 round FK、普通 acceptance 同轮组合 FK；owner、正 quantity、去向及原因、termination_reason、创建审计 |
| procurement_supplier_return | 不可变真实退回；唯一 return_no/allocation_id；同到货 allocation FK、revision、数量／时间／凭据；非人工拒收必须 QC |

round.status 为 uninspected/reviewing/reinspection_required/quality_rejected/awaiting_acceptance/finalized/superseded；trigger_type 为 receipt/receipt_correction/review/acceptance_correction/manual_rejection/rejection_revocation。状态与方法 full/sampling 分开。旧轮 superseded 即收回其全部剩余授权，allocation 自身不改状态、不拆子行。source_allocation_round_id 只继承采购归属／终止约束；经过已定稿零剩余且无分配的轮次必须清空，不能恢复更老授权。

allocation.disposition 只有 inbound/return/pending；return_reason 为 quality/excess/procurement_termination/manual_rejection。正常 acceptance 必填，只有 return/manual_rejection 可为空；应用必须同时核对当前 manual_rejection 轮。拒收原因／人／时间来自轮次不可覆盖的创建依据，实际退回不修改拒收事实。已有终止约束在拒收分配的 termination_reason 保留。

T 是这一次到货总量；U=T−真实已入I−真实已退B，T≥I+B。starting_quantity 是新轮起始 U。普通定稿核对 C 后追加 T=I+B+C 的 revision；acceptance 记录前后版本，起始轮次快照不改。改量后回待检；拒收撤销不改量、不新增 revision；零剩余可直接办结，无零质检／零分配。

Inventory inbound_detail 保存 procurement_receipt_line_id/receipt_revision_id/inspection_id/allocation_id，采购来源四项成组非空并保留同源组合FK；allocation_id 为非唯一索引，允许多次实际入库，库存流水仍唯一事实。supplier_return.allocation_id 唯一，当前一次办理全部退回余量。成品分支不变。

新迁移 up/down 在有相关 receipt 事实时于 DDL 前拒绝；开发库必要时由统一 db:init 重建。迁移成对追加，旧文件不改，不猜旧范围关系。MySQL DDL 不可声称整体回滚，回退也拒绝丢失新事实。当前及历史表分别登记所有权。

## 单工单、逐行供应商与来源约束

Quality 当前两表为quality_inspection_case/record，Inventory原表仍由各自模块所有。四张旧采购表通过 `202609200002` 直接改名，既有到货、来源、关闭及补单组合外键由 MySQL 保持引用；无别名表或双写。up/down 都要求采购业务为空，拒绝推测旧跨工单归属或把头供应商复制成新逐行确认。

需求所属工单沿 `production_item_demand → production_batches → work_orders` 解析，不能仅靠 `work_order_id` 外键证明来源相符。普通按需草稿保存和正式下单均须通过 Production 公开能力核对来源资格，并检查全部来源属于同一指定工单；普通备料的 work_order_id 为 NULL、无需求映射。按需补单继承原行来源及原主单工单，核对原始归属，不对已结束工单或已关闭需求重新要求普通采购资格。来源关系允许同一需求关联同物料版本、不同供应商的多行，仍不表示数量分摊。同一主单完全相同的物料、精确版本、供应商只保留一行，合并时去重来源，由用户核对并填写该行最终计划量；后端拒绝未归并的重复行。

应用继续限制每单最多 100 行及合计 100 条来源映射；同需求关联不同供应商行分别计数，不放宽为每行各 100 条。来源表复合主键继续禁止同一行重复需求，Production 公开校验输入则按需求 ID 去重。

到货主表不新增 supplier_id。供应商身份统一沿 `procurement_receipt_line.purchase_order_line_id → procurement_order_line.supplier_id` 取得，采购行正式下单后供应商不可变。到货概览展示来源明细的供应商集合，每行显示具体供应商；不能继续以采购头或第一条明细代表整张到货。实收修订、范围、质量结论和退回均沿原到货明细追溯，不复制可独立修改的供应商字段。补单原行 FK、到货归属组合 FK、关闭与来源 FK 均引用改名后的表。

既有六张 `procurement_` 表不改名；HTTP `/procurement/purchase-orders`、领域 `PurchaseOrder` 及稳定来源 ID 术语继续使用。表名前缀统一不要求改写所有 API 名称。

采购和到货的历史供应商名称按稳定 supplier_id 读取当前名称，历史读取不因主数据软删除丢失；写入资格继续要求供应商有效。现有 Inventory `provider` 是文本来源资料，不作为供应商身份，也不反推 supplier_id；已确认批次、入库及审计中的历史文本不因供应商改名回写。基础物料名称继续按当前主数据展示，不新增名称快照。

本项目处于开发阶段，允许完全重置数据库，无需保留兼容性数据。通过成对 migration 统一调整表名、FK、唯一键、索引、触发器引用及 `scripts/api-data-ownership.mjs`，不修改既有 190001/190002/190004 文件；所有权登记增加当前新表名，并按登记规则保留旧名的历史所有权，不能让旧名成为无所有者对象。新迁移前置检查拒绝未清空且不符合目标结构的旧采购链，不能静默删除事实、批量复制主单供应商冒充新明细确认，或猜测跨工单旧单应归属哪个工单。切换前可重置开发业务数据，再由统一 migration/seed 恢复。

## 正式分配、履约与退回引用

采购行 fulfillment_mode 为 new_arrival/existing_receipt；普通及质量补发另登记真实到货，超量补单承接既有实物。原到货来源固定，正式履约取 allocation.purchase_order_line_id。origin_allocation_id 联合同到货 FK 定位质量补发依据，只有 new_arrival 且关联原采购行／到货才允许填写；具体质量去向和当前效力由事务内校验。

正常入库／退回直接关联 allocation，旧 allocation 的实际执行事实保留；只有当前轮授权余额可以继续执行。质量补发使用有效质量待退分配或其真实质量退回及供应商约定，不绑定必须先发生的退回ID。manual_rejection 可无正常清单／QC，但必须真实拒收分配，不产生质量补发资格。其余规则见[到货命令](receipts.md)和[正式清单](receipt-acceptance.md)。
