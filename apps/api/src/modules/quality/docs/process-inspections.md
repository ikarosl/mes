# 工序专检

工序专检检查任务下具体工序的现场实物范围，不关联某一笔报工。Quality 拥有专检单与不可变结果；Production 通过既有异常处置单处理已核实的不合格数量。决策理由及取代边界见 [ADR-0021](../../../../../../docs/adr/0021-process-inspection-and-abnormal-disposition.md)，生产处置、返工和数量范围见[生产执行](../../production/docs/database/execution-traceability-quality.md)。实现不等于用户验收或正式测试通过，当前交付阶段见[路线图](../../../../../../docs/roadmap.md)。

## 现场范围与数量

每次新增检查创建一张稳定专检单，绑定 `production_batch_id` 与 `batch_step_record_id`；同一任务工序允许多张专检单。检查方式为 `full` 或 `sampling`，必须填写现场范围、实际检查时间、合格数量 G、不合格数量 F、检查说明及凭据。N=G+F 由系统派生，G/F 为非负整数且 1≤N≤99999999。全检指所填写现场范围内的全检，不默认覆盖工序全部历史报工；抽检不外推整批。

检查数量不受某笔或累计报工数量约束，报工更正不改写专检结果，专检登记与处理也不自动更正报工或增加直接投入。多次检查累计仅表示登记次数对应数量，不表示唯一实物覆盖量。新增登记只用于未登记的问题实物；已登记不合格实物的重复复查不能作为新增发现重复增加待办。本期不提供独立复检工作流、逐件身份或自动排重；发现原登记错误使用更正动作，处置复核依据随 Production 处置流程留存。

## 累计处理与更正

专检单保存当前有效结果指针及 `accepted_quantity`。累计已处理量由 Production 创建正式异常处置单时，经 Quality 公开能力同事务增加；不接收用户手工累计值。每笔明细保存在既有 `batch_step_abnormal_dispositions`，不存在另一套处理事实表。

“已处理”指产线已经确认并创建异常处置的数量，不表示问题已解决。历史处理及后续返工、报废进度由 Production 展示；专检字段与公开命令继续使用 `accepted_quantity`、`canAccept` 和 `accept` 等稳定技术名称。

```text
有效不合格量 F = 当前正向结果的不合格数量
已处理量 C = 专检单 accepted_quantity
待处理量 P = F − C
必须保持 0 ≤ C ≤ F
```

累计数按每张专检单保护，不能用其他专检单的余额填补来源缺口。创建异常处置单即占用处理量，不等到返工或报废完成；Production 处置完成、返工完成、收尾终止均不释放处理量。本期无专检处理撤销入口，已有处理不能通过报工错误驳回释放。

已提交检查事实不允许 UPDATE/DELETE。更正携带专检单版本与非空原因，锁内校验替代后的完整 F 不小于 C，然后在同一事务追加完整冲销行、完整替代行并更新当前指针及版本。冲销行保存原结果的正数量与全部检查字段，汇总时按冲销取负；替代行引用被替代原结果。已存在的生产处置单继续引用处理时的结果，不随更正改绑。仅 F 减少的部分需要与 C 比较，G 的更正不改变生产处理。

单独冲销一次检查要求 C=0，追加冲销行后将该专检单的当前指针置空，明细状态派生为 `reversed`；没有恢复或对已冲销单继续更正的入口。工序办理入口持续保留，执行资格满足时可以在同一工序继续登记新的检查。若只将 F 改为 0 且 G>0，应使用更正，不能把仍有效的合格检查误当整单撤销。更正或冲销失败时不追加任何事实。

例如原结果 95/5、C=3，更正为 96/4 后，历史为 `95/5 − 95/5 + 96/4`，P=1；更正为 98/2 被拒绝。再处理 1 件后 C=4、P=0，处理完成后 C 仍为 4。

## 执行阶段与锁序

