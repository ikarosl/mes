# 并发与幂等性规则

## 1. 乐观锁（version）

所有未来可变业务单据必须包含一个整数字段 `version`，初始值为 `0`。Repository 必须使用预期的版本号进行原子更新：

```sql
UPDATE business_document
SET status = ?, version = version + 1, updated_by = ?
WHERE id = ? AND version = ?;
```

当无行受影响时，持久化代码抛出协议无关的并发错误。HTTP 异常过滤器将其映射为 HTTP 409，错误码为 `CONCURRENT_MODIFICATION`。

## 2. 防重复提交的分层定义

防重复不是单一机制，按三层分工，各层职责不同、互不替代：

| 层     | 机制                                         | 解决的问题               | 边界                                           |
| ------ | -------------------------------------------- | ------------------------ | ---------------------------------------------- |
| 交互层 | 前端提交中守卫（`submitting`、行级 pending） | 同一页面双击、重复点击   | 只防同一客户端同一页面；不是安全边界           |
| 数据层 | 业务唯一键 + 乐观锁                          | 数据不允许重复、并发覆盖 | 只在业务键**可复现**时天然幂等（见下）         |
| 协议层 | HTTP 幂等键                                  | 重试识别、重放返回原结果 | 只用于无天然可复现业务键、或需要安全重试的接口 |

**业务唯一键（UNIQUE）不等于幂等键。** UNIQUE 只保证「同一业务键的数据不重复」，不保证「同一意图的重复请求被识别」。它作为幂等兜底的前提是**键可复现**：

- 键由用户输入（如手工填写的 `work_order_no`）：重复请求携带相同键，UNIQUE 可拦截；
- 键可由业务内容重算（如 `NORMAL:{production_batch_id}:{product_material_id}`）：天然幂等；
- 键由后端自动生成（如留空自动生成的 `batch_no`）：两次重复请求产生两个不同键，UNIQUE 失效，**必须由 HTTP 幂等键兜底**。

乐观锁挡并发覆盖，但「请求成功、响应丢失后的重试」会因 version 已变化而返回 409，导致用户看到失败而业务实际已成功——此类接口应使用幂等键实现「重放返回原结果」。

判断“天然幂等”必须覆盖完整 application/API 调用链，而不只是 Repository 最后的 UNIQUE 或状态短路。
如果重复请求在到达短路前还会读取可能变化的主数据、调用外部依赖或重新校验已经不成立的前置条件，导致
已成功操作的重试返回失败，就还没有满足“返回等价成功结果”的天然幂等契约。

## 3. HTTP 幂等键

### 3.1 本项目的生成决定

本项目的 HTTP 幂等键由管理端在一次提交意图第一次正式提交时使用 `crypto.randomUUID()` 生成。服务端不提供
“预先领取幂等键”的接口，也不使用请求内容 hash 充当键：前者会增加一次请求和孤儿键管理，后者无法
区分“响应丢失后的重试”与“用户明确发起的第二次相同业务动作”。

API 包装函数必须接收调用方传入的键，禁止在每次调用内部生成。键的生命周期规则如下：

- scope 完全由服务端控制：客户端只发送 `Idempotency-Key`，不传输、不协商 scope，也不能决定服务端存储
  命名空间。项目不增加 `Idempotency-Scope`、`X-Api-Version`、`X-Idempotency-Version` 等头，也不做前端
  构建版本协商；scope 是后端唯一事实来源（createBatch 见
  `apps/api/src/modules/production/application/idempotency/production-idempotency-scopes.contract.ts`），前端只
  用本地意图名（`intentType`）区分业务意图，不带版本、不发送给后端（见实施方案 §13）；
- 键绑定“一次尚未确认结果的提交意图”，不绑定某次点击，也不简单绑定弹窗是否打开；第一次正式提交时
  才生成 K1，打开弹窗或编辑草稿本身不生成键；12 小时重放保证窗口（前端 `firstAttemptAt`）也从这次点击
  起算；
- 上次结果未知且业务有效载荷未变时继续使用 K1，包括手动重试、Axios 自动重试，以及持有该意图的
  KeepAlive/composable 实例仍存活时切换缓存路由再返回；
