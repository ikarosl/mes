# Inventory

负责公共出入库单据、库存批次、唯一库存账本、余额投影和现有物料盘点。Production、Procurement 核验各自来源后调用库存能力；Inventory 不决定需求、质量或批准产出资格。

## 数据所有权与来源职责

表所有权与场景范围见[数据库边界](docs/database.md)，逐表职责、结构及守卫见[库存账本](docs/database/inventory-ledger-and-inbound.md)，盘点见[盘点设计](docs/database/stock-check.md)。

## 公开能力与原子性

代码入口为 [public.ts](public.ts)，调用语义见[公开能力](docs/public-contracts.md)。跨模块事务、稳定锁序及其他出库读取生产预留的例外由[库存协作协议](../../../../../docs/inventory-extraction-design.md)维护。

## 入库与库存边界

[库存场景](docs/database/inventory-ledger-and-inbound.md#六场景来源)区分采购入库、批准成品入库、生产退料、其他入库、生产领料和其他出库；来源履约与库存补差不能混用。

## 验证与数据库约定

运行入口见[数据库包](../../../../../packages/database/README.md)，验证顺序见[测试策略](../../../../../docs/testing-strategy.md)，剩余实施及验收见[路线图](../../../../../docs/roadmap.md)。
