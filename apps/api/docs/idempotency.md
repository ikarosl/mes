# HTTP 幂等性与并发契约

本文只描述当前有效契约。实施过程记录不作为设计依据；当前代码、scope 常量、接口契约和测试是实现事实来源。

## 1. 当前启用范围

幂等能力按端点显式启用。客户端只发送 `Idempotency-Key`，scope 由服务端
`production-idempotency-scopes.contract.ts` 唯一定义。

| 命令 | HTTP 入口 | scope |
| --- | --- | --- |
| 创建生产批次 | `POST /api/production/work-orders/:workOrderId/batches` | `production.batch.create.v6` |
| 创建物料分配 | `POST /api/production/batches/:batchId/material-allocations` | `production.material-allocation.create.v1` |
| 创建生产领料出库单 | `POST /api/production/batches/:batchId/material-outbounds` | `production.material-outbound.create.v3` |
| 确认生产领料出库单 | `POST /api/production/material-outbounds/:outboundId/actions/confirm` | `production.material-outbound.confirm.v2` |
| 管理员一次确认全部 BOM 行的精确版本需求 | `POST /api/production/batches/:batchId/material-demands/configurations` | `production.material-demands.configure.v1` |
| 创建任务级人工追加物料需求 | `POST /api/production/batches/:batchId/material-demands/additions` | `production.material-demands.add-manual.v2` |
| 创建外购物料入库单 | `POST /api/production/purchase-inbounds` | `production.purchase-inbound.create.v1` |
| 确认外购物料入库单 | `POST /api/production/purchase-inbounds/:inboundId/actions/confirm` | `production.purchase-inbound.confirm.v1` |
| 创建工序报工 | `POST /api/production/batches/:batchId/step-records/:recordId/reports` | `production.step-report.create.v3` |
| 更正工序报工 | `POST /api/production/batches/:batchId/step-records/:recordId/reports/:reportId/actions/correct` | `production.step-report.correct.v3` |
| 完成返工 | `POST /api/production/reworks/:reworkId/actions/complete` | `production.rework.complete.v1` |
| 确认报废补料方案 | `POST /api/production/abnormal-dispositions/:dispositionId/scrap-supplement-plan/actions/confirm` | `production.abnormal.scrap-supplement-plan.confirm.v1` |
| 创建生产领料损耗 | `POST /api/warehouse/scraps` | `production.material-loss.create.v1` |
| 确认生产领料损耗 | `POST /api/warehouse/scraps/:scrapId/actions/confirm` | `production.material-loss.confirm.v1` |

此表是文档摘要；代码事实来源始终是 scope 常量与 Controller 上的 `@IdempotentEndpoint({ scope })`。
未启用端点携带任意幂等键（包括空值、超长值以及公开端点）必须返回
`400 IDEMPOTENCY_NOT_SUPPORTED`，不得忽略请求头制造伪幂等信号。启用端点缺少键或键不合法返回
`400 VALIDATION_ERROR`。键 trim 后长度必须为 1～150 个字符。

## 2. 项目级决定

- MySQL 是幂等事实来源；该能力不依赖 Redis。
- 幂等记录、业务写入和成功审计复用同一连接、同一事务。
- Controller 只声明 scope 并读取已校验上下文，不开启事务。
- application service 调用 `IdempotencyExecutor`；传给业务 Repository 的上下文必须收窄为普通
  `CommandContext`，不得携带幂等键。
- 每个 scope 必须绑定完整结果 codec。首次成功和重放都返回 codec 规范化后的同一结果形状。
- 文件上传及其他包含非事务外部副作用的命令，未建立 outbox、补偿或恢复闭环前不得直接套用 MySQL 幂等 executor。
- 管理端只有在复用同一个 `Idempotency-Key` 并设置 `retryIdempotentWrite: true` 时才允许写请求自动重试；普通写请求、未启用端点和文件上传不得开启该选项。

version 乐观锁与 HTTP 幂等解决不同问题：version 防止基于旧状态覆盖写，幂等键防止同一业务意图因响应不确定而重复执行。已使用状态短路和 version 且响应丢失不会产生第二份事实的命令，可以不启用 HTTP 幂等。

## 3. 请求流程