- 从未提交的草稿（idle）允许任意修改：第一次正式提交才生成键；已明确成功或收到明确无副作用 4xx 后旧
  意图已清除，修改并在下次提交自然生成新键；**已模糊失败、结果未确认的意图（pending/blocked/expired）
  修改业务内容时不得静默替换 K1**——首次结果是否成功不可知，自动换新键盲发会制造重复批次，必须提示先
  核对业务结果、由用户显式放弃后重新提交；
- K1 已明确成功后，用户再次发起内容相同的动作也属于新意图，必须生成 K2；
- 按当前“失败结果不缓存”契约，明确的校验、权限或业务 4xx 表示没有业务写入并结束本次意图；如果未来
  某接口缓存错误或返回“仍在处理”，必须在接口契约中单独声明，前端不能自行猜测；
- 用户明确取消、重新新建或清空整个操作时结束旧意图。对结果未知的高风险提交，关闭前应提示其无法安全
  恢复，不能把关闭弹窗静默等同于“后端一定没有执行”；
- 前端不得把 pending 守卫当作服务端幂等。
- 幂等基础设施错误分两类处理：可重试存储失败（`503 IDEMPOTENCY_STORAGE_RETRYABLE`，锁等待/死锁/连接中断
  等瞬态）继续保留原键重试；结果损坏（`500 IDEMPOTENCY_RESULT_CORRUPT`，已保存结果无法反序列化）是确定性
  失败，请求层不得把它当普通 5xx 自动重试（同键重试必然再次失败），必须直接交由上层阻塞当前意图并提示
  人工处理：既不能当作模糊失败死循环重试，也不能清除意图自动换新键（首次结果是否成功不可知），直到用户
  显式放弃意图。
- 幂等意图与服务端重放保证窗口对齐：键创建后 12 小时内（与 `expires_at = completed_at + 12 小时` 一致）
  模糊意图继续复用 K1；超过 12 小时的模糊意图既不能继续复用旧键重试（记录可能已被清理），也不能自动换新
  键盲发（首次结果是否成功不可知），必须提示先核对业务结果、由用户显式放弃后重新提交（前端
  `IDEMPOTENT_INTENT_TTL_MS` / `isIntentExpired`）。
- 结果未知（网络模糊失败、提交在途、结果损坏或超出重试窗口）时关闭创建弹窗不得静默丢弃 K1：关闭守卫先
  提示“若本次实际已成功，重新提交可能生成重复批次”，用户显式确认后才放弃（reset），取消则保留弹窗与 K1
  以便安全重试。结果损坏/超窗口场景还须先核对批次列表确认是否已生成，不能把“关闭并重新发起”当作安全
  路径。

第一阶段由页面/弹窗 composable 在内存保存键，只覆盖该所有者实例存活期间的重试和 KeepAlive 路由切换。
当前项目没有表单草稿持久化、待提交日志恢复或按幂等键查询结果的接口；浏览器硬刷新会同时丢失表单状态
和内存 K1，**不能宣称刷新后仍可安全复用 K1**。只把 key 或 payload hash 写入 `sessionStorage` 也不足以
恢复提交；必须另行保存可重建的完整提交快照并提供恢复流程，或增加受鉴权的服务端结果查询能力。两者均
尚未实现，详见实施方案 §9。

幂等键不是后端“防抖”。前端 pending 负责降低同页面重复点击；服务端闭环负责在客户端确实复用同一键时
识别重试和重放原结果。两层必须同时保留。

### 3.2 服务端闭环

**服务端闭环定义**：原子保存键、规范化请求指纹、执行状态和原结果；相同键与相同请求重放时返回原结果，复用键但请求不同时返回 HTTP 409，错误码为 `IDEMPOTENCY_CONFLICT`。

本项目使用 MySQL 实现闭环，幂等记录、业务写入和成功审计必须在同一事务中；当前阶段不引入 Redis。
执行顺序为：

1. 先完成认证、权限、DTO、请求头和纯格式校验（只由请求内容决定，不随数据库状态变化）；失败请求不
   登记；会受数据库状态影响的业务校验（如负责人是否启用、工单是否已下达、数量是否超过余量）在首次
   执行的 handler 内进行，重放不重复执行；
