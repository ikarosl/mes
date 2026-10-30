# 成品检验与放行

本文维护成品检验的 G/F 事实、请求语义及放行资格。来料与成品共用[检验两表](database.md)，来料整批 C、数量授权及建议由 Procurement 的[正式清单与整批分配](../../procurement/docs/receipt-acceptance.md)维护。[ADR-0019](../../../../../../docs/adr/0019-finished-inspection-measurement-simplification.md)精确取代旧成品 C/R/S 裁决；[ADR-0015](../../../../../../docs/adr/0015-unified-quality-quantity-semantics.md)保留其余共同边界与来料规则。成品轮次由 Production 明确开始并固定历史已入基准，Quality 在该轮留存一次检查事实。实施、运行验证和用户验收状态见[路线图](../../../../../../docs/roadmap.md)。

Quality 所有 `quality_inspection_record` 是每个任务当前成品轮次剩余送检范围的一次不可变检验事实。Production 所有产出草稿和批准清单，只引用记录；Inventory 根据批准清单办理成品入库。批量和研发共用本规则。

## 数量输入与放行

本节描述当前请求、事实计算及放行。Quality 不核实整批数量，不计算可入量或产出数量差异；Production 负责最终清单及其有限的定稿提示。

全检与抽检只记录实际合格数 G、不合格数 F，N=G+F；数量遵守公共整数上限，普通检查必须 N>0；不按产线原申报量推算 G，也不以抽检样本推断整批合格数或整批差异。零产出只使用专用 `zero_confirmation`，G=F=N=0，须明确选择 `released` 并完成核实。

普通检查可明确选择 `released/pending_reinspection/not_released`；只有 `released` 取得放行资格，另两种结论继续阻断正常定稿和入库。Quality 不生成本轮建议量、累计建议量或抽检合格率；没有独立剔除数量输入，也不自动把不合格数登记为产品报废。

请求提交检查方式、G/F、明确结论、检验时间和凭据，N 由服务端派生；不提交整批量或放行数量。具体字段见[成品质检契约](../../../../../../packages/contracts/src/quality/finished-inspections.ts)，时间格式遵循[公共 API 规范](../../../../../../docs/api-conventions.md)。写入、读取和 Production 审批解析使用同一套检查事实规则。

产线三项数量和版本保留为登记当时的来源快照，只供识别与核对；不限制实际检查总数，也不自动改变 G/F。例如产线原申报 10，全检填写合格 11、不合格 1，则 N=12；抽检填写样本合格 4、不合格 1，则 N=5。抽检 N=5 不说明整批只有 5 件或其余全部合格。产线管理员独立核对和修正计划内、计划外及实际报废，主动引用适用检验记录送审；质检页面不提示产出数量差异，不合格数不能自动作为已报废数量。

## 成品来源与统一事实

统一结果只持久化 G/F，成品的 `covered_quantity` 为 NULL；N=G+F 只读派生。成品原申报版本和三项数量保存在 case。成品响应和批准证据不含整批 C、本次 R、累计 S 或抽检合格率，不建立重复物理计数。同源关系见[数据库](database.md)。

