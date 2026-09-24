# Quality

Quality 拥有外购来料检验与复核、成品质检及复检的不可变记录和明确放行结论。采购实收和到货处置范围属于 Procurement；生产产出草稿、结案审批和批准清单属于 Production；实际入库属于 Inventory。

成品数量定义、请求语义及定稿数量建议由[成品检验与放行](docs/finished-inspections.md)维护；来料核实数量、正式授权与建议例外由 Procurement 的[正式清单与整批分配](../procurement/docs/receipt-acceptance.md)维护。[统一检验模型](docs/unified-inspection-model.md)与[数据库](docs/database.md)描述当前 case/record 两表及来源边界；[ADR-0015](../../../../../docs/adr/0015-unified-quality-quantity-semantics.md)保留共同边界、选择理由和取代关系。

公开入口为 [public.ts](public.ts)。`QualityInboundCommand` 提供 `startCase`、`completeCase`、`supersedeCases`；调用者必须先锁住到货与当前处理轮次，并在同池活动事务内执行。`QualityInboundQuery` 提供分页办理记录、单个办理详情及明确放行依据核验。公开错误 `QualityCommandError` 仅含稳定代码和业务说明，由调用方 presentation 映射 HTTP。

Quality 不导入或查询 Procurement。它按传入来源保存检验事实并核验自己的记录；当前范围是否仍有效、是否暂停或终止，由 Procurement 锁内校验。`requireReleaseBasis` 不能替代该来源校验。办理的 `reviewing/completed/superseded` 为显式状态，完成与替代均不能恢复。

来料全检和抽检只填写G/F，N自动计算，Quality不填写整批C或放行量。Procurement在明确放行后由库管核实C及正式分配，超建议量必须留依据；待复检和不放行继续阻断正常定稿。来料不使用zero_confirmation；成品保留独立C与零产出核实，定稿数量差异仅提示，不以检验建议限制最终清单。保存检验不写正式分配、退回或库存。

数据字段、约束与审计见[数据库设计](docs/database.md)，当前采购来源见[采购订单](../procurement/docs/purchase-orders.md)，跨模块关系见[采购技术设计](../../../../../docs/procurement-inbound-technical-design.md)。采购事实独立的理由及边界见 [ADR-0013](../../../../../docs/adr/0013-procurement-source-and-stock-boundaries.md)。检验 HTTP 由 Procurement 场景 Controller 使用独立 Quality 权限编排；成品质检则由本模块独立 HTTP 入口办理，同样必须通过来源模块锁内核验。

**采购身份边界**：供应商逐采购行保存，按需求采购限定单工单。Quality 的来源粒度继续为单个到货明细及其修订／整批处理轮次，不合并不同明细或供应商检验。检验页面的 supplierId/supplierName 由 Procurement 查询按原采购行组装，Quality 不新增供应商归属字段、不查询采购表，统一检验表仍由Quality所有。显式复核状态、放行判定和不可变结论规则保持。

验证使用 `corepack pnpm --filter @company/api typecheck`、`corepack pnpm architecture:check` 与 API 构建。交付、用户验收及正式测试顺序遵守 [AGENTS.md](../../../../../AGENTS.md#数据库与交付约定)。

## 成品质检

独立页面与来料质检同级。`GET /quality/finished-inspections` 按任务分页，支持关键字及待检／已有记录筛选；`GET /:batchId` 返回轻量来源、草稿数量和最新记录；`GET /:batchId/records` 分页留存历史；`POST /:batchId/actions/record` 新增本任务本轮完整范围的检验记录及明确放行结论。页面读写权限分别为 `quality:finished-inspections:view/record`。全检独立填写实检合格与不合格数，抽检另填实际送检整批总量；实际检查总数由两项相加，全检送检总数也由此形成。明确放行时全检建议为实检合格数，抽检建议为整批送检总数减样本不合格数。零产出仍须明确核实，保存时间、说明及凭据；产线申报快照仅作参考，不限制实测总数。

`QualityFinishedInspectionSourceRegistry` 只接受 Production 注册的来源能力；运行时调用其 `prepare/advance`，由 Production 在共享事务锁定工单、任务和结案根、核验草稿及版本并推进自身版本。Quality 不导入 Production，来源命令不通过跨模块 SQL 判断业务资格。Quality自己创建完成的 `quality_inspection_case` 与不可变 `quality_inspection_record`、核对前驱并写成功审计；任一步失败连同幂等结果回滚。批准或送审期间不能绕过 Production 的更正／撤回流程登记新依据。

`QualityFinishedInspectionQuery.readForCloseout` 提供本任务的不可变记录；Production在送审和批准时通过来源锁内共享读核对最新引用、明确放行结论和批准快照，不以派生建议量限制定稿。`evaluateOutputInspection` 公开纯规则供批准证据严格解析。列表的跨模块只读字段登记于 `scripts/api-data-ownership.mjs`，只做展示、筛选及分页。检验不改变产出三项、报废量、产品额度或库存。

**CQ-01 待实施**：固定发起时已入基准、完整剩余范围和复检开始冻结尚未落地，不能用动态已入量伪造累计建议。完整已确认目标由[成品专题](docs/finished-inspections.md#部分已入后的复检已确认目标待实施)维护，实施与验收见[路线图](../../../../../docs/roadmap.md#cq-01成品剩余复检整改)。

字段和数量规则见[成品检验数据库专题](docs/finished-inspections.md)。不建设部分复检叠加额度、完整质量范围树、自动抽样方案或在线质量体系。

来料实际执行引用Procurement不可变allocation。QualityInboundQuery.getCaseByInspection按结果ID定位同源办理，再由requireReleaseBasis在业务事务内校验明确放行；展示查询不能替代此校验。拒收撤销或实收更正只新建来源轮，不恢复旧办理或改写原检查事实。