2. 后端以稳定 scope、actorId、规范化 path/query/body（含 version）计算 SHA-256 指纹；
3. 在外层事务登记 `(scope, idempotency_key)` 和指纹；
4. 首次请求执行业务 handler，保存可重放的成功业务结果后提交；
5. 相同键和相同指纹不再执行 handler，返回已保存结果；
6. 相同键和不同指纹抛出 `IDEMPOTENCY_CONFLICT`；
7. 业务、数据库、审计或结果保存失败时整体回滚，不留下失败占位或中毒键。

指纹不得包含幂等键、请求 ID、IP、User-Agent、非业务时间戳、Token、Cookie 或签名；不得保存原始
请求体和凭证。第一阶段只支持已认证写命令，请求指纹包含 actorId，且权限校验必须发生在幂等记录查询
之前。

**适用接口判据**（满足其一才启用，不做全接口统一加键）：

- 无天然可复现业务键的创建或执行命令（如后端自动生成编号的创建动作、无业务编号的多模块编排动作）；
- 需要「请求成功但响应丢失后安全重试并返回原结果」的命令（如状态流转）。

`Idempotency-Key` 请求头长度限制为 1 到 150 个字符，请求体中不得重复携带；具体接口必须在契约中显式声明该请求头为必填。
未声明启用的端点收到该头时返回 `400 IDEMPOTENCY_NOT_SUPPORTED`，不得静默忽略（含 `@Public()` 匿名端点：
它们不接入幂等闭环，但收到该头同样明确拒绝，防止客户端误以为请求受幂等保护）；已启用端点（`@IdempotentEndpoint({ scope })`）
缺少或携带非法键返回 `400 VALIDATION_ERROR`。该端点级门禁已由 `IdempotencyKeyGuard` 落地并接入全局守卫，
鉴权（401/403）先于幂等检查。

命令审计上下文不等于幂等能力：普通端点只接收不含键的 `CommandContext`；Guard 校验合法键并写入请求局部
私有属性后，已启用端点才通过 `CurrentIdempotentCommandContext` 获得必填键。`IdempotentCommandContext`
只允许进入已登记的 application 用例，传给 Repository 前必须收窄为 `CommandContext`。

### 3.3 已启用试点端点契约

`POST /api/production/work-orders/:workOrderId/batches`（createBatch）是首个已启用幂等闭环的端点：

- 请求头 `Idempotency-Key` 必填，1 到 150 字符；同一键绑定“一次尚未确认结果的提交意图”。
- scope：`production.batch.create.v2`。请求指纹输入：path `workOrderId` + 由 `@company/utils` 的
  `normalizeCreateBatchPayload` 归一化后的 body（`batchNo`、`routeId`、`plannedQuantity`、`ownerId`、
  `planStartDate`、`planEndDate`、`remark`、`stepOverrides`）+ `actorId`；不含幂等键、requestId、IP、UA
  或时间戳。归一化函数由前后端共用同一实现，保证指纹与前端签名同源、不漂移。
- 同键同指纹重放首次保存的最终响应快照（首次执行富化后的完整详情，含用户名），不重跑建批 handler、
  不新增成功业务审计，响应与首次成功完全一致；
  同键不同指纹返回 `409 IDEMPOTENCY_CONFLICT`。
- 成功结果结构冻结在 scope `production.batch.create.v2`：codec 使用 Zod 完整嵌套 schema，encode/decode
  都校验，结构错误一律拒绝；形状变更必须 bump scope 并引入新 codec，不允许用新 schema 猜旧记录
  （见实现方案 §5）。
- completed 记录至少保留 12 小时（服务端最短重放保证窗口）；`expires_at` 只是清理许可，物理删除前同键同指纹仍重放。
- 管理端 `useIdempotentIntent` 持有键，`createOrderBatch` 只转发；仅覆盖当前存活页面/KeepAlive 实例，
  **浏览器硬刷新会丢失 K1，当前不提供刷新后安全恢复**。

### 3.4 前端签名一致性

前端用于判断业务意图是否变化的签名必须覆盖服务端指纹中的全部客户端语义输入，包括本地意图名
`intentType`、path params、query、规范化 body 和 version；它不替代服务端指纹，也不得漏掉会改变业务语义
的字段。scope 由服务端独占控制（见 §3.1），前端不传输、不协商，`intentType` 只是本地意图名。

