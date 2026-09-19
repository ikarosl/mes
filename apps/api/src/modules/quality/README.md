# Quality

本期仅拥有外购到货的检验办理与不可变结论，不接管 Production 的产出检验，不扩展完整质量体系。采购实收、处置范围和待办编排属于 Procurement，实际入库属于 Inventory。

公开入口为 [public.ts](public.ts)。`QualityInboundCommand` 提供 `startCase`、`completeCase`、`supersedeCases`；调用者必须先锁住到货与范围，并在同池活动事务内执行。`QualityInboundQuery` 提供分页办理记录、单个办理详情及明确放行依据核验。公开错误 `QualityCommandError` 仅含稳定代码和业务说明，由调用方 presentation 映射 HTTP。

Quality 不导入或查询 Procurement。它按传入来源保存检验事实并核验自己的记录；当前范围是否仍有效、是否暂停或终止，由 Procurement 锁内校验。`requireReleaseBasis` 不能替代该来源校验。办理的 `reviewing/completed/superseded` 为显式状态，完成与替代均不能恢复。

全检记录覆盖量内的合格／不合格数量，抽检记录真实样本与样本不良；只有明确选择批准入库并使用 `release` 才产生放行结果。未批准不会自动判退。结果由领域规则计算为放行、质量待退、未判定三部分，合计等于覆盖量；不存在损耗或自动取样扣减。实收更正为零仍须独立 `review_only` 办理和明确核实。

数据字段、约束与审计见 [数据库设计](docs/database.md)，业务规则以 [ADR 0013](../../../../../docs/adr/0013-procurement-source-and-stock-boundaries.md) 及 [采购技术设计](../../../../../docs/procurement-inbound-technical-design.md) 为准。检验 HTTP 由 Procurement 场景 Controller 使用独立 Quality 权限编排；本模块没有可绕过来源校验的公开 HTTP 写入口。

验证使用 `corepack pnpm --filter @company/api typecheck`、`corepack pnpm architecture:check` 与 API 构建。正式测试集按当前项目约定等待手工黑盒及 UI 验收后明确通知再编写。
