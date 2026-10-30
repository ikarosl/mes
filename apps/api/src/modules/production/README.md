# Production

负责工单、生产任务、需求与分配、工序执行、异常处置、结案及批准产出。Production 核验生产来源并编排领退料与成品入库；实际物流和库存归 [Inventory](../inventory/README.md)，检验事实归 [Quality](../quality/README.md)。公开入口为 [public.ts](public.ts)。

## 范围与边界

[业务主线](docs/business-workflow.md)说明办理顺序，[跨模块规则](docs/database/cross-module-rules.md)说明协作分工，[数据库索引](docs/database/README.md)定位当前设计。

| 主题 | 所有者文档 |
| --- | --- |
| 工单、任务、批量锁版、研发轮次 | [工单与任务](docs/database/work-orders-and-batches.md) |
| 提需、分配、分次领料、需求更正与采购来源 | [需求与履约](docs/database/demand-allocation-and-outbound.md) |
| 派工、SOP、报工、专检处理、异常、返工与补产 | [生产执行](docs/database/execution-traceability-quality.md) |
| 退料与已领物料损耗 | [退料与损耗](docs/database/return-scrap-and-stocktake.md) |
| 收尾、物料实核、产出清单及审批 | [任务结案](docs/database/production-termination.md) |
| 批准成品入库与历史依据 | [成品入库](docs/database/finished-goods-inbound.md) |
| 仓储历史、库存与供需读取入口 | [只读入口](docs/database/inventory-ledger-and-inbound.md) |
| 外部来源、事务与锁序 | [跨模块规则](docs/database/cross-module-rules.md) |