前端签名与后端指纹必须基于**同一个归一化结果**。createBatch 两端共用 `@company/utils` 的
`normalizeCreateBatchPayload`，且规范化后的同一个对象同时用于签名与发送。否则语义等价的修改（如删除
`remark` 尾部空格）会让前端误判内容变化而生成新幂等键，后端却因归一化后指纹相同而无法识别为同一意图，
最终产生重复的自动编号批次。

completed 记录只保证接口声明的最短保留窗口。到达 `expires_at` 但尚未物理删除时仍重放；清理器实际删除
后，同 scope/key 才可能作为新请求执行，客户端不得把幂等键理解为永久有效。

**实现注意**：以「唯一键冲突后查询已有数据返回」替代幂等键时，默认 REPEATABLE READ 隔离级别下，失败方快照可能看不到对方尚未提交的数据而查到空；需在冲突后短暂重试查询或等待对方提交。

完整表结构、事务伪代码、前端生命周期、分期顺序和测试矩阵见
[`http-idempotency-implementation-plan.md`](http-idempotency-implementation-plan.md)。

## 4. 当前阶段状态

平台闭环已落地：`202608050001-http-idempotency-records` migration（`UNIQUE(scope,idempotency_key)`、
`initial_request_id` 索引、completed 三字段联动 CHECK）、规范化请求指纹 + JSON-safe 运行时校验、MySQL
`IdempotencyExecutor` 适配器与平台 module、架构门禁（`http_idempotency_records` 写入口限
`infrastructure/idempotency`：executor 业务登记/更新 + housekeeping 到期清理）、端点级启用
元数据 `@IdempotentEndpoint({ scope })` + 全局 `IdempotencyKeyGuard`，以及失败审计对 `ConcurrencyError` 的 409 一致
映射均已实现。`createBatch`（scope `production.batch.create.v2`）是首个已启用试点端点，契约见 §3.3。

到期清理与运行观测已落地：`infrastructure/idempotency/idempotency-housekeeping.service.ts` 是平台到期清理
唯一写入口，按小批次删除已到期 `completed` 记录（`expires_at` 只表示允许清理，物理删除前同键仍重放），
发现持久化 `processing` 记录时告警并停止自动处置；`idempotency.metrics.ts` 记录重放/冲突/失败计数，
housekeeping 周期性输出重放率/冲突率/失败率摘要并重置窗口。executor 在重放、冲突、结果损坏、可重试
存储失败路径分别记录指标，平台日志只携带 requestId、scope 和脱敏键摘要，不再打印原始幂等键。
`isReplay` 在产生点即被观测，不依赖业务层转发，也不伪造第二条业务成功审计。

该端点外，Product、Identity 和 Production 的其他客户端**仍不得发送** `Idempotency-Key`——未启用端点收到
该头会被全局守卫拒绝（`400 IDEMPOTENCY_NOT_SUPPORTED`），不存在静默伪幂等。
Product 技术文件上传与工序 SOP 上传包含对象存储副作用，不在当前 MySQL executor 的原子事务范围内，因而
明确保持非幂等且不得开启 `retryUnsafe`；误带 header 必须在 `storage.storeSop()` 之前拒绝。

createBatch 试点接线进一步落实「重放返回原结果」的完整语义：

- 会受数据库状态影响的业务校验（负责人是否启用）移入首次执行的 handler，重放不重复校验——否则负责人
  停用后同键重试会返回 400 而非重放原结果；
- 首次执行即在 handler 内富化并保存最终响应快照（含用户名），重放直接返回该快照，与首次成功完全一致；
- `@company/database` 新增 `withActiveConnection`，使 executor 外层事务内的校验与富化只读查询复用同一
  事务连接，保证幂等记录、业务写入、成功审计与 handler 内读取处于同一事务上下文（见实现方案 §7）；
- 前端意图闭环细化：`useIdempotentIntent` 在 `IDEMPOTENCY_RESULT_CORRUPT` 后置
  blocked 状态并阻止继续提交（不重试、不自动换新键，首次结果是否成功不可知）；请求层
  `isCorruptResult` 跳过对该错误码的自动重试；工单页/任务页建批弹窗在结果未知（pending/blocked）关闭时
  经 `getStatus()` 守卫弹确认，用户确认才放弃 K1，取消则保留弹窗与键，避免静默丢弃 K1 导致重复的自动
  编号批次；两个页面均补关闭守卫组件测试。

