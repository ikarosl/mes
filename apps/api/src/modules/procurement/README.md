# Procurement

轻量采购模块；当前实现供应商、按需求／独立备料采购、两类补单、到货与实收修订、来料检验编排、逐行关闭、退回供应商及分次入库。边界以 [ADR-0013](../../../../../docs/adr/0013-procurement-source-and-stock-boundaries.md)、[业务设计](../../../../../docs/procurement-inbound-design.md)及[技术设计](../../../../../docs/procurement-inbound-technical-design.md)为准。

供应商、采购主单／行／来源映射／关闭事实、到货／修订／范围及退回由本模块独占，其他模块只能通过 `public.ts` 公开能力交互。`ProcurementQuery.listRelatedPurchases` 提供需求关联历史投影；不开放供应商跨模块写能力。SQL 位于 infrastructure，HTTP class DTO 校验输入，application 通过平台幂等编排命令。资格走 Production/Product 公开能力，展示跨表只读限定在已登记的 `infrastructure/queries/`。

- [数据库](docs/database.md)：主数据审计、永久名称唯一键和迁移。
- [供应商接口](docs/suppliers.md)：分页、远程选项、权限和错误。
- [采购订单](docs/purchase-orders.md)：来源、状态、幂等及锁顺序。
- [到货处置](docs/receipts.md)：更正、复检、分次入库与退回。
- [到货查询](docs/receipt-queries.md)：列表、历史分页与只读投影。

验证使用 `corepack pnpm --filter @company/api typecheck`、`corepack pnpm architecture:check`、`corepack pnpm migration:check`。正式测试集按用户验收后的明确通知再编写。
