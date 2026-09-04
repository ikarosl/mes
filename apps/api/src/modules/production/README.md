# Production

负责生产工单、批次、工序执行、报工追溯、异常返工、报废补料，以及与生产直接相关的需求、分配、领料出库、窄入库、退料和现有库存盘点链路。

## 范围与边界

- 负责：上述已落地的生产闭环。
- 不负责：通用库存其他出入库/库存报废、Quality 和全链路 Traceability。
- 数据所有权：生产工单、批次、执行事实、生产需求和生产侧单据。
- 公开入口：[`public.ts`](public.ts)；Product 数据只能通过 Product 的 `public.ts` 获取。

## 关键不变量

生产任务创建与 Product BOM 首次锁定同事务；库存事实来自 `inventory_transaction`，需求事实来自
`production_item_demand`；可变单据使用 `version` 乐观锁，不可变执行事实不得更新。生产批次创建时
只冻结 Product BOM 快照，不自动生成可执行需求；管理员必须按 BOM 行逐行明确选择启用的精确
`material_variant_id` 和数量，最后一行确认后批次才进入 `material_pending`。人工补充按具体父需求
写入，需求管理查询保留 normal、manual、补料等全部已生成需求及取消历史，停用版本仍从需求/物流快照展示。

所有新增需求、补料、入库等命令均通过 `IdempotencyExecutor`；涉及新版本选择的写事务在事务内锁定
并重新校验 Product 公共 BOM/启用版本。路线只表达执行顺序，不再提供 route-step BOM 绑定或按工序
自动生成物料需求。

详细流程见 [business-workflow.md](docs/business-workflow.md)，数据库设计见[数据库索引](docs/database/README.md)，范围边界见[全局产品范围](../../../../../docs/product-scope.md)。

## 验证

`corepack pnpm --filter @company/api typecheck` 及 `apps/api` 相邻单元/契约测试。