```text
请求
  -> IdempotencyKeyGuard
     -> 未启用且带键：400 IDEMPOTENCY_NOT_SUPPORTED
     -> 已启用但键缺失/非法：400 VALIDATION_ERROR
     -> 写入请求局部的已验证键
  -> @CurrentIdempotentCommandContext()
  -> application service
  -> IdempotencyExecutor.execute()
     -> 计算请求指纹
     -> 开启 MySQL 事务
     -> 登记/仲裁幂等记录
     -> 首次执行业务写入和成功审计，或读取已保存结果
     -> 提交
  -> 返回规范化结果
```

重放请求拥有新的 request ID，但 `http_idempotency_records.initial_request_id` 保留首次请求 ID；重放不追加第二条业务成功审计。

## 4. 代码边界

```text
common/idempotency/
  idempotency-executor.ts       # 协议无关端口与结果 codec
  idempotency.errors.ts         # 存储错误分类

infrastructure/idempotency/
  idempotency.module.ts         # 平台装配
  idempotency-key.guard.ts      # 端点启用门禁和键校验
  canonical-request-fingerprint.ts
  mysql-idempotency.executor.ts
  idempotency-housekeeping.service.ts
  idempotency.metrics.ts

modules/production/application/idempotency/
  production-idempotency-scopes.contract.ts
  production-*-result.codec.ts
```

`http_idempotency_records` 的业务写入口只能是 `MysqlIdempotencyExecutor`，到期物理清理只能由
`IdempotencyHousekeepingService` 执行。业务 Controller、Service 和 Repository 均不得直接访问该表。

## 5. 数据库记录与保留期

### `http_idempotency_records` 结构

表由 [202608050001-http-idempotency-records.up.sql](../../../packages/database/migrations/202608050001-http-idempotency-records.up.sql) 创建，属于 API 平台幂等基础设施。使用 InnoDB、`utf8mb4`，表默认排序规则为 `utf8mb4_0900_ai_ci`。

| 字段 | 类型 | 允许 NULL | 默认值 / 自动生成 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | 否 | `AUTO_INCREMENT` | 幂等记录主键 |
| `scope` | `VARCHAR(128)` | 否 | 无 | 服务端命令契约范围，列排序规则 `utf8mb4_bin` |
| `idempotency_key` | `VARCHAR(150)` | 否 | 无 | 客户端业务意图键，列排序规则 `utf8mb4_bin` |
| `request_fingerprint` | `CHAR(64)` | 否 | 无 | 规范化请求的 SHA-256 十六进制摘要，列排序规则 `ascii_bin` |
| `actor_id` | `BIGINT UNSIGNED` | 否 | 无 | 首次请求的认证操作者 |
| `initial_request_id` | `VARCHAR(128)` | 否 | 无 | 首次请求追踪 ID，重放不覆盖 |
| `status` | `VARCHAR(16)` | 否 | 无 | `processing` 或 `completed`，由 executor 显式写入 |
| `result_json` | `JSON` | 是 | `NULL` | 经结果 codec 校验的完成结果快照 |
| `created_at` | `DATETIME` | 否 | `CURRENT_TIMESTAMP` | 首次登记时间 |
| `completed_at` | `DATETIME` | 是 | `NULL` | 完成时间，由 executor 写入 |
| `expires_at` | `DATETIME` | 是 | `NULL` | 允许清理时间，由 executor 按完成时间加 12 小时写入 |

可空列未显式声明 `DEFAULT`，其隐式默认值为 SQL `NULL`。本表采用专用生命周期字段，不继承业务单据的 `updated_by`、`updated_at`、`version` 或软删除字段。

| 物理约束 / 索引 | 定义与用途 |
| --- | --- |
| `PRIMARY KEY` | `(id)` |
| `uk_http_idempotency_scope_key` | `UNIQUE (scope, idempotency_key)`，区分大小写地仲裁同一命令范围内的键；不按操作者另分唯一键 |
| `idx_http_idempotency_expires_at` | `INDEX (expires_at)`，支持到期清理 |
| `idx_http_idempotency_initial_request` | `INDEX (initial_request_id)`，支持首次请求追踪 |
| `fk_http_idempotency_actor` | `FOREIGN KEY (actor_id) REFERENCES users(id)`；InnoDB 为外键列提供支撑索引 |
| `chk_http_idempotency_status` | `CHECK (status IN ('processing', 'completed'))` |
| `chk_http_idempotency_completed` | `completed` 时 `result_json`、`completed_at`、`expires_at` 必须全部非 SQL `NULL`；`processing` 时三列必须全部为 SQL `NULL` |

