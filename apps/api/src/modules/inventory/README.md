# Inventory

Inventory 是现有库存能力的唯一所有者，Production 和 Procurement 通过公开端口在同一事务内调用。协作边界见[库存事务协议](../../../../../docs/inventory-extraction-design.md)。采购入库以到货及 Quality 明确放行为来源，旧手工外购写入口已移除。

职责是唯一库存批次、入库单据、库存流水、余额投影及现有物料盘点。仍是单 API、单数据库的模块化单体；不增加通用其他出入库、销售、委外、库存报废或状态转移。

## 数据所有权与来源职责

Inventory 拥有 `item_batch`、`inventory_transaction`、`inventory_batch_balance`、`inventory_material_variant_balance`、`inbound_order/detail`、`stock_check_order/detail` 八张现行表。历史 `inventory_item_balance` 只迁移所有权登记，不恢复结构。表设计索引见[数据库边界](docs/database.md)。

Production 保留工单、任务、需求、分配、领料、退料、损耗、结案及批准产出；Procurement 保留采购、到货、实收修订与退供应商；Quality 保有来料及成品检验、复检和放行结论。来源模块在同池事务中校验资格并调用 Inventory，不能直接写入库存表。库存不回调来源模块决定业务资格。

基础物料名称展示和历史身份统一遵守[数据库公共规则](../../../../../docs/database-conventions.md#基础物料名称与历史身份)，当前名称不替代精确版本、编码及单位快照，也不作为写入资格。

## 公开能力与原子性

公开入口 [`public.ts`](public.ts) 导出窄 application 能力：`InventoryStockCommand` 负责批次锁、生产出库和退料流水；`InventoryInboundCommand` 负责成品入库及采购实际确认；`InventoryInboundQuery` 提供采购到货累计入库事实；`InventoryInboundRepository` 只提供现有入库／库存和历史查询。盘点为 Inventory 自有独立用例。端口不传数据库连接或 SDK 类型。

公开 adapter 通过现有 `withTransaction/withActiveConnection` 加入同一 `DATABASE_POOL` 事务。来源单据、库存流水、触发器余额、审计和已启用 HTTP 幂等记录一起提交，失败整体回滚。`inventory_transaction` 是唯一库存事实，禁止独立更新余额；累计已入量按历史实际入库事实统计，不由当前余额反推。

带锁读取要求已有活跃同池事务；父身份先锁、库存批次后锁，锁内重新核对来源。精确端口、当前读及 nullable 身份契约见[公开能力](docs/public-contracts.md)，完整跨模块锁序见[库存事务协议](../../../../../docs/inventory-extraction-design.md#7-事务与锁序)。

## 接口与范围保持

提取保留当前库存、盘点及成品入库的 HTTP 路径、权限和页面入口。成品继续按批准清单每类收齐一次确认；生产退料回原批次的公共可用库存；盘点只处理已有正库存物料批次与库存状态，不顺带引入成品盘点或预留保护。

采购入库选择已批准且有余量的具体到货范围、核对本次数量并确认，直接生成已完成入库单。首次实际确认生成原 `item_batch.batch_code` 并由 Procurement 同事务绑定到货明细；后续沿用同一批次。旧 `/production/purchase-inbounds` 的创建、确认和取消 POST 路由已移除，仅保留 GET；成品草稿流程继续由原独立入口办理。

采购确认参数及历史实际入库查询契约由[公开能力](docs/public-contracts.md#采购入库协议)维护，库存字段及状态由[数据库文档](docs/database.md)维护。预留枚举不表示对应业务命令已开放。

## 验证与数据库约定

本项目目前处于开发阶段，允许随时完全重置数据库，不保留兼容性数据；数据库结构变更仅追加 migration，不双写或建影子表。数据库连接由环境配置提供，初始化与运行约定见[数据库包](../../../../../packages/database/README.md)，不绑定某个开发工作区的服务地址或部署方式。

代码交付与正式测试顺序遵守 [AGENTS.md](../../../../../AGENTS.md#数据库与交付约定)；待办及验收状态统一维护于[路线图](../../../../../docs/roadmap.md)。
