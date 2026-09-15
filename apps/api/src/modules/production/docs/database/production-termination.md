# 批次结束与本轮产出处置

Production 所有本章数据。适用于研发或批量工单中已经领料、决定停止继续执行的生产批次。长期业务决策见 [ADR-0009](../../../../../../../docs/adr/0009-research-round-close-and-output-disposition.md)。

## 事实与数量

`production_batch_termination` 是尚未入库产出的本轮处置事实，每个生产批次仅一条，不可更新、删除或重新结束。历史工序报废仍由 `batch_step_scrap_records` 所有；此处只新增本轮结束时确认的报废量，不复制历史报废。数量均为整数：

- 本轮产出合计 = 可用产出 + 本次新增报废 + 历史已确认报废。
- 差额 = 计划量 − 本轮产出合计；允许正、零、负值。未产出差额不计入报废，不推导物料余量。
- 可用产出由管理员核实填写；末工序有效正常报工仅供参考，按正常报工减冲销汇总。此记录不修改 `completed_quantity`、`qualified_quantity` 或原报工事实。
- 可用为零也可结束；发生过领料或生产的批次使用 `terminated`，不能作为未生产任务取消。
- 本命令不生成库存流水、补料需求、补料单或产品补产授权，也不再次扣减已领材料。成品实际入库仍为下一阶段能力，不能将本记录当作库存确认。

## `production_batch_termination`

| 字段 | 类型 / 约束 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED` 自增主键 | 结束记录 ID |
| `production_batch_id` | `BIGINT UNSIGNED NOT NULL`，唯一 | 来源生产批次，一批次只能结束一次 |
| `work_order_id` | `BIGINT UNSIGNED NOT NULL` | 来源工单，与批次组成 FK 指向 `production_batches(id,work_order_id)` |
| `planned_quantity` | `DECIMAL(12,4) NOT NULL` | 结束时计划量，正整数 |
| `available_quantity` | `DECIMAL(12,4) NOT NULL` | 实核可用产出，非负整数，尚未办理入库 |
| `additional_scrap_quantity` | `DECIMAL(12,4) NOT NULL` | 本次新增产出报废，非负整数，不含历史已确认报废 |
| `existing_scrap_quantity` | `DECIMAL(12,4) NOT NULL` | 结束时历史已确认报废合计，非负整数，展示用快照 |
| `reason` | `TEXT NOT NULL`，去空白后非空 | 结束原因，接口上限 5000 字符 |
| `material_review_note` | `TEXT NOT NULL`，去空白后非空 | 管理员物料实核及后续处理安排，接口上限 5000 字符 |
| `review_snapshot` | `JSON NOT NULL` | 结束前核对信息，包括来源快照、数量、受影响记录 ID/版本、原库存批次领退料及损耗占用 |
| `created_by` | `BIGINT UNSIGNED NOT NULL`，FK `users.id` | 确认人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 确认时间 |

所有数量 CHECK 强制整数，可用与两类报废之和不超过 `99999999`；无软删除或 `updated_*`、`version` 字段。索引 `(work_order_id,created_at,id)` 用于按工单查阅；BEFORE UPDATE/DELETE 触发器阻止改写事实。新 migration 为 `202609140002-production-batch-termination`；down 在删除任何持久对象之前检查新事实/新状态是否已使用，有数据时拒绝回滚，开发环境可走统一重建流程。

## 结束命令与并发

- `GET /api/production/batches/:batchId/termination-check`：权限 `production:tasks:view`。返回当前核对内容、阻断原因及 `checkToken`；结束后返回原核对快照与结束记录。
- `POST /api/production/batches/:batchId/actions/terminate`：权限 `production:tasks:terminate`。必须提交 `version`、`checkToken`、两项本次数量、原因、物料说明、`confirmImpacts=true` 和 `Idempotency-Key`。
- scope 为 `production.batch.terminate.v1`，请求指纹含来源批次、版本、核对令牌及规范化 body；响应 `{terminationId,batchId}` 通过严格结果 codec 重放。复用平台幂等事务及 12 小时重放窗口；权限仍逐次校验。
- 锁工单 → 来源批次 → 相关记录；提交中的各查询（含报工/报废/领退料及损耗子查询）使用当前读。将重新加载的核对信息做 SHA-256，与预览令牌及批次版本同时比较。已有报工、领退料、损耗或待处理单据变化时需重新核对，不能用旧弹窗覆盖新事实。
- 新事实、关联记录的结束、需求计划版本推进、批次终态、成功审计及幂等结果同事务提交。唯一批次约束和批次锁防止不同幂等键重复结束；失败整体回滚。

## 关联事项及终态

只有工单 `released/doing` 下的 `material_partially_outbound/material_outbound/doing` 批次允许结束。未实际领料的批次沿用原“取消任务”；已完成批次不能再次终止。

确认弹窗展示以下全部影响，必须显式勾选确认：

| 对象 | 结束时处理 | 保留的事实 |
| --- | --- | --- |
| 未结束工序 | 父批次进入 `terminated` 后禁止开工、报工、更正、派工和执行编辑；从员工任务列表移除 | 工序原状态与原报工不伪造完成 |
| 待处理异常 | `pending_review → terminated`，记录处理人/时间并推进版本；不赋予报废/返工处理类型 | 来源异常报工和原备注 |
| 未完成返工 | `pending/doing → cancelled` | 已完成返工及其报工事实 |
| 未履约补料 | `approved → cancelled`，保持履约人/时间为空；取消补料不再参与可执行补产来源 | 已批准的历史授权和已履约补料；不创建新授权 |
| 待领料出库 | `pending_picking → cancelled`，`cancel_source=production_termination` | 已确认出库及库存流水 |
| 活动分配 | `active → released`，释放尚未出库预留；不改原分配数量 | 原精确版本、库存批次与已领量，结束后仍可沿来源退料 |
| 活动需求 | 统一需求计划 Writer 将剩余需求取消，`cancel_source=production_termination`；推进批次需求计划版本，撤销未消耗短批授权 | 原需求数量、已履约历史、已消耗短批授权 |

待确认物料损耗单阻断结束，管理员先取消或按真实业务处理，不能为了结案调用会补料的确认命令。冻结/异常分配及未完成且不能取消的出库状态也阻断。终止时损坏物料暂通过核对说明记录，尚无结构化“不补料损耗”数量占用入口；不得将损坏实物作为可用余料退回。

退料继续走已有独立命令，按原分配的确认领料量扣减待确认/已确认退料和损耗占用校验额度；结束不自动生成退料、恢复需求或替代实物核对。核对页展示的是上限，非现场实存数量。

全部所属批次进入 `completed/cancelled/terminated` 后，可通过工单提前关闭按钮结案。存在 `terminated` 批次时 `close_type=production_terminated`，仍须关闭原因；不要求可用产出等于计划，不把结案展示为足量完工。正常足量完工仍只接受所有非取消批次为 `completed`。

## 黑盒验收入口

生产任务 → 已领料或执行中批次 →“结束本轮”。填写可用、新增报废、原因与物料安排，核对全部联动事项后确认。结束后从“产出处置”查看不可编辑的记录，再到工单页面提前关闭。

用户先验证部分可用/部分报废、全部报废、零产出但已领料、存在异常/返工/补料、待确认损耗阻断、旧弹窗遇到新报工、重复点击、结束后停止报工及继续退料。确认 UI 和设计后再编写测试集并由 Luna MAX 全量验证；成品入库验收待后续能力接入。