现阶段继续依赖业务唯一约束和 `version` 乐观锁避免重复写入或并发覆盖；Production 第一阶段的
`production_item_demand` 仍使用 `NORMAL:{production_batch_id}:{product_material_id}` 作为内部稳定键。
`createBatch`、物料分配、生产领料出库创建/确认、外购物料入库创建/确认以及报工创建/更正已经逐项落地；
其余命令仍须逐项满足启用门槛后再声明必填键，不得无差别给所有 POST/PATCH 加键。

### 4.1 接口幂等键适用性与当前边界

下表按 §3.2 判据对现有全部写端点分类。「需要」不代表「已启用」：启用必须逐项满足
[`http-idempotency-implementation-plan.md`](http-idempotency-implementation-plan.md) §12 验收门槛，
未启用端点（含全部 GET 与 `@Public()` 匿名端点）收到 `Idempotency-Key` 一律返回 `400 IDEMPOTENCY_NOT_SUPPORTED`。

| 分类                                                   | 判据                                                                                                         | 端点                                                                                                                                                                                                                                               | 当前边界                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A. 已启用幂等闭环                                      | 成功响应丢失后的重试会新增不可变事实，且无客户端可复现业务键                                                  | 创建批次、物料分配、生产领料出库创建/确认、外购物料入库创建/确认、工序报工创建/更正、返工整单完成、异常报废补料批准                                                                                                                                | scope 见对应端点契约；键必填，业务写入、成功审计和幂等结果同事务                                                      |
| B. 命中判据二「需要」，按风险逐项启用（阶段 C）        | 成功响应丢失后因 `version` 已变而返回 409，需要结果重放                                                      | `POST /api/production/work-orders/:workOrderId/actions/release`、`/cancel`、`/complete`、`/close`；`POST /api/production/batches/:id/actions/cancel` 等状态确认命令                                                                                                                                        | 尚未启用；逐项满足幂等启用门槛后才可开放                                                                              |
| C. 有内部稳定键，先复验天然幂等再决定                  | 键可复现（`NORMAL:{production_batch_id}:{product_material_id}`），但完整 application/API 链路未验证          | `POST /api/production/batches/:id/actions/generate-material-demands`                                                                                                                                                                               | 尚未启用；先补真实 MySQL 双事务 + 完整链路重试复验（前置 BOM 读取不破坏重试语义），再决定是否接结果重放              |
| D. 有自然可复现业务键 / 集合语义更新，暂不需要 HTTP 键 | 创建命令的业务键由用户输入且 UNIQUE 可复现；更新为集合语义（无乐观锁版本门禁），重复应用相同负载最终状态一致 | `POST /api/production/work-orders`（`work_order_no` UNIQUE）；users/roles（`username`/`code`）；categories/products/process-steps/process-routes（`category_code`/`item_code`/`step_code`/`product_id+route_code+version_no`）及其 PATCH/setStatus | 数据层 UNIQUE 兜底；成功响应丢失后重试可能返回 409 而非重放，当前阶段可接受；某命令若需要结果重放，按阶段 C 单独评估 |
| E. 当前做不到幂等闭环（外部副作用在事务外）            | handler 必须先写对象存储，对象写入无法随数据库事务回滚；重试会重复上传对象形成孤儿对象                       | `POST /api/product/technical-files`、`POST /api/product/process-steps/:id/sop`                                                                                                                                                                     | 不得直接套用 executor；需先设计 outbox/补偿或安全的结果重建方式                                                      |
| F. 不得仅凭 HTTP method 启用，待单独评估               | 历史 SOP 快照下载已闭环；计划中的软删除仍必须保留对象内容并补齐引用、并发删除测试，当前无 HTTP 路由           | `DELETE /api/product/technical-files/:id`（未开放）                                                                                                                                                                                                | 当前不启用                                                                                                           |
| G. 不适用（匿名命令 / 框架外）                         | 幂等闭环要求已认证 `actorId`，匿名命令不接入                                                                 | `POST /api/auth/login`、`/refresh`、`/logout`                                                                                                                                                                                                      | 不要求键；但收到键与其余未启用端点一致返回 `400 IDEMPOTENCY_NOT_SUPPORTED`，不静默接受                               |

