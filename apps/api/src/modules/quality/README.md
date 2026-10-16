# Quality

Quality 拥有外购来料检验与复核、成品质检及复检的不可变记录和明确放行结论，以及任务工序的现场专检与冲销更正事实。采购实收和到货处置范围属于 Procurement；生产产出草稿、结案审批、批准清单及异常处置属于 Production；实际入库属于 Inventory。

成品检查事实、请求语义及放行资格由[成品检验与放行](docs/finished-inspections.md)维护；来料核实数量、正式授权与建议例外由 Procurement 的[正式清单与整批分配](../procurement/docs/receipt-acceptance.md)维护。[统一检验模型](docs/unified-inspection-model.md)描述来料与成品共用 case/record 的来源边界；[数据库](docs/database.md)为 Quality 数据所有权入口。[工序专检](docs/process-inspections.md)维护独立专检单、结果事实、已处理下限及公开能力。[ADR-0019](../../../../../docs/adr/0019-finished-inspection-measurement-simplification.md)取代旧成品 C/R/S 语义，[ADR-0015](../../../../../docs/adr/0015-unified-quality-quantity-semantics.md)保留其余共同边界。

公开入口为 [public.ts](public.ts)。`QualityInboundCommand` 提供 `startCase`、`completeCase`、`supersedeCases`；调用者必须先锁住到货与当前处理轮次，并在同池活动事务内执行。`QualityInboundQuery` 提供单个到货行的办理历史分页、单个及批量办理详情、在途检查及明确放行依据核验；查询边界见[数据库与查询](docs/database.md#迁移及查询)。公开错误 `QualityCommandError` 仅含稳定代码和业务说明，由调用方 presentation 映射 HTTP。

Quality 不导入或查询 Procurement。它按传入来源保存检验事实并核验自己的记录；当前范围是否仍有效、是否暂停或终止，由 Procurement 锁内校验。`requireReleaseBasis` 不能替代该来源校验。办理的 `reviewing/completed/superseded` 为显式状态，完成与替代均不能恢复。

来料和成品全检／抽检均只填写 G/F，N 自动计算；Quality 不填写整批 C 或放行量。来料由 Procurement 在明确放行后让库管核实 C 及正式分配，超建议量必须留依据。成品仅保留零产出专用核实，要求 G=F=N=0 且明确 `released`；Production 仅在 `full+released` 定稿时按原引用检验轮已入基准与 G 提示累计目标差异。两来源待复检和不放行继续阻断正常定稿。保存检验不写正式分配、退回或库存。

数据字段、约束与审计见[数据库设计](docs/database.md)，当前采购来源见[采购订单](../procurement/docs/purchase-orders.md)，跨模块关系见[采购技术设计](../../../../../docs/procurement-inbound-technical-design.md)。采购事实独立的理由及边界见 [ADR-0013](../../../../../docs/adr/0013-procurement-source-and-stock-boundaries.md)。检验 HTTP 由 Procurement 场景 Controller 使用独立 Quality 权限编排；成品质检则由本模块独立 HTTP 入口办理，同样必须通过来源模块锁内核验。

**采购身份边界**：供应商逐采购行保存，按需求采购限定单工单。Quality 的来源粒度继续为单个到货明细及其修订／整批处理轮次，不合并不同明细或供应商检验。检验页面的 supplierId/supplierName 由 Procurement 查询按原采购行组装，Quality 不新增供应商归属字段、不查询采购表，统一检验表仍由Quality所有。显式复核状态、放行判定和不可变结论规则保持。

验证使用 `corepack pnpm --filter @company/api typecheck`、`corepack pnpm architecture:check` 与 API 构建。交付、用户验收及正式测试顺序遵守 [AGENTS.md](../../../../../AGENTS.md#数据库与交付约定)。

## 工序专检

专检关联任务下具体工序，按现场范围记录全检或抽检 G/F，独立于具体报工。办理列表按工序汇总，工序内分页查看历次检查；冲销一次检查保留工序入口，符合执行资格时可以继续登记。已提交结果通过冲销与替代更正，任务进入结案或已结案后仍允许合法历史更正；产线在生产执行页面通过现有异常处置单处理已核实的不合格数量，由 `QualityProcessInspectionQuery` 提供同源只读依据，`QualityProcessInspectionCommand` 在同一事务维护逐次检查的累计已处理量。HTTP、权限、锁序、数据结构和重复检查边界见[工序专检专题](docs/process-inspections.md)；决策范围见 [ADR-0021](../../../../../docs/adr/0021-process-inspection-and-abnormal-disposition.md)。实施后的手工验收与正式测试状态由[路线图](../../../../../docs/roadmap.md)维护。

## 成品质检

历史分页之外，`GET /quality/finished-inspections/:batchId/records/:recordId` 可按任务与记录 ID 精确读取既存检验事实，供跨页面定位；它沿用历史读取权限，来源不符返回不存在。具体查询边界见[成品检验与放行](docs/finished-inspections.md)。

独立页面与来料质检同级。`GET /quality/finished-inspections` 按任务分页，通过 `stage` 精确筛选当前阶段，省略时返回所有阶段；筛选与阶段含义见[成品检验专题](docs/finished-inspections.md#查询与当前阶段)。`GET /:batchId` 返回当前轮基准、复检原因、当前真实已入与拟复检剩余量、办理资格和最新记录；`GET /:batchId/records` 分页留存历史。`POST /:batchId/actions/start` 启动已建立的待检轮；`POST /:batchId/actions/reinspect` 带当前批准版指针与原因，确认后由 Production 同事务建立并直接启动新轮，旧剩余授权立即失效，无须再点一次开始；`POST /:batchId/actions/record` 新增当前轮检查事实及明确放行结论。页面读写权限分别为 `quality:finished-inspections:view/record`。全检与抽检都只填 G/F，实际检查总数 N 自动相加，普通检查 N>0；不输入或返回整批 C、放行建议及累计建议，也不展示抽检合格率。零产出须专用核实并明确放行，保存时间、说明及凭据；产线申报快照仅作参考，不限制实测总数。

`QualityFinishedInspectionSourceRegistry` 只接受 Production 注册的来源能力；运行时调用其 `beginReinspection/start/prepare/advance`，由 Production 在共享事务锁定工单、任务和结案根、核验草稿及版本并推进自身版本。详情的复检资格和当前剩余量经 Production 来源只读能力核对真实已入，命令再锁内复核；列表投影仅供导航。Quality 不导入 Production，来源命令不通过跨模块 SQL 判断业务资格。Quality 自己创建完成的 `quality_inspection_case` 与不可变 `quality_inspection_record`、核对前驱并写成功审计；任一步失败连同幂等结果回滚。批准或送审期间不能绕过 Production 的更正／撤回流程登记新依据。

`QualityFinishedInspectionQuery.readForCloseout` 提供本任务的不可变记录；Production 在送审和批准时通过来源锁内共享读核对最新引用、明确放行结论和批准快照，定稿差异提示不阻断。`hasForCloseout` 提供只读预览所需的记录存在性，使用边界见[成品检验专题](docs/finished-inspections.md#不可变记录与事务)。`evaluateOutputInspection` 公开纯规则供批准证据严格解析。列表的跨模块只读字段登记于 `scripts/api-data-ownership.mjs`，只做展示、筛选及分页。检验不改变产出三项、报废量、产品额度或库存。

Production 轮次固定建立时计划内／外历史已入基准和剩余范围；Quality case 以 finished_round_id 一轮一份记录。该基准供 Production 授权及全检定稿差异提示使用，不随后续入库或库批变化。实现及待验收分开标注，状态见[路线图](../../../../../docs/roadmap.md)。

字段和数量规则见[成品检验数据库专题](docs/finished-inspections.md)。不建设部分复检叠加额度、完整质量范围树、自动抽样方案或在线质量体系。

来料实际执行引用Procurement不可变allocation。QualityInboundQuery.getCaseByInspection按结果ID定位同源办理，再由requireReleaseBasis在业务事务内校验明确放行；展示查询不能替代此校验。拒收撤销或实收更正只新建来源轮，不恢复旧办理或改写原检查事实。
