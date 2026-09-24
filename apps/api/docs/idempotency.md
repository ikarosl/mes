# HTTP 幂等性与并发契约

本文维护 API 平台的幂等执行、持久化、恢复和启用条件。HTTP 可见契约见[公共 API 规范](../../../docs/api-conventions.md#7-请求上下文与幂等键)，前端提示与重试见[HTTP 错误处理](../../admin-web/docs/http-error-handling.md)。

## 1. 当前启用范围

幂等按端点显式启用，以 Controller 的 `@IdempotentEndpoint({ scope })` 和 application scope 契约为准：[Production](../src/modules/production/application/idempotency/production-idempotency-scopes.contract.ts)、[Procurement](../src/modules/procurement/application/idempotency/procurement-idempotency-scopes.contract.ts)、[Quality](../src/modules/quality/application/idempotency/finished-inspection-idempotency.contract.ts)。本文不复制命令与版本清单。

客户端只发送 Idempotency-Key，不传 scope。未启用端点含 Public 携带任意键（空值／超长值也包括）返回 `400 IDEMPOTENCY_NOT_SUPPORTED`；启用端点缺少键或 trim 后长度不在 1～150 返回 `400 VALIDATION_ERROR`。不能忽略 header 制造伪幂等信号，也不能仅按 HTTP 方法扩大启用范围。

## 2. 项目级决定

- MySQL 是唯一幂等事实来源，不依赖 Redis。幂等记录、业务写入、成功审计复用同一连接和事务。
- Controller 声明 scope、读取已校验上下文；application 调 executor。业务 Repository 仅接收普通 CommandContext，不携带键或解析 header，见[命令上下文](command-context.md)。
- 只有 executor 写 http_idempotency_records，housekeeping 只做到期物理清理。业务代码不得直接读写此表。
- 每个 scope 绑定完整结果 codec，首次和重放均返回其规范化结果。当前只保存成功结果，失败不留占位或缓存；端点沿用固定成功状态码，requestId 等易变响应头按本次请求产生。
- version 防旧状态覆盖，幂等键防同一意图重复执行，二者不可互代。已有状态短路及 version 的命令是否启用，以各模块契约为准。
- 文件上传、外部 HTTP 和消息发送等不在 MySQL 事务内，未建立 outbox、补偿或恢复闭环不能套用 executor 宣称原子幂等；Product 上传当前不得带键或自动重试。

## 3. 登记前校验与审计关联

鉴权、DTO 与请求头校验在登记前完成；Guard 将 trim 后的键写入请求局部私有属性，参数装饰器不重新解析原 header。首次登记以当前 requestId 写 initial_request_id，关联首次成功审计；重放保留首次值，只返回本次 requestId，不重复写业务成功审计，也不把原始键写入 operation_logs。

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

CHECK 只约束完成字段的 SQL NULL 组合，不校验结果形状、时间先后或 12 小时间隔；这些由 codec／executor 保证。JSON 字面值 null 不等于 SQL NULL，是否接受该结果由对应 codec 决定。

完成记录保证至少 12 小时重放。expires_at 只代表允许清理，物理删除前同 scope/key 仍按原记录仲裁，过期也重放；物理删除后才可能变为首次执行。因此客户端超过窗口不能自动重试旧键或换新键，须先核对业务结果。

## 6. 规范化请求指纹

服务端对 scope、已认证 actorId、语义 path params、query 和规范化 body 计算 SHA-256，包含 version、核对令牌等所有业务输入。排除键、requestId、IP、User-Agent、Cookie、Token 等传输／审计信息；客户端签名不是安全指纹。

application 将 DTO 及嵌套 DTO 显式转成普通对象并完成 trim 后再传入。对象键递归排序，数组保序，undefined 对象属性忽略；仅接受 JSON-safe 值，不放宽到 Date、getter、自定义原型或循环引用。规范化算法及固定兼容向量见[指纹测试](../src/infrastructure/idempotency/__tests__/canonical-request-fingerprint.test.ts)；向量中的旧 scope 仅为算法兼容基准，不能当作当前命令版本。修改算法／向量须评审并提升受影响 scope。

唯一键为区分大小写的 `(scope, idempotency_key)`，不按用户另分唯一键；actor 在指纹内，因此他人复用同键会冲突。

## 7. MySQL Executor 事务语义

首次在事务内登记 processing，执行 handler、业务与审计，经过结果 encode、JSON-safe 校验及 decode 后保存 completed 快照和到期时间，commit 后返回并计成功指标。handler、数据库、审计、序列化、完成更新或提交失败均整体回滚，不留下失败占位或独立提交的业务事实。

唯一键与 InnoDB 锁仲裁同 scope/key 的并发请求：相同指纹且已完成只 decode 重放、不再执行 handler；不同指纹返回冲突；竞争方回滚或读到异常 processing 时返回可重试存储错误，不猜成功或伪造结果。成功重放使用原快照，不因当前业务状态变化重新执行业务，也不恢复旧授权资格。

## 8. 错误与日志语义

| 情况 | 结果 |
| --- | --- |
| 同键不同指纹 | `409 IDEMPOTENCY_CONFLICT` |
| 已识别的 MySQL 锁等待、死锁、连接中断或池关闭 | `503 IDEMPOTENCY_STORAGE_RETRYABLE` |
| 已保存结果无法通过 codec | `500 IDEMPOTENCY_RESULT_CORRUPT` |
| 业务／权限校验失败 | 保留原错误，失败结果不保存 |
| 指纹、executor 或 handler 的未知代码异常 | `500 INTERNAL_SERVER_ERROR`，不能因处于幂等链路而改写分类 |

其他 SDK 网络错误不误判为 MySQL retryable。损坏记录保留供调查，同键重试不会自行修复，不自动另建意图。诊断仅记录 requestId、scope、分类及键 SHA-256 前 12 位；不输出原键、载荷、Token、Cookie、凭证。原异常链仅开发环境可记录，其他环境的脱敏边界见 [API 诊断](../README.md#http-错误诊断)。

## 9. 前端键生命周期

局部 useIdempotentIntent 在首次正式提交时生成加密 UUID，firstAttemptAt 从此时起算 12 小时，并保存实际发送的参数／body／版本／令牌。成功或契约明确无副作用的业务 4xx 结束意图；网络中断及不确定结果保留原键原请求，修改内容不能静默换键。损坏结果或超窗口阻塞并要求核对，用户明确放弃后才可开始新意图。

当前仅内存保存，KeepAlive 可恢复，硬刷新不可恢复；只保存键或 payload hash 不构成闭环。会话变化销毁旧意图，API wrapper 只透传键，不持有或生成。前端实现及关闭保护见[管理端架构](../../admin-web/docs/architecture.md#5-写意图与错误)。只有启用幂等且携带原键的写请求可开启 retryIdempotentWrite，失败范围见[重试矩阵](../../admin-web/docs/http-error-handling.md#4-基础请求与重试)。

## 10. 清理与运行维护

housekeeping 默认每小时运行，IDEMPOTENCY_SWEEP_INTERVAL_MS 非法、零或负值会禁用并告警；每批最多清理 500 条已到期 completed。持久可见 processing 属异常，只告警，不自动修改／删除；运维不得人工改 completed 或伪造 result_json。

内存指标区分首次、重放、冲突、可重试存储错误及损坏；housekeeping 输出窗口摘要。首次和重放仅 commit 后计数，不能把成功尝试当作已提交事实。

## 11. 验证与启用门槛

新增端点须具备同事务业务／审计、稳定 scope、完整 codec、覆盖全部语义输入的指纹，以及 Controller、Service、前端恢复与契约接线，不包含未纳入恢复模型的外部副作用。

在[测试策略](../../../docs/testing-strategy.md)规定阶段验证启用／未启用／Public 矩阵、接线一致、同键重放／同键异内容冲突、handler 仅一次、首次与重放形状一致、业务／审计／codec／commit 失败回滚、MySQL 瞬态错误分类、前端未知／损坏／超时恢复及真实唯一键竞争／清理。真实 MySQL 测试的专用端点与 `_test` 库门禁见[测试策略](../../../docs/testing-strategy.md#业务-mysql-integration)。

根 [AGENTS.md](../../../AGENTS.md#数据库与交付约定)规定设计确认后另行通知正式测试；仅完成接线的命令不能宣称上述验证已通过，状态留在[路线图](../../../docs/roadmap.md)。

## 13. scope 版本与开发重置

scope 是服务端独占版本，客户端不能选择／协商。不兼容的结果形状、指纹或命令语义变更须升级 scope 和 codec。开发阶段清理旧幂等及业务数据后切换，不保留旧 scope 解码分支、双写或兼容窗口，不用新 codec 猜旧结果。发布前结束旧客户端操作并刷新，不把旧意图自动迁入新 scope。

## 14. 业务接入时的原子边界

以下是平台容易遗漏的接线边界，业务资格与数量算法仍由模块所有者维护：

- [生产需求](../src/modules/production/docs/database/demand-allocation-and-outbound.md)：需求事实、锁版基础／material_plan_version、审计和结果同事务，重放不再生成需求或推进版本。研发开始／结束同样保存原状态转换结果，重放不再消费授权或推进任务。
- [审批与收尾](../src/modules/production/docs/database/production-termination.md)：送审的业务记录绑定、Approval 实例／节点、审计及通知均在外层事务，不先保存申请再异步补审批。通用批准／驳回／撤回仍依赖当前节点和版本，不据此宣称 HTTP 幂等重放。损坏登记与实核版本同事务，不能附加第二次库存扣减。
- [成品质检](../src/modules/quality/docs/finished-inspections.md)：先规范化输入，再对完整事实指纹。全检显式总量与派生值相等时，和省略该值形成同一语义；说明 trim，合格数可由规范化实检／不合格数还原。结果保存 batchId、实际 inspectionId 和新 version，不能只保存成功布尔值。
- [成品入库](../src/modules/production/docs/database/finished-goods-inbound.md)：来源锁内复核、库存批次／流水、单据与审计同事务，结果严格保留 inboundId，重放不再建批或写库存；不能换键绕过当前来源锁。
- [工单创建](../src/modules/production/docs/database/work-orders-and-batches.md#工单自动编号)：取号、业务、审计和完整结果同事务，重放首次草稿快照，不重读已变化工单或再取号。
- [来料整批](../src/modules/procurement/docs/receipt-acceptance.md)：实际执行指纹含 allocation 及行／轮版本、实收修订、QC、数量；correct 指纹含核实总量与原因、不含 ownership，reject 的可选 ownership 含逐行 ID、数量和顺序。撤销拒收重放不再次换轮，旧成功快照不重新授予执行资格。
