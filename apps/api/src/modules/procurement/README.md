# Procurement

当前来料核实数量、建议公式、正式授权与整批分配由[正式清单与整批分配](docs/receipt-acceptance.md)维护；检查事实使用 Quality 的[共用检验表](../quality/docs/unified-inspection-model.md)。按同次实物的处理轮次检查，再由库管核实数量、定稿并分配原单/已到货补单及待退，不重复到货。来料检查只记录 G/F 和结论；库管有依据可以确认超建议可入量，实际入库消费正式分配。[ADR-0015](../../../../../docs/adr/0015-unified-quality-quantity-semantics.md)保留这项职责分工的共同边界、选择理由和取代关系。

轻量采购模块；当前实现供应商、按需求／独立备料采购、两类补单、到货与实收修订、来料检验编排、逐行关闭、退回供应商及分次入库。业务协作边界见[业务设计](../../../../../docs/procurement-inbound-design.md)及[技术设计](../../../../../docs/procurement-inbound-technical-design.md)，单工单采购和独立事实来源的决策依据见 [ADR-0013](../../../../../docs/adr/0013-procurement-source-and-stock-boundaries.md)。

采购按单一工单选择正式需求，允许同工单跨任务；独立备料不关联工单或需求。每条采购行手动选择实际供应商，主单返回去重供应商集合；同物料、精确版本和供应商唯一。正式下单冻结工单、各行身份、供应商、计划量和来源，后续需求变化不自动改采购。采购表结构由[数据库所有者文档](docs/database.md)维护；验收安排见[路线图](../../../../../docs/roadmap.md)。

供应商、采购主单／行／来源映射／关闭事实、到货／修订／整批轮次、正式清单／分配及退回由本模块独占，其他模块只能通过 `public.ts` 公开能力交互。`ProcurementQuery.listRelatedPurchases` 提供需求关联历史投影；不开放供应商跨模块写能力。SQL 位于 infrastructure，HTTP class DTO 校验输入，application 通过平台幂等编排命令。资格走 Production/Product 公开能力，展示跨表只读限定在已登记的 `infrastructure/queries/`。

基础物料名称展示和历史身份统一遵守[数据库公共规则](../../../../../docs/database-conventions.md#基础物料名称与历史身份)，当前名称不替代精确版本、编码及单位快照，也不作为写入资格。

- [数据库](docs/database.md)：主数据审计、永久名称唯一键和迁移。
- [供应商接口](docs/suppliers.md)：分页、远程选项、权限和错误。
- [采购订单](docs/purchase-orders.md)：来源、状态、幂等及锁顺序。
- [到货处置](docs/receipts.md)：更正、复检、分次入库与退回。
- [正式清单与整批分配](docs/receipt-acceptance.md)：轮次、数量授权和人工拒收依据。
- [整批处理示例](docs/receipt-round-examples.md)：错误定稿、更正、部分执行及拒收重办的数量和身份。
- [到货查询](docs/receipt-queries.md)：列表、历史分页与只读投影。

验证使用 `corepack pnpm --filter @company/api typecheck`、`corepack pnpm architecture:check`、`corepack pnpm migration:check`。交付、用户验收及正式测试顺序遵守 [AGENTS.md](../../../../../AGENTS.md#数据库与交付约定)。
