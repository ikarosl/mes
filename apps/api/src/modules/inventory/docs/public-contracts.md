# Inventory 公开能力

本文维护 Inventory 的调用者契约；跨模块所有权、事务及完整锁序见[库存协作协议](../../../../../../docs/inventory-extraction-design.md)，表字段及状态见[数据库边界](database.md)。端口只导出协议无关类型，不能传入连接、Executor 或 SQL；正式签名以 application 端口为准。

## 库存与入库命令

`InventoryStockCommand` 承担下列窄能力：

| 方法 | 输入／返回及责任 |
| --- | --- |
| `lockMaterialBatches(ids)` | 无锁定位历史物料／版本后，通过 Product `lockHistoricalReferences({references})` 先锁父身份，再按稳定数字 ID 顺序锁批次并复核身份，返回物料 ID、精确版本、批号、单位、批次状态及现有库存量；不能返回数据库行／连接类型 |
| `recordProductionOutbound(lines, context)` | 已由 Production 验证需求／分配／版本及数量的明细；Inventory 再核对批次身份、状态和总余额，追加 `production_material_outbound` 负流水，保留 `PMO:<order>:<detail>` 防重键 |
| `recordProductionReturn(lines, context)` | 已由 Production 验证可退额度的明细；复用原库存批次，追加 `material_return_inbound` 公共可用库存正流水，保留来源和 `RETURN:<detail>` 防重键 |

预留仍属于 Production。`lockMaterialBatches` 只返回账面数量，不自行减去生产预留；Production 在同一批次锁内合计有效分配的未出库占用并判断可分配量。端口不开放任意 transaction type、任意来源表或通用覆盖余额入口。

`InventoryInboundCommand` 拥有入库表写入及锁定能力：

| 方法组 | 调用者与责任 |
| --- | --- |
| `getFinishedLocator`／`getFinishedOrder`／`listFinishedSlots`／`readFinishedReceipts` | Production 通过不带数据库类型的结果定位任务、锁入库单、核对当前类别有效单据及累计实际入库；其中带锁读取必须由来源锁在先的事务调用 |
| `createFinishedDraft`／`updateFinishedDraft`／`cancelFinishedDraft` | Production 先校验批准来源及在审状态；Inventory 写主从表并校验单据版本／状态，保留取消事实与唯一类别约束 |
| `confirmFinishedReceipt` | Production 在当前来源锁内核对清单 ID 与整类批准量；Inventory 创建原成品批次、绑定明细、写 `production_inbound` 正流水并确认单据；不新增分次成品规则 |
| `confirmPurchaseReceipt` | Procurement 先锁到货／当前轮和正式分配并经 Quality 核对依据，再由 Inventory 创建已完成采购入库主从记录、生成或复用库存批次及正流水；详见下节 |

旧 `/production/purchase-inbounds` 入口只保留 HTTP 查询契约，无采购来源的创建、确认和取消 POST 路由已移除。采购入库由新到货质检流程办理，开发库按统一约定重置，不伪造旧 pending 的采购来源。

`InventoryInboundRepository` 提供现有库存批次、流水和入库历史查询，`InventoryStockCommand.materialBatchReferences` 提供历史批次展示身份。生产命令需要的身份、锁内余额与已入类别读取使用上述公开能力；展示联查遵守[登记协议](../../../../../../docs/inventory-extraction-design.md#6-展示目录与字段白名单)。库存总列表若展示预留量，预留 SQL 只能在已登记只读目录读取 Production 分配／出库，不将其转成 Inventory 预留事实。公开失败使用稳定 `InventoryCommandError`，不导出内部领域错误或 SQL 异常。

盘点使用 `InventoryStockCheckRepository/Service` 独立用例；其业务实现整体迁入 Inventory，不通过 Production 代理写表。

## 当前读取与批次锁

`lockMaterialBatches`、`materialQuantity`、成品类别槽位及带锁收货读取要求调用方已有活跃同池事务；普通引用展示允许在事务外调用。库存批次身份先经 Product 历史引用共享锁，批次状态取 `FOR UPDATE` 当前值，余额投影取 `FOR SHARE` 当前值。`readFinishedReceipts(lock=true)` 同时对入库主从表当前读，不能只锁主单后使用明细快照汇总。

所有库存批次锁先经 Product 历史引用共享锁，再按数值 ID 顺序锁批次。历史锁只验证引用存在，不代替用途资格；停用版本的采购与生产领料采用不同资格。无锁定位后必须在锁内重核。

## 采购入库协议

精确输入及返回类型见[采购入库端口](../application/inventory-purchase-inbound.types.ts)，命令见[InventoryInboundCommand](../application/inventory-inbound.command.ts)。

`confirmPurchaseReceipt` 输入供应商名称、备注及最多 100 条实际入库明细，逐条包含到货／修订／检验／allocation ID、精确物料身份与快照、整数字符串数量及可空批次 ID。来源必须先由 Procurement 锁定当前到货行／轮次，验证 Quality 明确放行和正式分配剩余量。同一 allocation 可分多次入库，不拆分或改写授权行。Inventory 复核 Product 采购资格及已有批次状态，再原子生成 completed 入库主从单、首次批次、正流水和成功审计；返回入库单 ID／编号及各实际明细的到货、allocation、批次、入库明细和流水 ID。同一调用中同到货多分配只建一个批次，批号为 `IB-北京时间日期-随机唯一段`，入库号前缀为 `PI`。

`getReceiptInboundFacts({receiptLineIds})` 按最多 100 个稳定到货 ID 返回 `{receiptLineId,batchId,batchCode,inboundQuantity,receipts}`。零入库返回空明细和数量 `0`；历史明细逐条保留修订、检验、allocation、入库单、流水和确认时间。主单必须 completed，正流水须与明细身份、批次、数量、单位及状态匹配；不按最新修订或轮次过滤，不读取余额。事务内使用主从事实与批次关联的当前共享读，随后不再申请 Product 锁或写入。后续到货更正、复检或拒收只影响未执行资格，不覆盖实际入库事实。

## 身份与查询返回

物料分支使用 itemId/materialVariantId，成品分支使用 productId，两组身份互斥。入库／库存查询的另一分支字段真实返回 null，禁止 String(null) 或用空字符串伪造物料身份。状态枚举可能包含预留用途，公开端口没有开放的事务类型不能据此自行生成库存流水。

InventoryCommandError 是对外稳定失败结果；调用者按业务边界处理，不暴露 SQL 异常或 Inventory 内部领域错误。
