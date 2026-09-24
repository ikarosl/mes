# Production

负责工单、生产任务、工序执行及异常处置，拥有生产需求、分配、领退料、损耗、结案和批准产出；通过 [Inventory](../inventory/README.md) 公共能力记账，通过 [Quality](../quality/README.md) 引用独立检验事实。库存、盘点与检验表不归 Production。

## 范围与边界

先读[业务主线](docs/business-workflow.md)，按任务进入[数据库索引](docs/database/README.md)。[模块职责](docs/module-boundaries.md)说明用例分工，[跨模块规则](docs/database/cross-module-rules.md)维护公共能力、锁序与事务边界。代码公开入口为 [public.ts](public.ts)。

| 要修改的内容 | 当前规则入口 |
| --- | --- |
| 工单、任务、批量锁版、研发轮次 | [工单与任务](docs/database/work-orders-and-batches.md) |
| 提需、分配、短批、领料、需求更正 | [需求与履约](docs/database/demand-allocation-and-outbound.md) |
| 派工、SOP、报工、异常、返工、补产 | [生产执行](docs/database/execution-traceability-quality.md) |
| 退料、已领物料损耗 | [退料与损耗](docs/database/return-scrap-and-stocktake.md) |
| 收尾、物料实核、产出清单及审批 | [任务结案](docs/database/production-termination.md) |
| 批准成品入库与类别冻结 | [成品入库](docs/database/finished-goods-inbound.md) |

## 关键不变量

- 批量任务在完整确认初始 BOM 需求时独立冻结版本与供应商提示，同任务同物料保持一个版本。研发无 BOM、路线及工序，首次与后续均手工提需。
- 需求只以 `production_item_demand`、库存只以 `inventory_transaction` 为事实来源。需求身份、原量和已执行物流不覆盖；分配是预留，确认领料才履约并扣库存。
- 确认出库的需求余额、物流、任务状态、短批授权、补料齐套及库存变化原子提交，不能拆为多次提交。
- 批量工序明确派工、明确开始，再以报工达标自动完成。研发按任务级开始和结束；执行结束不等于结案批准或库存入库。

## 提前结束与结案核对

正常执行结束与提前停止共用“草稿 → 独立检验 → 产线核对 → 工单负责人审批”，批准后才完成或终止。负责人在送审时锁内解析并冻结，资格失效不回退到申请人或管理员。物料实核、未决事项、产出及批准更正由[结案设计](docs/database/production-termination.md)维护。

当前质检数量作为建议，不因清单超过建议而阻断保存、送审或批准；明确放行、任务计划内上限与负责人审批仍必需。固定已入基准、剩余范围及发起复检冻结是 [CQ-01 已确认待实施目标](../../../../../docs/documentation-conflicts.md#cq-01)。成品每类收齐后一次入库、已入类别锁量保持。

## 需求纠错与审批

日常更正先审批，生效后关闭旧剩余并按需建立替代；任务收尾先据实逐项处理，再审批结案。两条入口不能混用。Production 注册需求更正和结案场景，Approval 管理流程及决定；完整规则见[需求更正](docs/database/demand-allocation-and-outbound.md#正式需求更正与替代)。

## 采购来源

Production 公开当前需求资格和历史来源，采购量不分摊、不回写需求，也不因库存、预留或既有采购而隐藏需求。当前接口、用途校验及锁序见[采购来源公开能力](docs/database/demand-allocation-and-outbound.md#采购来源公开能力)。

## 验证

文档改动运行根文档检查；代码交付与正式测试阶段遵守 [AGENTS.md](../../../../../AGENTS.md#数据库与交付约定)和[测试策略](../../../../../docs/testing-strategy.md)。当前实现、待实施目标和未验收事项分别标记，不能互相替代。

### 当前物料名称

展示、历史身份及快照例外遵守[数据库公共规则](../../../../../docs/database-conventions.md#基础物料名称与历史身份)。批准的专用查询按所有权登记只读，不代替写入资格。

### 退料、损耗与需求的职责边界

退料回原批次的公共可用库存，不恢复需求履约或改变计划、短批与执行状态。损耗占用可退额度，不自动补料或再次扣库存；额外用料独立提需。各用例允许写入见[职责表](docs/database/return-scrap-and-stocktake.md#业务语义与写入职责)。

### 退料去向与追溯来源

任务追溯展示所用库存批次的真实入库来源，不推断某条历史入库全部被该任务消耗。字段解析和未知来源处理见[生产追溯查询](docs/database/execution-traceability-quality.md#生产追溯查询)。
