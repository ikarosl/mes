# Production

负责工单、生产任务、正式物料需求与分配、冻结工序、每盘追踪卡、随盘异常和最终确认产出。Production 核验生产来源并通过 [Inventory](../inventory/README.md)公开能力同事务办理领退料及正数产出入库；实际库存仍由 Inventory 唯一记账。公开入口为 [public.ts](public.ts)。

## 所有者入口

| 主题                                           | 当前设计                                                      |
| ---------------------------------------------- | ------------------------------------------------------------- |
| 工单、任务、负责人、BOM 选版及研发续轮         | [工单与任务](docs/database/work-orders-and-batches.md)        |
| 正式需求、预留、分次领料与需求更正审批         | [需求与履约](docs/database/demand-allocation-and-outbound.md) |
| 每盘到站、交接报工、异常数量结算与最终产出确认 | [追踪卡执行](docs/database/execution-traceability-quality.md) |
| 任务开始、短产或零产结束及未完安排收口         | [任务生命周期](docs/database/production-termination.md)       |
| 余料退回与已领物料损耗                         | [退料与损耗](docs/database/return-scrap-and-stocktake.md)     |
| 产出与实际入库的同事务协作                     | [成品入库](docs/database/finished-goods-inbound.md)           |
| 仓储页面与库存只读宿主                         | [只读入口](docs/database/inventory-ledger-and-inbound.md)     |
| 跨模块能力、事务和事实边界                     | [跨模块规则](docs/database/cross-module-rules.md)             |

办理顺序见[业务流程](docs/business-workflow.md)，逐表索引见[数据库设计](docs/database/README.md)。管理账号权限与现场人员身份分离，扫码、报工和最终确认统一使用现场人员目录。路线中的中间检验按普通扫码站处理；末站登记现场人员并明确确认，批量按锁定的剩余盘量形成产出，研发手填实际产出。异常与整盘报废边界由追踪卡所有者维护，不经过旧报工或产出结案审批。
