# ADR-0019：成品质检只记录检查事实

状态：Accepted。仅取代 [ADR-0015](0015-unified-quality-quantity-semantics.md)与 [ADR-0016](0016-inbound-authorizations-and-stock-batches.md)中成品质检测量整批 C、全检／抽检放行建议 R、累计建议 S 及其产出差异展示的裁决。来料由 Procurement 核实整批 C、计算定稿建议及确认超建议依据的规则不变。当前执行细节由 [Quality 成品检验](../../apps/api/src/modules/quality/docs/finished-inspections.md)、[Production 结案](../../apps/api/src/modules/production/docs/database/production-termination.md)和[管理端成品约束](../../apps/admin-web/docs/finished-inspections.md)维护；实施、运行验证及验收状态见[路线图](../roadmap.md)。

## 决定与理由

成品全检与抽检都由 Quality 只记录实际检查的合格数 G、不合格数 F，自动计算 N=G+F；普通检查 N>0。抽检 G/F 只是样本事实，不外推整批合格量，不产生整批数量差异或抽检合格率展示。零产出保留专用 `zero_confirmation`，G=F=N=0，须明确选择 `released`。待复检或不放行继续阻断正常定稿及入库。Quality 不输入或返回 `coveredQuantity`，不产生 `releasedQuantity` 或 `cumulativeSuggestionQuantity`，也不在质检表单、确认或历史中核算产出差异。

成品数量、类别及报废由 Production 的产线管理员核对，负责人审批；Quality 的 G/F 不自动修改这些数量。仅在 Production 定稿引用 `full+released` 记录时，比较累计计划内目标 A 加累计计划外目标 E，与**原引用检验轮建立时**固定计划内／计划外历史已入基准加 G 的差额，只提示、不阻断保存、送审或批准。沿用旧检验的纯定稿更正继续用该检验原轮基准；抽检与零量核实均不作整批量比较。计划内任务上限、两类别历史已入下限、明确放行、复检旧授权冻结、负责人审批与 Inventory 实际授权消费继续独立强制。此职责划分避免样本推整批或把质检观察误当可入额度。

## 数据与取代边界

共用 `quality_inspection_record.covered_quantity` 物理列保留，新成品和来料记录均写 NULL；成品结果只保存 G/F、方法、结论及不可变来源凭据，N 为派生量。`202610080001-finished-inspection-measurements` 成对迁移调整条件 CHECK；上下行在首个永久 DDL 前要求旧成品检验、批准版、结案审批及根冻结快照为空，不猜测旧整批量或改写历史。结案审批快照切到 `schemaVersion=8`，成品登记幂等命名空间切到 `quality.finished-inspection.record.v3`，旧版本不按新事实语义重放。旧迁移文件保持不变；开发数据经统一初始化入口重建。

本决策保留 ADR-0015／0016 的来源轮次、固定历史已入基准、全部剩余实物办理范围、开始复检即暂停旧剩余授权、不可变历史、分次入库及库存批次分离。它只撤销成品 C/R/S 公式和由此产生的建议字段／展示，不改变来料 C 的库管所有权与 Procurement 定稿建议。
