# 外购到货检验数据库

Quality 只拥有 `quality_inbound_case` 与 `quality_inbound_inspection`。表使用 InnoDB、`utf8mb4_0900_ai_ci`；ID、外键均为 `BIGINT UNSIGNED`，时间为北京时间 `DATETIME`，数量为 `INT` 且最大 `99999999`。结构随采购到货 migration 建立，循环外键在两侧表创建后补齐。公共规则见 [数据库约定](../../../../../../docs/database-conventions.md)。

## 检验办理 quality_inbound_case

| 字段 | 类型与约束 | 含义 |
| --- | --- | --- |
| id | 自增主键 | 办理身份 |
| receipt_line_id / receipt_revision_id | ID，非空 | 稳定到货与本范围修订；组合 FK 保证同一到货 |
| source_scope_id / target_scope_id | ID，可空 | 受影响旧范围与本次 reviewing 范围；分别组合 FK 同一到货 |
| case_type | VARCHAR(30)，非空 | initial / reinspection / inspection_correction / receipt_correction |
| status | VARCHAR(30)，默认 reviewing | reviewing / completed / superseded |
| covered_quantity | INT，0..99999999 | 本次覆盖的实物量；零仅允许实收更正且目标范围为空，正数必须有目标范围 |
| reason | TEXT，非空非空白 | 发起原因 |
| completed_by / completed_at | ID / DATETIME，可空 | 仅 completed 同时有值，人员 FK users |
| superseded_by_receipt_revision_id | ID，可空 | 仅 superseded 有值，组合 FK 同一到货修订 |
| created_by / updated_by | ID，非空，FK users | 创建与最近修改人 |
| created_at / updated_at | DATETIME，默认 CURRENT_TIMESTAMP | updated_at 自动更新 |
| version | INT，默认 0，>=0 | 完成或替代递增；完成命令核对请求版本 |

唯一键为 `(id,receipt_line_id)` 与 `target_scope_id`；可空目标允许多个零量核实办理。索引 `(status,created_at,id)`、`(receipt_line_id,id)` 服务待办与历史。来源范围仅实收更正可以为空，用于原实收少录后的新增余量。状态 CHECK 保证完成和被替代元数据互斥完整。

`startCase` 不写库存或范围，调用方创建目标范围后调用。`completeCase` 锁办理并核对版本、显式状态、到货、修订和目标范围，追加唯一结论后更新办理状态。`supersedeCases` 按数字 ID 顺序锁定，只允许同一到货的 reviewing 办理，保存新修订引用，不删除旧办理。

## 不可变结论 quality_inbound_inspection

| 字段 | 类型与约束 | 含义 |
| --- | --- | --- |
| id | 自增主键 | 结论身份 |
| case_id / receipt_line_id / receipt_revision_id | ID，非空 | 组合 FK 约束办理和修订均属于同一到货；命令核对修订与办理完全一致 |
| covered_quantity | INT，0..99999999 | 办理覆盖量快照 |
| inspection_method | VARCHAR(30) | full / sampling / review_only |
| qualified_quantity / unqualified_quantity | INT，可空 | 全检真实合格与不合格数 |
| sample_quantity / sample_unqualified_quantity | INT，可空 | 抽检样本量与样本不合格数 |
| removed_defect_quantity | INT，0..覆盖量 | 明确剔除的不良数，全检不超过实检不合格数 |
| inbound_approved | TINYINT，0/1 | 质检明确是否批准入库 |
| disposition | VARCHAR(30) | release / await_full_inspection / await_decision / return_all / receipt_zero_confirmed |
| approved_quantity / quality_return_quantity / undetermined_quantity | INT，各自非负且和为覆盖量 | 领域规则计算的处置分量，不直接接受客户端结果量 |
| remark / evidence | TEXT，非空非空白 | 检验说明及凭据；应用各最多 4000 字 |
| created_by / created_at | ID FK users / DATETIME 默认 CURRENT_TIMESTAMP | 不可变事实审计列 |

唯一键 `case_id` 保证每次办理一个结论，`(id,receipt_line_id)` 供范围与入库引用；索引 `(receipt_line_id,created_at,id)`。禁止 UPDATE/DELETE 的触发器保护已形成结论，变更通过新的办理与新结论表达。

方法 CHECK：全检两项真实数量必填且和等于覆盖量，样本列为空；抽检样本 `1..覆盖量`，样本不良 `0..样本量`，全检列为空。`review_only` 仅覆盖量零、四个检验数量列为空且处置为 `receipt_zero_confirmed`，办理类型由应用核对实收更正。

处置 CHECK：`release` 必须明确批准，放行量为覆盖量减剔除量、判退量为剔除量、未判定为零。全检放行剔除全部不合格品，抽检放行至少剔除已知样本不良。`return_all` 不批准且全部判退；待全检或待决定不批准，已明确剔除部分判退、剩余未判定。零量核实不放行且结果量全为零。

所有命令的成功审计通过通用 transactional audit writer 写入同一来源事务，失败整体回滚。分页读取一次批量附加当前页的结论，避免逐办理查库。放行核验要求调用方活动事务，当前读锁定办理和结论，核对同一来源且 completed / release / 明确批准 / 正放行量；不查询库存余额或 Procurement 范围。

`getCases` 供最多 100 个真实办理 ID 的批量展示。`listOpenCases` 仅允许活动事务，按 ID 当前共享读，供关闭或更正判断未完成复核；`getCase` 在活动事务内也对办理与附属结论使用当前共享读，避免先前建立的 RR 快照漏掉后来完成的事实，事务外保持普通展示读取。
