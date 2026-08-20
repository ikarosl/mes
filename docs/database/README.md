# Easy MES 数据库设计

本目录是 Easy MES 数据库业务设计的唯一权威来源，延续既有方案 B。为控制单文件规模，表结构和业务规则按领域拆分；下列章节共同构成同一份规范，不得在其他文档中维护平行表定义。

## 规范章节

1. [数据库公共规则](00-foundations.md)：统一审计、时间、类型、状态和库存代码字典。
2. [系统、RBAC 与认证](10-system-rbac-auth.md)：部门、用户、角色、权限、令牌、操作日志和 HTTP 幂等记录。
3. [文件与工艺](20-files-and-process.md)：技术文件、工序、工艺路线和路线用料。
4. [生产与库存](30-production-inventory/README.md)：产品、工单、生产批次、库存、需求、分配、出入库、退料、报废和汇总视图。
5. [生产报工、追溯与质量边界](40-production-traceability-quality.md)：工序执行、不可变报工事实、异常审批与最小整笔返工，以及尚未闭环的质检和成品流转边界。
6. [建表与迁移顺序](90-migration-order.md)：跨表依赖、循环外键和追加 migration 顺序。

## 使用规则

- 数据库设计评审和实现必须从本页进入，并同时遵守公共规则与对应领域章节。
- 同一张表只能在一个领域章节中维护完整定义；其他章节只允许链接或描述跨域关系。
- 数据库变更必须先更新对应章节，再在 `packages/database/migrations` 追加 migration；已执行 migration 不得修改。
- migration、代码、接口契约与本目录不一致时，不得由实现自行选择，必须先完成设计评审并同步规范。
- 尚未完成业务决策的能力必须明确标记边界，不得以推测性字段或状态提前固化。

## 生产流程模型与设计表索引

实现状态口径：

- **已实现**：migration、应用服务与当前对外能力已对齐。
- **数据库已落地**：追加 migration 及共享代码已提供；不等于相应 API、管理端和业务闭环已发布。
- **设计定稿、待迁移**：权威章节已定义表与规则，但当前 migration 尚未建表。
- **边界预留**：只确认流程位置或部分原则，完整表结构尚未闭环，不得提前实现。

```text
production_batches
├─ normal BOM 需求 -> production_item_demand -> production_item_allocation -> outbound_detail
│                                                             └-> inventory_transaction
├─ batch_step_records
   └─ batch_step_reports（每次报工一条不可变事实）
      ├─ normal_quantity -> 临时作为下工序正常放行量
      └─ abnormal_quantity > 0
         └─ batch_step_abnormal_dispositions（每次异常报工一张处置单）
            ├─ rework -> rework_records -> 负责人完成返工并原子追加报工
            └─ scrap plan -> production_scrap_supplement_plan / _line（可编辑方案）
               └─ confirm -> batch_step_scrap_records（工序损失事实）
                          ├─ batch_step_scrap_reproduction_authorization（补产授权）
                          └─ production_material_supplement（补料物流）
                             └─ production_item_demand(scrap_supplement)
                                └─ 分配 -> 确认领料出库 -> inventory_transaction
                                           └─ 补料齐套后授权可执行
└─ 已确认生产领料 -> item_scrap(production_consumed)
                    └─ production_material_supplement(material_loss)
                       └─ production_item_demand(material_loss_supplement)
                          └─ 分配 -> 确认领料出库；不增加产品补产额度
```

