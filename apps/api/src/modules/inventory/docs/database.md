# Inventory 数据库边界

本章是库存表的当前所有者索引。库存运行代码与 SQL 所有权登记归 Inventory，字段定义统一在本目录维护，Production 数据库文档只链接库存定义并说明生产来源编排。

公共规则遵守[数据库约定](../../../../../../docs/database-conventions.md)，跨模块接口和锁序遵守[提取技术设计](../../../../../../docs/inventory-extraction-design.md)。

入库数量、库存流水与盘点数量使用 `INT`。`202609190003` 的 `chk_integer_storage_<表名>` 保持单条数量绝对值上限 `99999999`；库存流水与生成的盘点差额允许负数，实盘数量仍可空，原有正数及非零规则继续有效。两张余额投影继续使用 `BIGINT` 承接跨行累计。API 数量字符串统一输出整数，不补小数位。

## 1. 现行表与唯一字段定义

| 当前表所有者 | 表 | 字段／约束权威来源 |
| --- | --- | --- |
| Inventory | `item_batch` | [库存批次](database/inventory-ledger-and-inbound.md#6-item_batch)，包含物料/成品互斥身份 |
| Inventory | `inventory_transaction` | [不可变库存流水](database/inventory-ledger-and-inbound.md#7-inventory_transaction)，成品仅允许正数 `production_inbound` |
| Inventory | `inventory_batch_balance` | [批次余额](database/inventory-ledger-and-inbound.md#71-inventory_batch_balance)，成品 `product_id` 分支与物料 `item_id` 分支互斥 |
| Inventory | `inventory_material_variant_balance` | [精确版本余额](database/inventory-ledger-and-inbound.md#73-inventory_material_variant_balance)，只覆盖物料 |
| Inventory | `inbound_order`、`inbound_detail` | [入库主从表](database/inventory-ledger-and-inbound.md#34-入库表)（含成品字段与约束），整表归属不能按来源拆分 |
| Inventory | `stock_check_order`、`stock_check_detail` | [盘点主从表](database/stock-check.md)，仅现有物料库存批次／库存状态 |
| Inventory，仅历史登记 | `inventory_item_balance` | 已删除投影；保留登记以检查不可修改的历史迁移，不恢复该表 |

`production_item_allocation`、`outbound_order/detail`、`return_order/detail`、`item_scrap`、生产结案及批准产出表继续归 Production。采购到货不是库存批次，采购实收与 Quality 结论不写库存；采购到货表及来料检验表分别见 [Procurement 数据库](../../procurement/docs/database.md)与 [Quality 数据库](../../quality/docs/database.md)，跨模块结构见[采购技术设计](../../../../../../docs/procurement-inbound-technical-design.md)。

## 2. 身份与约束

真实身份链是 `inbound_detail.batch_id → item_batch.id`，内部批号读 `item_batch.batch_code`。物料以 `item_id/material_variant_id` 组合身份传播；成品用独立 `product_id`，不能把产品 ID 写进物料列，也不建立第二套批次或账本。名称读取当前 `materials.material_name`，编码、精确版本与单位继续使用原快照。

`202609170002-finished-goods-inbound` 已使 `inbound_detail.batch_id` 物理可空，但物料分支 CHECK 仍强制非空，只有成品草稿可以暂不绑定库存批次。新采购到货表独立保存可空 `batch_id`；确认时原子建批并生成已完成入库明细，因此无需为并不存在的新外购草稿放宽物料 CHECK。

成品 `inbound_order` 的 `(output_revision_id,production_batch_id,work_order_id,product_id)` 外键继续指向原批准清单；`active_finished_slot` 及其唯一键继续保证同一任务同一类别最多一张有效草稿或已确认单。提取只转移写入所有者，不改变来源资格、数量与永久占位。

主数据引用、批次身份和成品已完成明细的保护触发器全部保留。库存流水不可更新／删除，当前成品不开放冲销。物料冲销字段和数据库能力不等于已开放通用业务操作。

## 3. 事实、投影与锁

`inventory_transaction` 是唯一数量事实。两张余额投影继续由现有 INSERT／清理及批次状态触发器维护，可以从流水重建；Inventory 不提供覆盖余额的命令，也不自行维护第二套库存累计量。

生产可分配量由账面 available 数量减去 Production 有效分配未出库占用计算。预留不是 Inventory 新账本；退料不恢复需求或已履约分配。已确认采购／成品累计入库读取历史入库明细和实际正流水，不因库存领用下降。

锁内库存操作先取得 Product 历史父身份共享锁，再锁库存批次。其原因是流水和余额触发器存在 Product 外键；仅在应用代码中不显式查 Product，仍可能在 INSERT 时隐式取得父锁。该能力不以主数据启用状态排除历史退料／盘点，写入资格仍由各业务来源能力核验。

成品来源、采购范围或生产任务根锁由调用者先持有，Inventory 不反向获取来源业务锁。来源确认、库存写入、成功审计及触发器余额保持现有单连接事务。具体稳定锁序以[提取设计](../../../../../../docs/inventory-extraction-design.md#7-事务与锁序)为准。

## 4. 采购来源引用

`inbound_detail` 保存真实到货明细、实收修订、检验结论与不可变分配引用。`procurement_allocation_id` 使用非唯一索引，同一分配可以多次实际入库，同到货多个分配沿用一个批次；成品专用唯一约束与物料／批次组合外键保持。准确字段维护于[入库明细](database/inventory-ledger-and-inbound.md#9-inbound_detail)。

每个到货明细首次实际入库生成并绑定唯一库存批次；同一确认涉及该到货多个分配时只生成一次。采购层在同一事务将到货 `batch_id` 从空绑定，Inventory 写 `item_batch.batch_code` 与原 `inbound_detail.batch_id`，后续实收修订和复检不更换已绑定批次。

供应商批号留在采购到货追溯字段。采购关闭证据、复核状态、未处置范围与退供应商事实归来源所有者，不放进库存批次状态，不覆盖入库明细或流水。所有外购都须由Procurement核验Quality有效明确放行结论、当前finalized轮次及正式可入余量。来料数量上限取库管正式授权，含有依据的超建议数量，不再以Quality的G或C−F重复封顶；Inventory不能相信客户端合格标记。

## 5. 迁移策略

库存表所有权以 [api-data-ownership.mjs](../../../../../../scripts/api-data-ownership.mjs)登记为准，代码模块调整不改变表身份。结构变更遵守[数据库迁移规则](../../../../../../packages/database/docs/90-migration-order.md)，具体升级/回滚条件见[迁移安全](../../../../../../packages/database/docs/migration-safety.md)。历史表名仅用于迁移登记，不代表当前仍存在相应表。