新增检查和产线处理要求任务处于 `doing`、工序处于 `doing` 或 `completed`，且结案／产出更正不在审批冻结中。任务进入结案或已经结案时，已有专检仍可历史更正及合法冲销；保留原任务工序身份、版本和处理下限校验，不恢复任务执行资格，不改批准产出或库存。未开工或已取消任务不接受专检命令。

Quality 的 `QualityProcessInspectionSourceRegistry` 只接受 Production 注册来源实现。新增、更正和冲销由 Quality 在同池事务调用来源 `prepare(batchId,stepId,intent)`，Production 先锁工单→任务→结案根→按顺序锁任务工序，再由 Quality 锁专检单。更正／冲销只读不可变来源身份以确定生产根，禁止先锁 Quality 再反向获取生产锁。

Production 处理先锁同一来源链，再调用 `QualityProcessInspectionCommand.accept`。Quality 核对专检任务工序身份、专检版本、当前结果 ID 及剩余额度，更新累计和版本；Production 插入异常处置单。两模块业务写入、成功审计和 HTTP 幂等结果同事务提交，失败整体回滚。`getSource` 只提供定位身份，不能替代来源或额度校验。公开能力不暴露连接或数据库行类型。

`QualityProcessInspectionQuery` 为 Production 提供按任务工序精确限定的只读检查依据。`listPendingForStep` 在分页前筛选当前有效且 P>0 的检查，`getForStep` 按任务、工序和专检单 ID 精确读取，允许核对已经处理完或冲销的检查；来源不符返回空值。调用方先核验生产任务工序身份，再按生产页面权限提供 HTTP 读取。该能力复用相同检查投影、人员名称和独立只读一致快照，不加锁、不代替处理命令校验。

## HTTP 与权限

| 方法与路径 | 用途与权限 |
| --- | --- |
| `GET /quality/process-inspections` | 以任务下具体工序为一行的汇总分页；`quality:process-inspections:view` |
| `GET /quality/process-inspections/steps/:stepId` | 单个工序的完整累计与登记资格；同上 |
| `GET /quality/process-inspections/steps/:stepId/inspections` | 该工序历次检查明细分页，包含已冲销检查；同上 |
| `GET /quality/process-inspections/:inspectionId` | 专检单当前详情；同上 |
| `GET /quality/process-inspections/:inspectionId/records` | 全部不可变结果历史分页；同上 |
| `POST /quality/process-inspections` | 新增现场专检；`quality:process-inspections:record` |
| `POST /quality/process-inspections/:inspectionId/actions/correct` | 冲销加完整替代；同上 |
| `POST /quality/process-inspections/:inspectionId/actions/reverse` | 无处理时整单冲销；同上 |

所有 body/query/param 使用 class DTO。创建、更正和冲销要求 `Idempotency-Key`，scope 与严格结果 codec 由[应用契约](../application/idempotency/process-inspection-idempotency.contract.ts)维护。指纹包含所有来源、事实、版本和原因；时间规范化为同一 ISO 时间、文本 trim 后进入指纹。返回 `inspectionId/recordId/version`，重放不重复追加结果或推进版本。更正冲突与处理冲突都要求刷新，不能通过更换幂等键绕过旧版本。

主列表包含已有检查历史的工序和当前允许登记检查的工序；同一 `batch_step_record_id` 始终只有一行。已冲销全部检查的工序和已结案历史工序仍保留，无历史且当前不可登记的工序不进入办理集合。列表支持 `keyword/batchId/stepId/pendingOnly=true`；关键词搜索任务号、工单号、成品编码／名称和工序编码／名称，所有筛选及累计在分页前完成。按任务 ID 倒序、工序顺序正序、工序 ID 倒序稳定分页。`steps/:stepId` 不在该集合时返回不存在，不通过列表返回范围授权写入。

工序汇总的 `inspectionCount` 统计登记次数，包含已冲销检查；`activeInspectionCount` 统计当前有效检查数，更正和冲销均不增加登记次数。G/F 只汇总每次检查的当前有效正向结果，C 汇总专检单已处理量，P=F−C；`latestInspectedAt` 为当前有效结果实检时间的最大值，无有效结果时为空。`canCreate/createBlockedReason` 表示当前登记资格提示。工序没有 `active/reversed` 状态；无有效结果时展示“暂无有效检查”。累计含义仍是登记数量，不代表去重实物覆盖量，不允许用工序累计替代逐次处理下限。

