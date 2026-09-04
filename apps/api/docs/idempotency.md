# HTTP 幂等性与并发契约

本文只描述当前有效契约。实施过程记录不作为设计依据；当前代码、scope 常量、接口契约和测试是实现事实来源。

## 1. 当前启用范围

幂等能力按端点显式启用。客户端只发送 `Idempotency-Key`，scope 由服务端
`production-idempotency-scopes.contract.ts` 唯一定义。

| 命令 | HTTP 入口 | scope |
| --- | --- | --- |
| 创建生产批次 | `POST /api/production/work-orders/:workOrderId/batches` | `production.batch.create.v4` |
| 创建物料分配 | `POST /api/production/batches/:batchId/material-allocations` | `production.material-allocation.create.v1` |
| 创建生产领料出库单 | `POST /api/production/batches/:batchId/material-outbounds` | `production.material-outbound.create.v3` |
| 确认生产领料出库单 | `POST /api/production/material-outbounds/:outboundId/actions/confirm` | `production.material-outbound.confirm.v2` |
| 管理员确认基础 BOM 明细的精确版本需求 | `POST /api/production/batches/:batchId/material-demands/configurations` | `production.material-demands.configure.v1` |
| 创建人工追加物料需求 | `POST /api/production/material-demands/:demandId/additions` | `production.material-demands.add-manual.v1` |
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

表结构由 `202608050001-http-idempotency-records` 创建，核心字段包括：

- `scope + idempotency_key`：区分命令契约并形成唯一键，使用区分大小写的二进制排序规则；
- `request_fingerprint`：同键是否仍代表同一业务输入；
- `actor_id`：认证操作者；
- `initial_request_id`：首次请求追踪 ID；
- `status`：仅允许 `processing/completed`；
- `result_json`：完成结果的 JSON 快照；
- `completed_at/expires_at`：完成与允许清理时间。

`completed` 记录提供至少 12 小时的服务端重放保证。到达 `expires_at` 只表示允许清理；记录物理删除前，同
scope/key 仍按既有记录仲裁。清理后该 scope/key 才可能成为新的首次请求。

客户端不得在超过 12 小时后自动重试旧键，也不得自动换新键盲发。首次结果可能已经成功，必须先核对业务结果，再由用户显式放弃旧意图。

物料需求配置按基础 BOM 明细逐行确认，两个新增命令均通过 `IdempotencyExecutor` 写入：配置命令在同一事务内锁定批次、重新读取 Product 公共 BOM 与启用的精确物料版本，写入需求基础和对应需求事实；人工追加命令按具体父需求重新校验批次/BOM/启用版本后写入追加动作与需求事实。所有需求事实写入必须经 Production 的需求计划写入器推进 `material_plan_version`，不得恢复旧的一键整批生成入口。

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

## 13. scope 版本兼容

scope 是服务端独占的命令契约版本，客户端不得传输、选择或协商。结果结构、指纹语义或命令语义发生不兼容变化时：

1. 新增 scope 版本和对应 codec；
2. 新请求只写新 scope；
3. 如需兼容旧记录，在至少覆盖旧记录最长保留期的窗口内保留旧 scope 的 decode 能力；
4. 窗口结束且旧记录已自然过期/清理后，再删除旧兼容分支。

不得用新 codec 猜测旧结果，也不得覆盖旧 scope 记录。兼容示例和算法测试中的旧版本字符串不是当前端点版本；当前版本以 scope 常量为准。