完成条件的完整 CHECK 表达式为：

```sql
CHECK (
  (status = 'completed' AND result_json IS NOT NULL AND completed_at IS NOT NULL AND expires_at IS NOT NULL)
  OR (status = 'processing' AND result_json IS NULL AND completed_at IS NULL AND expires_at IS NULL)
)
```

该 CHECK 不校验结果业务形状或时间先后，也不在数据库层强制 12 小时间隔；这些由结果 codec 和 executor 保证。JSON 字面值 `null` 与 SQL `NULL` 不同，是否允许该结果由对应 codec 决定。

### 保留期与业务使用

`completed` 记录提供至少 12 小时的服务端重放保证。到达 `expires_at` 只表示允许清理；记录物理删除前，同
scope/key 仍按既有记录仲裁。清理后该 scope/key 才可能成为新的首次请求。

客户端不得在超过 12 小时后自动重试旧键，也不得自动换新键盲发。首次结果可能已经成功，必须先核对业务结果，再由用户显式放弃旧意图。

物料需求配置和人工追加均由 application service 调用 `IdempotencyExecutor`，业务规则以
[Production 需求设计](../src/modules/production/docs/database/demand-allocation-and-outbound.md)及
[需求配置 Repository](../src/modules/production/infrastructure/mysql-production-material-demand-configuration.repository.ts)为准：

- 初始配置必须一次覆盖任务的全部 BOM 行，明确每行的精确物料版本及数量。写事务先锁定工单和批次，
  重新读取 Product 公共 BOM，并锁定、校验启用版本；每行拆分数量之和必须等于该行应需量。全部校验
  通过后，在同一事务写入所有需求基础与初始需求，并将批次从 `pending` 推进至 `material_pending`。
  任一行缺失或不合法均整单回滚，不产生部分配置事实。
- 人工追加是针对已生成初始需求的进行中任务的一次动作，可以选取任务冻结 BOM 中的多种基础物料，
  无需覆盖全部 BOM 行。事务内锁定工单、批次和冻结需求基础，校验启用版本、正整数追加数量及工单
  物料版本规则后，写入一条 `production_manual_demand_addition` 和对应的多条需求。需求通过
  `manual_addition_id` 关联追加动作，`parent_demand_id` 为空；不读取当前 BOM 替代任务冻结基础。
- 两类命令均遵守工单类型约束：批量单同一基础物料只能选择一个版本并遵守工单级版本锁，研发单允许
  多版本拆分。新增需求统一经 Production 需求计划写入器推进 `material_plan_version`；幂等记录、
  业务事实、批次更新和成功审计同事务提交。同 scope/key、同请求的成功重放只返回已保存结果，
  不再次生成需求、推进计划版本或追加成功审计。

## 6. 规范化请求指纹

服务端按以下输入计算 SHA-256：

```ts
{
  scope,
  actorId,
  params,
  query,
  body,
}
```

输入是 DTO 转换、trim 后的业务有效载荷；排除 `Idempotency-Key`、request ID、IP、User-Agent、Cookie、Token
等传输或审计元数据。对象键递归排序、数组顺序保留、`undefined` 对象属性忽略，随后对 canonical JSON 计算摘要。
只接受 JSON-safe 值，不放宽到 `Date`、getter、自定义原型或循环引用。
Application Service 必须把 class DTO 显式映射成普通对象后再传入 `request.body`，嵌套 DTO 同样逐层转换；不能将 DTO 实例直接用于指纹。产出清单送审使用独立的 `{ version, submissionToken }` 对象，指纹与 Repository 校验共用该有效载荷。

固定兼容向量：

```ts
const input = {
  scope: 'production.batch.create.v1',
  actorId: '7',
  params: { workOrderId: '42' },
  query: {},
  body: { plannedQuantity: '2.0000', routeId: '18' },
};

// e6138c319f8d59537d6812947f08c0e85b2afe7f590aacedd7a666f3a4ea7a8c
```

这里的 v1 是算法测试向量，不代表当前 createBatch scope。修改规范化算法或固定向量属于兼容性变更，必须评审并为受影响命令提升 scope 版本。

## 7. MySQL Executor 事务语义

首次请求：