| 流程位置 | 设计表 | 事实/职责 | 权威定义 | 当前实现状态 |
| --- | --- | --- | --- | --- |
| 生产计划 | `work_orders` | 生产工单可变聚合 | [产品主数据与生产批次](30-production-inventory/10-master-data-and-batches.md) | 已实现下达、草稿取消、开工联动、显式完工、提前关闭和归档关闭 |
| 生产计划 | `production_batches` | 工单下的生产执行批次 | [产品主数据与生产批次](30-production-inventory/10-master-data-and-batches.md) | 已实现生产中工单继续拆批及未开工、未出库任务取消；已出库/开工禁止取消 |
| 工序执行 | `batch_step_records` | 某批次 × 某工序的可变执行节点 | [生产报工、追溯与质量边界](40-production-traceability-quality.md) | 已实现派工、开工、报工与工序数量状态闭环 |
| 报工事实 | `batch_step_reports` | 每次报工、冲销和更正的不可变事实 | [生产报工、追溯与质量边界](40-production-traceability-quality.md) | 已实现；报废补产按首工序重投并逐工序放行 |
| 异常审批 | `batch_step_abnormal_dispositions` | 每次有效异常报工的独立审批处置单 | [生产报工、追溯与质量边界](40-production-traceability-quality.md) | 返工/报废审批已实现；驳回并更正尚待按新语义改造 |
| 返工 | `rework_records` | 异常处置为可返工后的返工业务单及完成报工来源 | [生产报工、追溯与质量边界](40-production-traceability-quality.md) | 已实现批准、开工与整笔完成；取消状态已预留但当前没有操作入口 |
| 工序报废 | `batch_step_scrap_records` | 审批为不可返工的工序损失 | [生产报工、追溯与质量边界](40-production-traceability-quality.md) | 已落地 |
| 报废补料方案 | `production_scrap_supplement_plan` / `_line` | 正式批准报废前可编辑、可复核且不可分配的补料方案 | [生产需求、分配与领料出库](30-production-inventory/30-demand-allocation-and-outbound.md) | `202608200003`、草稿查询/保存/确认事务及管理端恢复接线已落地；测试待统一补充 |
| 报废补产 | `batch_step_scrap_reproduction_authorization` | 管理员批准后形成的不可变产品补产授权 | [生产报工、追溯与质量边界](40-production-traceability-quality.md) | 已落地；补料齐套后进入路线额度计算 |
| 生产补料 | `production_material_supplement` | 工序报废补产与生产领料损耗共用的补料物流单 | [生产需求、分配与领料出库](30-production-inventory/30-demand-allocation-and-outbound.md) | 双来源已由 `202608200002-production-material-loss-supplement` 落地 |
| 物料需求 | `production_item_demand` | 生产需求唯一事实来源 | [生产需求、分配与领料出库](30-production-inventory/30-demand-allocation-and-outbound.md) | `normal/scrap_supplement/material_loss_supplement` 已实现；`manual_additional` 仅数据库允许 |
| 物料预留 | `production_item_allocation` | 需求到库存批次的分配事实 | [生产需求、分配与领料出库](30-production-inventory/30-demand-allocation-and-outbound.md) | 已实现 |
| 领料出库 | `outbound_order` | 按生产批次组织的出库主单 | [生产需求、分配与领料出库](30-production-inventory/30-demand-allocation-and-outbound.md) | 已实现待确认、整单确认和取消闭环 |
| 领料出库 | `outbound_detail` | 每个分配行的实际出库事实 | [生产需求、分配与领料出库](30-production-inventory/30-demand-allocation-and-outbound.md) | 已实现 |
| 库存扣减 | `inventory_transaction` | 出库后的库存数量唯一事实来源 | [库存批次、库存流水与入库](30-production-inventory/20-inventory-ledger-and-inbound.md) | 已实现当前 Production 库存切片 |
| 生产退料 | `return_order` / `return_detail` | 已确认领料退回公共可用库存 | [退料、报废与盘点](30-production-inventory/40-return-scrap-and-stocktake.md) | 已实现最小闭环；批次专属退回与退料报废未开放 |
| 生产领料损耗 | `item_scrap(production_consumed)` | 已确认领料在生产现场损坏或丢失，并固定一比一触发损耗补料 | [退料、报废与盘点](30-production-inventory/40-return-scrap-and-stocktake.md) | migration、后端、RBAC 与管理端已落地；其他报废场景仍未开放 |
| 库存盘点 | `stock_check_order` / `stock_check_detail` | 账面快照、实盘录入和原子差异调整 | [退料、报废与盘点](30-production-inventory/40-return-scrap-and-stocktake.md) | 已实现现有库存批次与状态维度盘点 |

复核时还必须同时阅读 [跨模块规则](30-production-inventory/90-cross-module-rules.md) 和 [建表与迁移顺序](90-migration-order.md)。表存在只证明持久化结构可用，不证明业务命令、RBAC、审计、界面与下游事务已经闭环。