前端边界：只对已启用端点（`createOrderBatch`、创建物料分配、创建/确认待出库单、创建/确认外购物料入库单、创建工序报工、管理员更正报工、返工整单完成、异常报废补料批准）发送 `Idempotency-Key`，其余接口不得自行生成或
发送；内存 K1 不持久化，浏览器硬刷新后无法恢复（见 §3.3、实现方案 §9.1）。

### 4.2 Production 当前执行阶段命令矩阵

| 命令 | 副作用/自然业务键 | HTTP 幂等选择 |
| --- | --- | --- |
| 创建物料分配 | 新增不可变分配事实；无客户端可复现业务键 | 已启用，scope `production.material-allocation.create.v1`；幂等记录、分配、批次状态和成功审计同事务 |
| 释放物料分配 | 更新既有 allocation；`allocationId + version` | 使用状态短路与 version 乐观锁；不发送 `Idempotency-Key` |
| 创建生产领料出库单 | 新增待出库主单/明细；服务端单号不可复现；不扣库存 | 已启用，scope `production.material-outbound.create.v2`；待出库事实、成功审计和结果同事务 |
| 创建外购物料入库单 | 新增 pending 主单、明细和零余额库存批次；不写库存流水 | 已启用，scope `production.purchase-inbound.create.v1`；业务写入、成功审计和结果同事务 |
| 确认外购物料入库 | 整单生成 `purchase_inbound` 正库存流水 | 已启用，scope `production.purchase-inbound.confirm.v1`；状态、流水、成功审计和结果同事务 |
| 取消待确认外购物料入库 | `pending -> cancelled`，不产生库存流水 | 状态 + version 天然幂等；前端不发送 `Idempotency-Key` |
| 确认生产领料出库 | 整单生成负库存流水并推进批次；`outboundId + version` | 已启用，scope `production.material-outbound.confirm.v1`；单据状态、内部库存流水键、批次状态、审计和结果同事务 |
| 取消待出库单 | `pending_picking -> cancelled`；`outboundId + version` | 使用状态短路与 version；不发送 `Idempotency-Key`，取消后待制单占用立即释放 |
| 创建工序报工 | 正常报工或异常报工新增一条不可变事实；异常报工还会新增待处置记录 | 已启用，scope `production.step-report.create.v3`；员工普通报工禁止正常与异常混报，两类命令均按本次单一数量消耗当前放行额度；报工、异常待处置、工序状态、成功审计和幂等结果同事务 |
| 冲销报工 | 按原事实追加一条全量冲销；目标报工是唯一自然业务键 | 不发送 HTTP 幂等键；`UNIQUE(reversal_of_report_id)`、批次/工序状态和 `version` 提供天然幂等与并发保护，重放返回已存在的冲销事实 |
| 更正报工 | 在单个事务内追加全量冲销和替代事实；服务端单号不可复现 | 已启用，scope `production.step-report.correct.v3`；v3 按更正后有效总量校验当前放行额度；冲销、替代、异常待处置、工序状态、成功审计和幂等结果同事务 |
| 完成返工 | 追加来源唯一的报工事实，返工再次异常还会新增待处置记录 | 已启用，scope `production.rework.complete.v1`；返工单、报工、工序状态、成功审计和幂等结果同事务 |
| 批准报废补料 | 同时追加报废、补料单/明细和补料需求事实 | 已启用，scope `production.abnormal.scrap-supplement-plan.confirm.v1`；处置审批、全部事实、成功审计和幂等结果同事务 |
| 派工/撤回/改派 | 更新既有工序；`stepId + version` | 使用状态机与 version；不发送 `Idempotency-Key` |
| 员工开工 | 工序与首工序批次状态转换；`stepId + version` | 使用状态短路与 version；重复请求返回当前等价结果；不发送键 |
| 员工完成无需报工工序 | `doing -> completed`；`stepId + version` | 仅当前负责人可执行；状态短路与 version 天然幂等；不发送键 |
| 生产执行完工 | 批次状态与服务端聚合完成量；`batchId + version` | 使用状态短路与 version；不发送键 |

`inventory_transaction.idempotency_key` 是库存业务流水唯一性键，生产出库采用
`PMO:{outboundId}:{outboundDetailId}` 这种服务端内部稳定身份；它不是 HTTP 原始幂等键，也不得包含该原始键。