1. 在事务内插入 `processing` 记录。
2. 执行业务 handler；Repository 通过活动事务连接写业务事实和成功审计。
3. `resultCodec.encode`、JSON-safe 校验和 `decode` 产生规范化结果。
4. 将记录更新为 `completed`，保存结果并设置 12 小时保留期。
5. 提交后返回规范化结果，并记录 first-run 指标。

相同 scope/key 的并发请求由唯一键和 InnoDB 锁仲裁：

- 相同指纹且已有 `completed`：不执行 handler，decode 已保存结果并重放；
- 指纹不同：返回 `409 IDEMPOTENCY_CONFLICT`；
- 竞争方回滚或只能看到异常 `processing`：返回可重试存储错误，不猜测结果。

业务失败、数据库失败、审计失败、结果 encode/decode 失败或完成更新失败都会使整个事务回滚，不留下失败占位或已提交业务事实。成功指标只在 commit 后记录。

## 8. 错误与日志语义

| 情况 | HTTP/业务语义 |
| --- | --- |
| 未启用端点携带键 | `400 IDEMPOTENCY_NOT_SUPPORTED` |
| 已启用端点缺少或携带非法键 | `400 VALIDATION_ERROR` |
| 同 scope/key 但请求指纹不同 | `409 IDEMPOTENCY_CONFLICT` |
| MySQL 锁等待、死锁、连接中断或池关闭 | `503 IDEMPOTENCY_STORAGE_RETRYABLE` |
| 已保存结果无法通过 codec 解析 | `500 IDEMPOTENCY_RESULT_CORRUPT` |
| 业务校验或权限失败 | 保留原有错误；事务回滚，不保存失败结果 |

日志只能记录 request ID、scope、错误分类和幂等键 SHA-256 摘要前 12 位；禁止输出原始幂等键、请求体、Token、Cookie 或凭证。结果损坏是人工调查信号，同键重试不会自行恢复。

## 9. 前端键生命周期

`useIdempotentIntent` 由页面或弹窗局部持有，不进入 Pinia 或 API wrapper：

- 第一次正式提交才生成加密随机 UUID；
- 成功或明确业务失败后清除当前意图；
- 无响应、断网或可重试 5xx 属于结果不确定，保持原键重试；
- 结果不确定时修改业务内容，必须阻止提交，不得静默换键；
- `IDEMPOTENCY_RESULT_CORRUPT` 阻塞当前意图，提示人工核对；
- 超过 12 小时后阻止旧键重试和自动换键，要求先核对业务结果；
- 页面硬刷新会丢失内存意图，因此当前方案不承诺跨刷新恢复。

前端稳定签名只用于判断表单内容是否变化，不是安全请求指纹。服务端仍独立计算包含 actor、scope、params、query
和 body 的完整指纹。API wrapper 只转发调用方提供的键。

## 10. 清理与运行维护

`IdempotencyHousekeepingService` 默认每小时运行一次，可通过
`IDEMPOTENCY_SWEEP_INTERVAL_MS` 调整。非法、零或负值会禁用自动清理并告警。

- 每批最多删除 500 条已到期 `completed` 记录，避免长事务锁表；
- 持久化可见的 `processing` 记录属于异常信号，只告警，不自动修改或删除；
- 清理不改变 12 小时内重放保证；
- 运维不得人工把未知 `processing` 改成 `completed`，也不得伪造结果 JSON。

## 11. 测试要求

每个新增或变更的幂等命令至少覆盖：

- Guard 的启用/未启用/公开端点矩阵；
- scope 常量、Controller 元数据、Service executor 和结果 codec 一致；
- 同键同请求重放、同键不同请求冲突及 handler 只执行一次；
- 结果首次返回与重放形状一致；
- 业务失败、审计失败、序列化失败和 commit 失败整体回滚；
- 锁等待、死锁和连接故障映射为 retryable，其他 SDK 网络错误不被误判；
- 前端模糊失败复用键、明确失败清除、内容变化阻塞、结果损坏阻塞及超时阻塞；
- 真实 MySQL 唯一键竞争、事务原子性和到期清理。

真实 MySQL 测试只能连接名称以 `_test` 或 `_ci` 结尾的专用库，并通过仓库现有集成测试门禁显式启用。

## 12. 观测与启用门槛

平台内存指标至少区分 first run、replay、conflict、storage retryable 和 corrupt。Housekeeping 周期性输出窗口摘要；first run/replay 只在事务提交后计数。

新增端点只有同时满足以下条件才能加 `@IdempotentEndpoint`：

