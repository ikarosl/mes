# Production 数据库设计

本目录按唯一表所有者维护职责、字段类型与空值／默认、键、索引、CHECK、触发器及生命周期。公共字段、整数数量和时间遵守[数据库约定](../../../../../../../docs/database-conventions.md)，HTTP 与幂等遵守[API 规范](../../../../../../../docs/api-conventions.md)。migration 的物理位置不改变业务所有权。

| 专题                                                  | 所有表与边界                                                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [工单与任务](work-orders-and-batches.md)              | work_orders、production_batches；计划、负责人、开始和人工结束                                                                                              |
| [追踪卡执行](execution-traceability-quality.md)       | batch_step_records、production_tracking_card/visit/quantity_change/abnormality/abnormality_handling/output；逐盘身份及不可变事实                           |
| [需求、分配与领料](demand-allocation-and-outbound.md) | production_material_requirement_basis、production_manual_demand_addition、production_item_demand、production_item_allocation、production_demand_correction |
| [退料与损耗](return-scrap-and-stocktake.md)           | item_scrap；实际退料仍由 Inventory 公共主从拥有                                                                                                            |
| [任务生命周期](production-termination.md)             | 开始、短产／零产／提前结束与收口语义，结构只引用任务表                                                                                                     |
| [成品入库](finished-goods-inbound.md)                 | 最终产出经 Inventory 同事务入库，不复制库存或授权结构                                                                                                      |
| [仓储只读入口](inventory-ledger-and-inbound.md)       | 公共库存与单据宿主，不拥有业务表                                                                                                                           |
| [跨模块规则](cross-module-rules.md)                   | Product、Identity、Inventory、Approval、Procurement 的公开能力边界                                                                                         |

字段表逐列保留当前 SQL 定义；允许 NULL 且未写默认的列默认 NULL，主键自增由数据库生成。约束表列出当前主键、唯一键、查询索引、外键与 CHECK，数据库强制及应用事务保证分别说明。表定义仅在所属专题维护。

实验增量追加 202611090010、202611090040，不修改已有基线、不转换旧生产执行历史。退役旧模型前要求无生产任务，运行环境选择、备份、迁移登记和失败恢复仍遵守[迁移安全](../../../../../../../packages/database/docs/migration-safety.md)。