Quality 不生成累计可入建议；Production 定稿只消费明确引用的检查及其原轮固定已入基准。定稿差异提示、数量上下限和审批要求由[Production 数量规则](../../production/docs/database/production-termination.md#数量质检与更正)维护，不能套用来料超建议强制说明。

## 部分已入后的复检与固定范围

开始、登记和复检遵守 Production 的[成品检验办理阶段](../../production/docs/database/production-termination.md#数量质检与更正)。已有批准版时先由生产侧显式开启清单更正；质检入口不代替该业务动作。列表、详情和锁内写命令均须反映来源资格，历史记录仍可查看。

Quality 开始与复检入口调用 Production 来源能力；开始时不生成检查事实，登记时才在同一事务创建 completed case 和不可变结果。同一轮只能登记一次，重检必须由来源建立新轮。

检查针对当前轮固定的剩余送检实物。Quality 不决定轮次基准、类别分配、报废或目标批次；开始、更正、连续复检及旧授权冻结条件统一见[来源轮次规则](../../production/docs/database/production-termination.md#数量质检与更正)。已入与旧检验事实保留，新检查本身不恢复旧入库授权。

## 查询与当前阶段

`GET /api/quality/finished-inspections` 按任务分页，接受 `keyword/stage/page/pageSize`。关键词搜索任务号、工单号、成品编码及名称；筛选使用当前阶段，按结案根更新时间及 ID 倒序。

每项任务只有一个当前阶段：先检查任务是否允许办理及是否在清单审批中，再看草稿、当前轮次和结论。纯清单更正可沿用明确放行的旧记录，显示待核对清单；有历史记录不等于当前可检。具体阶段映射见[查询代码](../infrastructure/queries/)。

筛选、总数与响应阶段使用同一口径。阶段和下一步只供导航；开始、登记和复检仍由来源详情及写入时的锁内资格校验决定。最近历史结论不代替当前轮状态或产出清单实际引用的检验依据。

## 不可变记录与事务

历史分页接口 `GET /api/quality/finished-inspections/:batchId/records` 按记录 ID 倒序读取；精确接口 `GET /api/quality/finished-inspections/:batchId/records/:recordId` 只返回该任务所属的一条既存成品记录，复用同一事实映射和检验人展示名。两者均要求 `quality:finished-inspections:view`。记录不存在、属于其他任务或不是成品来源时，精确接口统一返回 `NOT_FOUND`，不回退读取最新记录。返回的原申报与轮次固定已入基准属于该记录发生时的历史来源，不随任务后续复检或入库重算。

每次新记录归属于当前成品轮次的全部剩余送检范围；抽检 G/F 只描述实际样本，不证明整批数量。新轮复检追加记录并关联同来源前驱，只采用当前轮有效依据，不叠加历史检查数量。固定范围与开始冻结见上节，不用动态库存余额补造基准。是否仍适用由管理员核实并主动选择引用，需要复检时走已有显式复检入口；不自动检测新增产出或按数量变化强制换轮。

任务[撤回结束](../../production/docs/database/production-termination.md#撤回结束与再次收尾)后，保留检验记录、引用和轮次，执行期间暂停开始、登记及复检；列表当前阶段为“当前不可办理”，历史仍可查看。重新进入结案后，按当前阶段、审批、轮次及草稿资格办理，不因再次收尾自动作废原检验。既有明确复检、定稿更正的轮次切换规则保持。

开始、复检及登记通过 Production 来源能力，在同池事务按工单→任务→结案根锁定并核对版本、当前轮次和草稿资格。首次轮保存草稿时固定基准，复检新轮确认时固定基准；每轮只生成一次检查事实。Quality 追加记录和审计，Production 推进根版本。

三类命令均要求 `Idempotency-Key`，scope 与结果定义见[应用幂等契约](../application/idempotency/finished-inspection-idempotency.contract.ts)。开始与复检返回任务、轮次和新版本；登记返回任务、实际检验记录和新版本。

Quality 不写 Production 表。Production 送审和最终批准通过 Quality public 当前共享读重新核对联合指纹、最新记录与快照；`readForCloseout` 的锁内读只锁 Quality case/record，Production 轮次基准关联仅供展示，不借该读路径锁定来源轮次。数据库保护见[统一检验表](database.md)。

复检预览由 Production 提供，Quality 只回答是否已有检查记录；预览不代替最新放行依据的锁内核验。

## 迁移保护

旧整批量和放行建议不能解释为新版检查事实；迁移不转换既有证据，空数据守卫、停写与恢复条件见[迁移安全](../../../../../../packages/database/docs/migration-safety.md#202610080001成品检验只记录检查事实)。

审批快照由 [Production 结案设计](../../production/docs/database/production-termination.md)维护，幂等版本切换遵循[平台规则](../../../../docs/idempotency.md#13-scope-版本与开发重置)；旧快照和旧幂等结果不能按新的数量语义解释。
