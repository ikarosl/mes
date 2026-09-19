# Inventory

Inventory 是现有库存能力的唯一所有者，Production 和 Procurement 通过公开端口在同一事务内调用。提取边界见[库存提取技术设计](../../../../../docs/inventory-extraction-design.md)。采购入库以到货及 Quality 明确放行为来源，旧手工外购写入口已移除。

职责是唯一库存批次、入库单据、库存流水、余额投影及现有物料盘点。仍是单 API、单数据库的模块化单体；不增加通用其他出入库、销售、委外、库存报废或状态转移。

## 数据所有权与来源职责

Inventory 拥有 `item_batch`、`inventory_transaction`、`inventory_batch_balance`、`inventory_material_variant_balance`、`inbound_order/detail`、`stock_check_order/detail` 八张现行表。历史 `inventory_item_balance` 只迁移所有权登记，不恢复结构。表设计索引见[数据库边界](docs/database.md)。

Production 保留工单、任务、需求、分配、领料、退料、损耗、结案及批准产出；Procurement 保留采购、到货、实收修订与退供应商；Quality 只保有本期采购入库检验。来源模块在同池事务中校验资格并调用 Inventory，不能直接写入库存表。库存不回调来源模块决定业务资格。

## 公开能力与原子性

公开入口 [`public.ts`](public.ts) 导出窄 application 能力：`InventoryStockCommand` 负责批次锁、生产出库和退料流水；`InventoryInboundCommand` 负责成品入库及采购范围确认；`InventoryInboundQuery` 提供采购到货累计入库事实；`InventoryInboundRepository` 只提供现有入库／库存和历史查询。盘点为 Inventory 自有独立用例。端口不传数据库连接或 SDK 类型。

公开 adapter 通过现有 `withTransaction/withActiveConnection` 加入同一 `DATABASE_POOL` 事务。来源单据、库存流水、触发器余额、审计和已启用 HTTP 幂等记录一起提交，失败整体回滚。`inventory_transaction` 是唯一库存事实，禁止独立更新余额；累计已入量按历史实际入库事实统计，不由当前余额反推。

`lockMaterialBatches`、`materialQuantity`、成品类别槽位及带锁收货读取要求调用方已有活跃同池事务；普通引用展示允许在事务外调用。库存批次身份先经 Product 历史引用共享锁，批次状态取 `FOR UPDATE` 当前值，余额投影取 `FOR SHARE` 当前值。`readFinishedReceipts(lock=true)` 同时对入库主从表当前读，不能只锁主单后使用明细快照汇总。

所有库存批次锁先通过 Product `lockHistoricalReferences({references})` 取得父身份共享锁，再锁批次，以兼容流水和余额触发器的外键锁。历史身份锁不等于启用校验；采购和生产领料分别使用其用途资格规则。无锁定位来源后必须在锁内重核，不以展示查询绕过写入资格。

## 接口与范围保持

提取保留当前库存、盘点及成品入库的 HTTP 路径、权限和页面入口。成品继续按批准清单每类收齐一次确认；生产退料回原批次的公共可用库存；盘点只处理已有正库存物料批次与库存状态，不顺带引入成品盘点或预留保护。

采购入库选择已批准且有余量的具体到货范围、核对本次数量并确认，直接生成已完成入库单。首次实际确认生成原 `item_batch.batch_code` 并由 Procurement 同事务绑定到货明细；后续沿用同一批次。旧 `/production/purchase-inbounds` 的创建、确认和取消 POST 路由已移除，仅保留 GET；成品草稿流程继续由原独立入口办理。

`confirmPurchaseReceipt` 输入供应商名称、备注及最多 100 条消费范围，逐条包含到货／修订／检验／范围 ID、精确物料身份与快照、整数字符串数量及可空批次 ID。来源必须先由 Procurement 锁定并验证 Quality 放行，同一批准范围分次入库须先拆出本次数量叶子。Inventory 复核 Product 采购资格及已有批次状态，再原子生成 completed 入库主从单、首次批次、正流水和成功审计；返回入库单 ID／编号与各明细的到货、范围、批次、入库明细和流水 ID。同一调用中同到货多范围只建一个批次，批号为 `IB-北京时间日期-随机唯一段`，入库号前缀为 `PI`。

`getReceiptInboundFacts({receiptLineIds})` 按最多 100 个稳定到货 ID 返回 `{receiptLineId,batchId,batchCode,inboundQuantity,receipts}`。零入库返回空明细和数量 `0`；历史明细逐条保留修订、检验、消费范围、入库单、流水和确认时间。主单必须 completed，正流水须与明细身份、批次、数量、单位及状态匹配；不按最新修订过滤，不读取余额。事务内使用主从事实与批次关联的当前共享读，随后不再申请 Product 锁或写入。

## 验证与数据库约定

本项目目前处于开发阶段，允许随时完全重置数据库，不保留兼容性数据；提取本身不改 schema，采购新增结构仅追加 migration，不双写或建影子表。使用现有本机 SQL 服务，不以启动 Docker 为前置。

实施完成后执行类型检查、构建、API 与管理端启动验证，再由用户进行黑盒和 UI 验收。正式测试集等用户明确通知后编写，并由 Luna MAX 子代理全量验证；当前文档准备不声明这些检查已完成。
