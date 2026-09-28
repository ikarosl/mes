# 未解决冲突索引

本索引维护尚未解决的业务定义或文档与实现差异。各项按证据明确适用范围和待决问题；实现存在只证明当前行为，不能自行撤销原设计。

明确有ADR取代关系的旧工单锁版、研发BOM门禁、损耗自动补料、旧scope树、旧Quality表及旧采购表名已按证据整理，不列为未决冲突。未批准设想和待验收／待正式测试事项见[路线图](roadmap.md)。

| 编号 | 主题 | 类型／当前状态 | 待处理 |
| --- | --- | --- | --- |
| [CQ-02](#cq-02) | 成品当前待检轮次被历史放行结论排除 | 文档与查询实现差异；已观察，待核对修正 | 确认当前待办筛选与轮次办理资格一致，保留历史记录查询 |
| [CP-01](#cp-01) | 报工数量解耦与管理员批量冲销 | 数量、权限下放及批量冲销已确认；实现待整改 | 执行状态及结案后补录待定 |
| [CP-02](#cp-02) | 过程复检关联source_rework_id | 历史提案批准状态待确认；当前明确未定稿 | 保留提案或确认撤回，不提前建模 |
| [CO-01](#co-01) | 产品分类扁平化与树结构 | 旧目标与当前实现冲突；待裁决 | 旧扁平化目标是否仍有效 |
| [CO-02](#co-02) | Identity主数据审计字段 | 公共规范与owner／migration差异；待裁决 | 补齐规范还是明确经批准的例外 |
| [CO-03](#co-03) | 演示工单生成旧业务备注 | 代码残留与已明确新规则冲突；待修正 | 后续修改demo SQL，核对展示及初始化行为 |
| [CO-04](#co-04) | 部署迁移前业务停写 | 执行前置缺口；待明确责任并修正 | 人工维护窗口与脚本自动停写的责任及恢复流程 |

## CQ-01

成品剩余复检的语义已由 [ADR-0015](adr/0015-unified-quality-quantity-semantics.md#成品数量与职责)及 [ADR-0016](adr/0016-inbound-authorizations-and-stock-batches.md)明确：检查排除已入实物，开始重新办理时固定来源已入基准并暂停旧授权；数量建议不限制最终定稿，旧库存事实不改写。原“每类别一次入库／已入类别锁量”由类别历史已入下限和剩余授权替代。

本项不再有待裁决的业务定义。结构切换、整体验证及用户验收的未完成事项集中在[统一整改清单](roadmap.md#成品物料入库统一整改代码核对清单)，不得由已确认规则推断验证通过。完整规则由 [Production](../apps/api/src/modules/production/docs/database/production-termination.md)与 [Quality](../apps/api/src/modules/quality/docs/finished-inspections.md)维护；本锚点仅供旧引用定位。

## CQ-02

**成品检验待办筛选没有纳入当前办理轮次。**

- 规则依据：[成品前端约束“查询与跨页引用”](../apps/admin-web/docs/finished-inspections.md#查询与跨页引用)区分当前轮待检与已有检验历史，允许查询范围重叠；[Quality 成品规则](../apps/api/src/modules/quality/docs/finished-inspections.md#部分已入后的复检与固定范围)要求新检查在当前有效轮次办理，历史事实保留。
- 实现证据：[finished-inspection-tasks.query.ts](../apps/api/src/modules/quality/infrastructure/queries/finished-inspection-tasks.query.ts)从结案根的全部历史取最大检验记录 ID；`pending` 仅按无历史记录或历史最新结论 `pending_reinspection` 筛选，未看当前轮状态。同文件 `canStartInspection`／`canRecordInspection` 又分别采用当前轮 `pending_inspection`／`inspecting`。
- Chrome 观察：2026-09-28 本机成品质检默认待检结果为 0；切已有记录后，`2026-09-28-1 / task_batch-004` 详情显示当前轮 #10 待检且“开始本轮检验”可用，历史 #9 为放行。观察范围及限制见 [UI／UX 评审](ui-ux-review.md)。
- 影响：已有历史放行的新轮待检任务可能从默认工作队列漏出，用户需去历史范围寻找；这不证明历史放行事实错误，也不等于后端允许未检入库。
- 待处理：由 Quality／Production 所有者核对当前待办的具体范围及办理资格，统一筛选与显示；不改写历史记录、不用最新历史结论替代当前轮资格，不在本次评审中自行变更业务语义。实施及验收跟踪在[路线图](roadmap.md#uiux-专项改版前端待验收)。

## CP-01

**报工定位、统一首工上限、员工日常操作权限下放及管理员批量冲销已确认；状态与结案后补录细则待定，当前实现尚未整改。**

- 已确认方向：报工承担执行记录与差异追溯，取消相邻工序实际报工量的硬依赖，保留多次汇总、冲销／原子更正；各道统一采用首工投入上限。日常操作下放到负责工序的员工，管理员提供同任务跨工序批量冲销，保留预览、原子提交与具体依赖保护。完整规则与待确认方案由[执行专题](../apps/api/src/modules/production/docs/database/execution-traceability-quality.md#cp-01-报工整改边界)维护。
- 原冲突证据：生产流程 §14 与执行专题 §4.2.2 原规则为“更正后上游 `effective_normal` 不得小于下游 `effective_normal`”；执行专题 §4.2.3 与[报工 Repository](../apps/api/src/modules/production/infrastructure/mysql-production-reporting.repository.ts)使用下游 `effective_direct_reported`，包含直接正常／异常报工净量、排除返工完成。两者曾在下游异常／返工时给出不同判断，不能视为等义字段。
- 当前实现差异：报工和更正仍受前道实际正常量限制；[开工规则](../apps/api/src/modules/production/domain/production-execution.policy.ts)要求后道开工前前道正常量大于零，[路线数量](../apps/api/src/modules/production/domain/production-route-quantity.policy.ts)和自动完工仍耦合，任务结束由[完工检查](../apps/api/src/modules/production/domain/production-completion.policy.ts)要求末道正常量等于计划量。当前接口仅有单条冲销／更正，管理员批量冲销尚未实现。
- 待决边界：进度目标、员工明确开工／完工／重开，以及结案中或批准后的纯正常报工历史纠错。当前审批冻结报工基准，后续清单更正沿用原核对快照；若开放历史纠错，须区分原审批量和当前净报工，不能覆盖原证据或自动生成新的异常／返工／补料。具体业务引用的合法性仍须校验，权限下放不授予任意修改他人工序的资格。

实施顺序、文档联动与验收场景集中在[CP-01 整改清单](roadmap.md#cp-01报工数量解耦与管理员批量冲销整改)。本项在细则定稿且实现差异消除前保留；清单存在不代表代码、正式测试或用户验收已经完成。

## CP-02

**过程复检与返工的关联尚未成为已批准模型。**

- 一方：[生产流程“八、设计边界说明”](../apps/api/src/modules/production/docs/business-workflow.md#八设计边界说明)保留原设计“复检通过source_rework_id追溯具体返工记录，一个返工可多次复检”；当前已加待确认标记，明确不能据此宣称实现或直接建表。
- 另一方：[执行专题§4.3](../apps/api/src/modules/production/docs/database/execution-traceability-quality.md)明确过程检验、多次／抽样检查、复检和冲销未闭环，不得创建旧草案inspection_records；当前相关契约及migration未建立source_rework_id。来料／成品已落地的Quality不等于过程检验已实现。
- 影响：旧提案的批准或撤回依据尚未明确；当前文档已统一标记未定稿，这不是已实现功能之间的冲突，不能把历史提法当作新增字段或复检接口的授权。
- 待决：该关联保留为未批准设想、还是有遗漏的批准依据；未确认前保留原提法及未定稿标记，不迁入完整过程质量后端。

## CO-01

**产品分类的扁平化目标是否仍有效。**

- 一方：原[供需方案阶段C（保留原句）](../temp/供需预警与生产定义边界最终方案.md)称“根据已确认范围”将产品分类收敛为扁平并移除父分类；[待询问记录](../temp/--待询问.md)也记录移除分类父子层级。
- 另一方：[Product数据库](../apps/api/src/modules/product/docs/database.md)与[分类Repository](../apps/api/src/modules/product/infrastructure/mysql-product-category.repository.ts)保留parent_id、祖先递归及树编辑；[202609170004迁移](../packages/database/migrations/202609170004-rename-item-categories.up.sql)只改表及约束名，保留父级FK。
- 影响：后续分类维护、迁移和demo是否继续允许层级没有一致的目标说明。
- 待决：明确撤回扁平化目标或确认其仍待实施及边界；不能凭当前树代码断定旧目标取消。复制新产品／路线的独立后续入口另列路线图，不合并裁决。

## CO-02

**Identity主数据是否遵循完整操作者审计字段规范。**

- 一方：[数据库公共规范“统一审计规则”](database-conventions.md#统一审计规则)要求主数据具备created_by/updated_by/is_deleted/deleted_by及相应时间。
- 另一方：[Identity数据库§1.1—1.4](../apps/api/src/modules/identity/docs/database.md)和[初始RBAC迁移](../packages/database/migrations/202607200001-rbac-auth.up.sql)中的departments/users/roles/permissions只有created_at/updated_at/deleted_at等既有审计列，没有上述完整字段组；未发现明确Identity豁免。
- 影响：新增／维护身份主数据时，规范与真实schema的审计预期不同。operation_logs的事务审计不能自动视为列级规范豁免。
- 待决：追加迁移补齐，或明确经批准的Identity例外及理由。未裁决前保留双方证据，不将当前缺项默认为已批准例外。

## CO-03

**演示工单备注仍生成已经被取代的业务规则。**

- 已明确规则：[ADR-0014](adr/0014-task-material-policy-and-output-inspection.md#任务与物料)是每任务锁版、研发无BOM手工提需；[demo README](../packages/database/demo/README.md)已按此说明。
- 残留实现：[020-production-demo.sql](../packages/database/demo/020-production-demo.sql)第11—14行仍生成“整个工单同一基础物料只允许一个版本”“研发单从产品BOM选择”等备注。
- 影响：执行demo seed后，页面可能显示错误业务说明；改文档不等于生成数据已修复。
- 待处理：修正demo SQL并核对展示及初始化行为；该项已有明确规则，无需重新裁决ADR-0014，不修改已执行migration。

## CO-04

**部署脚本未落实部分迁移要求的业务停写。**

- 一方：[migration-safety](../packages/database/docs/migration-safety.md)对整数数量、库存投影／触发器、名称快照及后续采购／质量结构切换明确要求暂停相关业务写入；迁移建议锁只互斥迁移运行器。
- 另一方：[deploy-api.sh](../ops/scripts/deploy-api.sh)发布路径在启动MySQL/MinIO后直接用候选镜像迁移，迁移前未自动停止旧API；旧API处理出现在后续切换／失败恢复路径。[部署runbook](../ops/runbooks/compose-server-deployment.md)已标明这一缺口，没有宣称脚本满足停写。
- 影响：存在旧API时，某些破坏性DDL可能与旧业务写入重叠；不能把维护前提当作已由脚本自动保证。
- 待决／处理：明确各迁移的人工维护窗口、自动停写责任、失败时保持停写与恢复顺序，再同步脚本和runbook。

## CO-05

统一编号的转换职责已由 [ADR-0017](adr/0017-business-numbering-and-beijing-time.md)明确：平台分配器在统一 +08:00 数据库会话读取北京自然日，业务模块和 demo 不再自行 UTC 加八小时。仍保留数据库时钟、日计数锁及幂等边界。本锚点仅保留既有引用，验证和验收见[路线图](roadmap.md)。
