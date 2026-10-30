# Inventory 数据库边界

本章是库存表的所有者索引。Inventory 逐表维护职责、字段类型与空值／默认、键、索引、约束及业务不变量，并与对应 [migration](../../../../../../packages/database/migrations/) 同步。Production 只链接库存结构并说明生产来源编排。

公共规则遵守[数据库约定](../../../../../../docs/database-conventions.md)，跨模块接口和锁序遵守[提取技术设计](../../../../../../docs/inventory-extraction-design.md)。

字段表保留 SQL 定义；未标 `NOT NULL` 的列允许空值，未声明默认值的可空列默认 NULL，无默认且不自动生成的必填列由命令提供。键表列出迁移显式定义的约束和索引；未显式建索引的外键由 MySQL 建立必要的支撑索引。

## 1. 现行表与业务规则

| 当前表所有者 | 表 | 逐表结构与业务规则 |
| --- | --- | --- |
| Inventory | `item_batch` | [库存批次](database/inventory-ledger-and-inbound.md#6-item_batch)，包含物料/成品互斥身份 |
| Inventory | `inventory_transaction` | [不可变库存流水](database/inventory-ledger-and-inbound.md#7-inventory_transaction)，含六场景原始流水唯一与生成来源有类型外键 |
| Inventory | `inventory_batch_balance` | [批次余额](database/inventory-ledger-and-inbound.md#71-inventory_batch_balance)，成品 `product_id` 分支与物料 `item_id` 分支互斥 |
| Inventory | `inventory_material_variant_balance` | [精确版本余额](database/inventory-ledger-and-inbound.md#73-inventory_material_variant_balance)，只覆盖物料 |
| Inventory | `inbound_order`、`inbound_detail` | [公共入库主从](database/inventory-ledger-and-inbound.md#34-入库表)，采购、批准成品、生产退料和其他入库 |
| Inventory | `outbound_order`、`outbound_detail` | [公共出库主从](database/inventory-ledger-and-inbound.md#36-出库表)，生产领料和其他出库；整表不能按来源拆写权 |
| Inventory | `stock_check_order`、`stock_check_detail` | [盘点主从表](database/stock-check.md)，仅现有物料库存批次／库存状态 |
| Inventory，仅历史登记 | `inventory_item_balance` | 已删除投影；保留登记以检查不可修改的历史迁移，不恢复该表 |

`production_item_allocation`、生产需求、`item_scrap`、生产结案及批准产出仍归 Production。生产退料使用公共入库主从；Production 编排领退料来源、额度和需求履约，经 Inventory 窄能力写入／锁定实际单据。采购到货不是库存批次，采购实收与 Quality 结论不写库存；采购到货表及来料检验表分别见 [Procurement 数据库](../../procurement/docs/database.md)与 [Quality 数据库](../../quality/docs/database.md)，跨模块结构见[采购技术设计](../../../../../../docs/procurement-inbound-design.md)。

## 2. 身份与约束

物料／成品互斥身份、实际入库目标、来源组合引用及不可变守卫见[库存账本](database/inventory-ledger-and-inbound.md)。批准类别和来源属于实际明细，库存批次不保存唯一供应商、任务或批准版。

## 3. 事实、投影与锁

库存事实与余额维护见[余额投影](database/inventory-ledger-and-inbound.md#74-余额投影维护规则)，预留及生产供需口径见[库存查询](database/inventory-ledger-and-inbound.md#75-库存查询与可分配量)。来源锁、历史父身份锁和库存锁的顺序，以及其他出库的当前预留读取，由[库存事务协议](../../../../../../docs/inventory-extraction-design.md#7-事务与锁序)维护。

## 4. 采购来源引用

实际入库明细保存确认时到货、实收修订、检验与授权依据，历史不随后续更正重挂。组合引用见[入库明细](database/inventory-ledger-and-inbound.md#9-inbound_detail)，调用及历史读取见[公开能力](public-contracts.md#采购和批准成品实际入库)。

## 5. 迁移策略

库存表所有权以 [api-data-ownership.mjs](../../../../../../scripts/api-data-ownership.mjs)登记为准，代码模块调整不改变表身份。结构变更遵守[数据库迁移规则](../../../../../../packages/database/docs/90-migration-order.md)，具体升级/回滚条件见[迁移安全](../../../../../../packages/database/docs/migration-safety.md)。历史表名仅用于迁移登记，不代表当前仍存在相应表。