1. 业务写入和成功审计可复用 executor 的同一 MySQL 事务；
2. 服务端稳定 scope 和完整结果 codec 已定义；
3. 请求指纹覆盖全部语义输入；
4. Controller、Service、前端键生命周期和接口契约同时接线；
5. 第 11 节相关测试通过；
6. 不包含尚未纳入事务恢复模型的外部副作用。

## 13. scope 版本与开发重置

scope 是服务端独占的命令契约版本，客户端不得传输、选择或协商。结果结构、指纹或命令语义发生不兼容变化时升级 scope 和 codec。项目当前处于开发阶段，清理旧幂等和业务数据后切换新代码，不保留旧 scope 解码分支、双写或兼容窗口，也不得用新 codec 猜旧结果。发布前结束旧客户端操作并刷新页面，不将旧意图自动迁入新 scope。

创建批次当前使用 `production.batch.create.v6`，包含执行完成时间、结案模式与当前批准版本等结果字段；报工数量与批准产出分开。scope 常量为当前契约唯一来源。

## Production 需求纠错与逐项收尾

需求更正送审使用 `production.demand-correction.submit.v1`。收尾开始、逐项处理分别使用 `production.batch-closeout.begin.v1`、`production.batch-closeout.handle.v1`。产出清单独立命令如下：

| 命令 | scope |
| --- | --- |
| 保存草稿 | `production.output.draft.v1` |
| 核对物料 | `production.output.material-review.v1` |
| 留存质检记录 | `production.output.inspection.v1` |
| 结案／更正送审 | `production.output.submit.v1` |
| 开启更正 | `production.output.correction.begin.v1` |
| 取消未送审更正 | `production.output.correction.cancel.v1` |

scope 常量由 Production application contract 所有；HTTP 只接收 Idempotency-Key。DTO 显式映射成普通命令对象及纯数据指纹，不把 class 实例传给规范化器。质检结果除根／批次 ID 还保存实际生成的 inspectionRecordId。

送审结果严格保存业务对象 ID 与 Approval 实例 ID，其余收尾命令保存收尾 ID 与批次 ID。送审中的业务记录创建／绑定、Approval 实例和节点、审计与通知都在外层 executor 事务内完成；未发布流程或任何依赖失败则回滚，不能先提交业务申请后异步补审批。

客户端保留原版本、核对令牌、body 和键重试未知结果；新内容是另一意图，不能在模糊失败时换键。通用审批批准／驳回／撤回仍使用既有版本和当前节点校验，不据此宣称支持 HTTP 幂等决定重放。旧直接 terminate 路由已撤下，不再执行批量终止副作用。端点与业务规则见[Production 需求](../src/modules/production/docs/database/demand-allocation-and-outbound.md#正式需求更正与替代)与[收尾](../src/modules/production/docs/database/production-termination.md)。

## 成品入库

独立成品入库命令使用 `production.finished-inbound.create.v1 / update.v1 / confirm.v1 / cancel.v1`，四者共享 `production.finished-inbound` 前缀。每类都使用独立意图，严格结果仅保存 `inboundId`；重放不会重复建批次或追加库存。请求中的来源类别、批准版本、批号、备注／取消原因与版本显式转成普通对象后生成指纹，不接收客户端 scope。

确认的业务事务包含源工单、任务、结案根与入库单锁内复核、创建库存批次、回填明细、写唯一正流水、推进入库单和成功审计；幂等成功记录同事务提交。失败整体回滚。已批准类别必须全量一次接收，最新版本与受影响类别在审锁定均须在重试时由原意图处理，不用改键绕过失败。具体边界见[成品入库](../src/modules/production/docs/database/finished-goods-inbound.md)。

## 自动编号工单创建

`POST /production/work-orders` 使用 `production.work-order.create.v1`，创建请求不再接受手填编号。服务端在 executor 的同一事务内分配北京时间当日序号、创建工单并保存审计与完整响应。成功重放返回首次草稿快照，不重新读取已下达或已编辑的工单，也不再次取号。严格结果 codec 只接受新编号格式，不兼容旧手填编号响应；开发环境直接重置。

同键不同内容拒绝，网络结果未知或平台返回可重试冲突时复用原键。计数与业务写入失败一起回滚；已提交编号在工单取消、关闭后不回收。协议与日计数结构见[工单所有者文档](../src/modules/production/docs/database/work-orders-and-batches.md#工单自动编号)。
