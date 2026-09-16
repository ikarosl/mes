# 批次收尾、结案审批与本轮产出处置

Production 所有本章数据。适用于研发或批量工单中已经领料、决定停止执行的生产批次。长期决策见 [ADR-0009](../../../../../../../docs/adr/0009-research-round-close-and-output-disposition.md)，日常单条需求纠错见[需求设计](demand-allocation-and-outbound.md#正式需求更正与替代)。

本章描述当前已实现的逐项收尾。下一阶段目标见 [ADR-0011](../../../../../../../docs/adr/0011-task-closeout-output-list-and-finished-goods-inbound.md)：所有已执行任务按“产线草稿 → 质检留存记录 → 产线管理员核对清单 → 所属工单负责人结案审批 → 仓管按批准清单入库”流转，并支持批准清单更正及两类成品入库。质检仅保存当次记录，不改写产出处置单；工单负责人分派需扩展 Approval。计划内外产出与计划缺口届时按新口径实施。该目标尚未替换当前字段、数量计算或正常完工状态机，实施任务见[路线图](../../../../../../../docs/roadmap.md)。

## 流程与状态

**生产中 → 开始收尾 → 管理员逐项处理 → 登记实际产出 → 提交短产／提前结束审批 → 审批通过 → 批次正式结束。**

工单须为 `released/doing`；批次由 `material_partially_outbound/material_outbound/doing` 进入 `closing`，末级审批通过才进入 `terminated`。未领料、未开工任务仍使用取消；已正常完成的批次不得再次终止。在途需求纠错须先撤回或驳回，不能与批次收尾并存。

进入收尾立即停止派工、开工、报工、更正、返工执行、新增需求、损耗补料及普通分配／出库。管理员通过收尾记录逐项处理现存事项；实际退料、待确认损耗的取消仍在各自管理页办理。收尾逐项操作先产生真实结果，审批人审核这些结果及产出。驳回或撤回只解除本次送审冻结，仍留在 `closing`，不重新打开已关闭需求、工序或撤销退料。

不提供任意工序改状态或原来的“一键批量结束”写入口；普通短批授权只允许缺料继续生产，不能用于取消全部剩余需求。

## 逐项处理

每项确认实际处理说明、核对收尾版本及目标版本，处理结果与不可变行动记录、审计、幂等结果同事务写入。页面按业务类型预填可编辑备注，管理员须核对后确认。相同事项已结束后不得重复处理；物料事实变化后允许追加一次新的实核记录。

收尾工作台按物流与需求、工序、异常与返工分组。物流按整个批次的“待出库单 → 分配 → 活动需求 → 未履约补料单”分阶段解锁；前序模块仍有待办时，后序模块不可操作，后端同样校验此顺序。工序及异常／返工不依赖这条物流链。模块快捷处理只顺序调用已有逐项命令，每次成功重新获取版本与核对令牌；失败、未知结果或目标变化时停止后续处理，保留已经成功的事实，不把多项操作伪装成一次原子提交。

详情额外返回当前 `demands`（含原需求量、已领、保留余量、来源与替代关系）、`pendingItems`（含来源需求及不可操作原因）、`materialReviews`（待核对／已核对／事实变化需重核、说明、人和时间）。这些是现有事实的只读投影，不新增影子表，也不改变原行动快照或已送审批证据。物料实核是否仍有效由后端比较最近行动快照和当前领退料／损耗事实，页面不自行猜测。保存成功有明确反馈和行内结果；打开本项说明时保留核对版本和令牌，刷新不能用新事实悄悄替换原确认依据。

传输及审批证据中的数量统一为数量字符串（产出表单数值字段除外）。数据库驱动或原行动 JSON 返回数值时，由读取映射转换成字符串，不能仅依赖 TypeScript 类型断言，也不回写不可变行动记录。

| 对象 | 处理结果与先后条件 | 保留内容 |
| --- | --- | --- |
| 待出库单 | 仅 `pending_picking → cancelled`，取消来源 `production_termination`；其他未完成状态须先到对应管理页处理 | 已确认出库、整单原明细、库存流水 |
| 分配 | 先处理待出库单，再核对并释放仍有未出库预留的分配；冻结或异常分配即使预留为零也须人工核对处理。`active` 且已全部领料、无未完成出库的分配不列为释放待办 | 原分配量、原库存批次和已领量；只释放尚未出库的预留 |
| 活动需求 | 先处理待出库单、剩余预留及冻结或异常分配，再由统一 Writer 写 `closed / batch_closeout`；已全部领料的正常有效分配不阻断关闭。每次需求关闭推进一次物料计划和批次版本 | 原 `need_number/remaining_number`、已领事实及关闭原因 |
| 未完成工序 | `pending/assigned/doing → terminated`；明确记录终止人、时间、说明和收尾 ID | 原负责人、首次开工和报工事实，处理前状态留于行动快照；不填写正常完工时间 |
| 待处理异常 | `pending_review → terminated`，记录处理人和时间 | 原异常报工及来源，不生成新报废补料事实 |
| 未完成返工 | `pending/doing → cancelled` | 已发生报工与完成返工事实 |
| 未齐套补料单 | 所有活动需求逐项关闭后，`approved → cancelled` | 原补料方案、报废事实和授权；取消不能变成齐套 |
| 物料实核 | 按每条原分配核对领料、退料、损耗及可退上限，填写实物安排 | 不推算现场余额，不自动退料 |

分配待办和需求关闭前置校验使用相同条件。未出库预留按 `max(assigned_number − 已确认出库量, 0)` 计算；待出库单不算已确认出库。零预留的正常有效分配仍保留在物料实核及领料追溯中，不为了清空待办将其改为 `released`。

待确认退料和待确认损耗会阻断送审；先完成或取消对应单据。待确认损耗不得为了结案调用会生成补料的确认命令。结束时损坏物料暂通过实核说明登记，结构化“不补料损坏”数量占用另见路线图，不能把损坏实物作为可用余料回仓。可退上限不是现场实存数量。

## 数量与工单汇总

- 本轮产出合计 = 可用产出 + 本次新增报废 + 历史已确认工序报废；均为非负整数，合计不超过 `99999999`。
- 计划差额 = 计划量 − 本轮产出合计，允许正、零、负；未产出不计入报废，不折算物料余量。
- 可用产出由管理员填写；末工序有效正常报工仅作参考。收尾不改写报工、`completed_quantity` 或质量合格量。
- 全部报废、零可用但已领料也可以结案。收尾报废不触发补料、产品补产或库存变动。
- 工单列表及详情汇总正常完
成批次的 `completed_quantity`、终止批次审定可用量及两类报废；不叠加路线各步报工。收尾中批次数及其未审定可用量单独展示。
- 全部批次为 `completed/cancelled/terminated` 后才能提前关闭工单；存在终止批次时 `close_type=production_terminated`，仍须原因。正常足量完工仍要求全部有效批次正常完成。
- 可用产出是待入库产出处置，实际成品入库、额外产出独立入库仍属后续阶段，结案不代办入库。

## 数据结构

### `production_batch_closeout`

一批次一份可变收尾记录，具有单据审计字段及 `version`，无软删除；不是另一份执行需求或库存账本。

| 字段 | 类型／约束 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED` 自增主键 | 收尾 ID |
| `production_batch_id` | `BIGINT UNSIGNED NOT NULL`，唯一、FK 批次 | 来源 |
| `reason` | `TEXT NOT NULL`，去空白非空 | 结束原因 |
| `available_quantity / additional_scrap_quantity` | `BIGINT UNSIGNED NULL` | 未登记时同时空，登记时非负、合计受上限限制 |
| `material_review_note` | `TEXT NULL` | 与两项数量同时填写，非空物料安排 |
| `approval_instance_id` | 可空 FK Approval 申请 | 最近一次真实送审；历史全部保留在 Approval |
| `pending_approval_id` | 可空 FK Approval 申请 | 当前在审指针，非空须等于最近申请，已有输出和证据且未终止 |
| `review_snapshot` | `JSON NULL` | 最近提交的输出、逐项处理和物料证据；每次历史快照归 Approval，不以此覆盖历史 |
| `termination_id` | 可空唯一 FK 终止事实 | 末级批准生成的不可变产出处置 |

`UNIQUE(id,production_batch_id)` 供需求、工序的组合 FK 核对归属；创建／修改人 FK 用户。当前申请归属、版本及实际在审状态由 Production handler 和 Approval 同事务核验。

### `production_batch_closeout_action`

不可变逐项处理事实，UPDATE/DELETE 触发器禁止改写，无 `version/updated_*/is_deleted`。

| 字段 | 类型／约束 | 含义 |
| --- | --- | --- |
| `id / closeout_id` | 自增主键／非空 FK 收尾记录 | 索引 `(closeout_id,id)` |
| `item_kind` | `VARCHAR(30)`，CHECK 封闭枚举 | step、abnormal、rework、supplement、outbound、demand、allocation、material |
| `target_id` | `BIGINT UNSIGNED NOT NULL` | 本模块目标记录；类型与同批次归属锁内校验 |
| `label` | `VARCHAR(200) NOT NULL` | 来源记录标识 |
| `previous_status / resulting_status` | `VARCHAR(40) NOT NULL` | 实际处理前后状态 |
| `reason` | `TEXT NOT NULL`，去空白非空 | 本项说明 |
| `fact_snapshot` | `JSON NOT NULL` | 处理前事项 ID、状态、版本、数量／物料核对依据 |
| `created_by / created_at` | 用户 FK／默认当前时间 | 实际处理人和时间 |

`batch_step_records` 增加 `terminated` 及 `closeout_id/terminated_by/terminated_at/termination_reason`。终止状态必须全部有值且 `completed_at IS NULL`；其他状态这些字段为空；`(closeout_id,production_batch_id)` 组合 FK 校验归属。

### `production_batch_termination`

末级批准后追加，一批次一条不可变事实，已有表继续沿用；无软删除、更新审计或版本，UPDATE/DELETE 触发器阻止修改。

| 字段 | 类型／约束 | 含义 |
| --- | --- | --- |
| `id / production_batch_id` | 自增主键／非空唯一批次 | 防止重复结案 |
| `work_order_id` | `BIGINT UNSIGNED NOT NULL` | 与批次组成 FK |
| `planned_quantity` | `DECIMAL(12,4)`，正整数 | 计划快照 |
| `available_quantity / additional_scrap_quantity / existing_scrap_quantity` | `DECIMAL(12,4)`，非负整数，合计受上限限制 | 可用、新报废、历史报废快照 |
| `reason / material_review_note` | `TEXT NOT NULL`，去空白非空 | 原因及物料安排 |
| `review_snapshot` | `JSON NOT NULL` | 审定的来源、数量及物料核对；行动结果另由收尾和 Approval 保留 |
| `created_by / created_at` | 用户 FK／当前时间 | 最终确认人和时间 |

索引 `(work_order_id,created_at,id)` 用于按工单追溯。

## API、审批和事务

| 路径（前缀 `/api/production/batches/:batchId`） | 作用 |
| --- | --- |
| `GET /termination-check` | 读取核对或历史终止事实 |
| `GET /closeout` | 收尾详情、逐项结果、输出、送审阻断；没有逐项收尾记录时返回 HTTP 200、`application/json` 和正文 `null`，不得发送空响应体。须结合 `/termination-check` 的结束记录区分尚未开始与已结束但无逐项记录；结束前影响快照不属于当前待办 |
| `POST /closeout/begin` | 提交批次 `version + reason`，开始收尾 |
| `POST /closeout/items` | 提交收尾 `version + checkToken`、事项类型／ID／目标版本、说明，处理一项 |
| `POST /closeout/output` | 提交收尾 `version`、可用量、新报废、原因及物料说明 |
| `POST /closeout/submit` | 提交收尾 `version + checkToken`，进入正式审批 |

读取权限 `production:tasks:view`，四个写入口均要求 `production:tasks:terminate` 与 `Idempotency-Key`，分别使用 `production.batch-closeout.begin/handle/output/submit.v1`。旧 `POST /actions/terminate` 不再提供。幂等严格结果为收尾 ID／批次 ID，送审为业务对象 ID／审批 ID；权限逐次校验，沿用 12 小时重放窗口。

场景 `production.batch.closeout`、对象 `production_batch_closeout` 由 Production 注册，管理员先在审批流程页配置并发布顺序节点；未配置不可提交。不自动选择审批人或免审。通用 Approval 拥有节点、决定、历史和通知，Production handler 校验并操作自己的记录；不是每一项各送一次审批。

写入先锁工单、批次、收尾记录，再锁关联事实。提交须无未处理事项、无阻断单据、有输出，且每条物料实核快照与当前领退料／损耗匹配。正式送审冻结该记录，审批证据包含逐项的目标、数量、状态变化、说明、操作人、时间和实际产出。末级批准使用当前读复核 SHA-256 核对令牌及全部行动；事实实质变化时拒绝最终生效，须驳回或撤回后重核，不能悄悄替换证据。批准决定、终止事实、批次终态、成功审计及通知共用一个事务；失败整体回滚。

结构由追加迁移 `202609150001-production-demand-correction-and-closeout` 提供；此前终止事实表由 `202609140002` 提供。迁移／回退守卫和开发重建约定见[迁移安全](../../../../../../../packages/database/docs/migration-safety.md)。验收与正式测试顺序见[路线图](../../../../../../../docs/roadmap.md)。
