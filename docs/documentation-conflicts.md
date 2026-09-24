# 未解决冲突索引

本索引维护尚未解决的业务定义或文档与实现差异。各项按证据明确适用范围和待决问题；实现存在只证明当前行为，不能自行撤销原设计。

明确有ADR取代关系的旧工单锁版、研发BOM门禁、损耗自动补料、旧scope树、旧Quality表及旧采购表名已按证据整理，不列为未决冲突。未批准设想和待验收／待正式测试事项见[路线图](roadmap.md)。

| 编号 | 主题 | 类型／当前状态 | 待处理 |
| --- | --- | --- | --- |
| [CQ-01](#cq-01) | 成品检验数量建议及已有入库后新检验的C范围 | 数量提示已实现；剩余范围与冻结仍待整改 | 固定历史已入基准及剩余范围，补齐复检开始冻结 |
| [CP-01](#cp-01) | 上游报工更正的下游数量下限 | 文档两种口径；待裁决 | effective_normal与effective_direct_reported的适用边界 |
| [CP-02](#cp-02) | 过程复检关联source_rework_id | 历史提案批准状态待确认；当前明确未定稿 | 保留提案或确认撤回，不提前建模 |
| [CO-01](#co-01) | 产品分类扁平化与树结构 | 旧目标与当前实现冲突；待裁决 | 旧扁平化目标是否仍有效 |
| [CO-02](#co-02) | Identity主数据审计字段 | 公共规范与owner／migration差异；待裁决 | 补齐规范还是明确经批准的例外 |
| [CO-03](#co-03) | 演示工单生成旧业务备注 | 代码残留与已明确新规则冲突；待修正 | 后续修改demo SQL，核对展示及初始化行为 |
| [CO-04](#co-04) | 部署迁移前业务停写 | 执行前置缺口；待明确责任并修正 | 人工维护窗口与脚本自动停写的责任及恢复流程 |
| [CO-05](#co-05) | 工单编号显式UTC＋8 | 公共时间规范与业务实现差异；待确认例外 | 保留数据库时钟但统一转换责任或明确专项例外 |

## CQ-01

**数量建议已采用非阻断语义；固定已入基准、剩余范围快照及复检开始冻结仍有实现差异。** 原数量硬门禁由[ADR-0015](adr/0015-unified-quality-quantity-semantics.md#成品数量与职责)明确取代。当前未完成项不再包括质检建议与定稿数量的大小比较。

- 当前规则：[Production检查](../apps/api/src/modules/production/infrastructure/mysql-production-output.read.ts)要求引用最新且明确released的记录，不以清单总量或历史已入量超过本次建议为由阻断；[审批快照解析](../apps/api/src/modules/production/application/production-approval-snapshot.schema.ts)校验事实与派生建议，未将建议用作清单上限。历史未放行零量证据可读，不代表具有新送审／批准资格。
- 已确认待实施：新复检覆盖本任务全部剩余送检实物，已经入库的实物不计入本轮C/G/F。发起复检时固定已入基准I₀及剩余身份／版本，冻结剩余入库资格；明确放行、产线核对和新清单批准后恢复。全检建议R=G、抽检R=C−F，累计建议S=I₀＋R只供差异核对，不限最终数量。详细定义见[Quality已确认目标](../apps/api/src/modules/quality/docs/finished-inspections.md#部分已入后的复检已确认目标待实施)。
- 差异证据：[来源快照](../apps/api/src/modules/production/infrastructure/mysql-production-finished-inspection-source.ts)尚未固定I₀及剩余范围；[入库门禁](../apps/api/src/modules/production/infrastructure/mysql-production-finished-inbound.read.ts)仅在更正在审且类别数量变化时冻结该类别，未实现复检开始即冻结剩余资格。当前页面分列当前已入量和本次建议，不用动态当前值伪造I₀或累计建议。
- 影响示例：计划内10件已入，剩余实物G=2/F=0且明确放行时，清单不会因为本次建议只有2而被拦截；但尚不能证明发起该次检查时已入基准固定为10，也不能仅凭打开检验表单认定剩余入库已被冻结。
- 保持边界：原说明及负责人审批保留，不新增强制超建议说明或额外审批。已入类别数量及原批准／检验／库存事实不改写；质检不决定计划内外、报废或库存处置。计划内上限及计数合法性保持，待复检／不放行不能通过数量差异绕过，实际入库按有效正式批准量防重复。本项不新增在库质量、成品出库或入库冲销。

剩余整改、用户验收及待补正式测试统一见[路线图](roadmap.md#cq-01成品剩余复检整改)。本项在固定基准与冻结差异消除前保留，不再列为业务范围待裁决。

## CP-01

**上游冲销／更正应保护哪一种下游数量。**

- 一方：[生产流程§14](../apps/api/src/modules/production/docs/business-workflow.md)与[执行专题§4.2.2](../apps/api/src/modules/production/docs/database/execution-traceability-quality.md)要求更正后上游effective_normal不得小于下游effective_normal。
- 另一方：执行专题§4.2.3及[当前报工Repository](../apps/api/src/modules/production/infrastructure/mysql-production-reporting.repository.ts)冲销／更正调用使用下游effective_direct_reported；该值包含直接正常／异常报工净量，排除返工完成报工，不能与有效正常量互换。
- 影响：下游已有异常或返工时，两口径可对同一上游更正给出不同结果。
- 待决：确认应保护的投入／放行事实及返工例外，再统一两处设计与实现；现有代码不能单独充当旧规则被批准取代的证据。

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

**工单编号显式UTC＋8是否属于公共时间规范的例外。**

- 一方：[数据库公共规范“统一类型与状态规则”](database-conventions.md#统一类型与状态规则)要求数据库、驱动和会话统一使用北京时间／+08:00，禁止各业务模块自行加减小时。
- 另一方：[工单编号owner](../apps/api/src/modules/production/docs/database/work-orders-and-batches.md#工单自动编号)明确以数据库时钟转北京时间日期；[mysql-work-order-number.ts](../apps/api/src/modules/production/infrastructure/mysql-work-order-number.ts)使用UTC_TIMESTAMP(3)＋INTERVAL 8 HOUR，demo SQL采用相同表达式。
- 影响：该表达式目前得到北京时间编号日期，并非发现了错误日期；但它与全仓“业务不自行换算”的职责约束存在未登记例外。
- 待决：是否保留编号的专项数据库时钟转换例外，或由统一时间设施承担；继续保留北京时间自然日、日计数锁及幂等编号边界，不据此擅改编号算法。