工序内历次检查按专检单创建时间及 ID 倒序分页；每次检查返回身份、当前结果、C、P、`canAccept/acceptBlockedReason`、版本与明细 `active/reversed` 状态。单次结果历史按记录创建时间及 ID 倒序。冲销单保留身份与历史读取。登记固定使用当前工序身份，不提供跨工序候选选择。工序汇总、检查分页及结果历史的每个读取请求使用独立只读一致快照，确保自身计数、累计与结果一致；独立请求之间不承诺同一时点。

名称、状态与工序筛选通过已登记的 `infrastructure/queries/` 只读查询生产表；登记及处理提示覆盖待办数量、任务阶段、审批冻结和工序阶段。该投影仅供展示，不能代替 Production 命令的锁内核验。用户名称通过 Identity public 批量读取。质检工作区办理登记、更正和冲销，处理入口属于生产执行页面；Quality 页面只展示处理进度，不提交生产处理。Production 的读取、处理端点及权限由[生产执行专题](../../production/docs/database/execution-traceability-quality.md#43-工序专检与生产处理)维护，产线办理不要求 Quality 页面权限，Quality 写权限也不授予生产处置权限。

## 数据库结构

`quality_process_inspection` 与 `quality_process_inspection_record` 均由 Quality 所有，采用公共[数据库约定](../../../../../../docs/database-conventions.md)中的类型、审计与北京时间规则。

| `quality_process_inspection` 字段 | 约束与用途 |
| --- | --- |
| `id` | 稳定专检单主键 |
| `production_batch_id / batch_step_record_id` | 非空组合 FK 到同一任务工序；创建后不更换 |
| `current_record_id` | 同专检单组合 FK；指向唯一当前有效正向结果，整单冲销后为空 |
| `accepted_quantity` | 默认 0，范围 0..99999999；仅由公开处理命令在锁内累加 |
| `created_by/at / updated_by/at / version` | 完整可变审计，人员 FK，version 非负；处理及更正递增 |

专检单按任务及工序分别建立创建时间／ID 索引；不保存可写的合格、不合格或待处理汇总，当前结果从不可变事实读取。当前指针、累计与明细的一致性由共享事务及固定锁序维护。

| `quality_process_inspection_record` 字段 | 约束与用途 |
| --- | --- |
| `id / inspection_id` | 主键及专检单 FK，具有 `(id,inspection_id)` 唯一键 |
| `record_type` | `normal/reversal` |
| `inspection_method` | `full/sampling` |
| `qualified_quantity / unqualified_quantity` | G/F 非负、合计为 1..99999999；N 不存储 |
| `scope_note / inspected_at / result_note / evidence_reference` | 现场范围、实际检查时间、检查说明与凭据；文本 trim 后 1..5000 字 |
| `reversal_of_record_id` | 仅冲销行非空，唯一；同单组合 FK，原结果只能被冲销一次 |
| `replaces_record_id` | 替代正向行引用原结果，唯一；同单组合 FK |
| `reason` | 初始正向结果为空，更正、替代及冲销必须为非空原因 |
| `created_by / created_at` | 创建审计，人员 FK；不含可变审计或 version |

结果表 UPDATE/DELETE 触发器禁止改写；数据库 CHECK 约束类型、数量、引用组合及文本长度。历史按 `inspection_id/created_at/id` 索引分页。Production 来源组合外键、处置数量和返工计数范围由其[数据库专题](../../production/docs/database/execution-traceability-quality.md)维护。

`202610150002-process-inspection` 成对 migration 建立两表、不可变触发器与工序专检权限，并扩展 Production 来源字段。迁移只追加，已执行文件不得修改；停写、回滚数据门禁和初始化要求见[迁移安全](../../../../../../packages/database/docs/migration-safety.md)。
