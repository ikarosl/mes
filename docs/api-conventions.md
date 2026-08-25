# HTTP API 通用规范

本文是所有 HTTP 接口的通用约定。模块 API 文档只记录自身资源、筛选字段和偏差，不重复本文。

## 1. 基础约定

- 全局前缀为 `/api`，资源路径使用复数或稳定业务集合名称。
- JSON 字段使用 camelCase；数据库字段和业务稳定代码使用 snake_case。
- HTTP 中的数据库 ID 使用字符串，避免 JavaScript 大整数精度问题。
- 业务数量请求使用 JSON number，但当前只接受整数：正数量最小为 `1`，明确允许空累计/拆分的字段可为 `0`，单列最大值为 `99999999`；服务端必须拒绝小数、超范围值和依赖舍入的输入。响应为了兼容现有 MySQL `DECIMAL` 驱动可以继续返回 `"12.0000"`，其语义仍是整数。产品规格参数等纯 JSON 记录不属于业务数量请求，按对应 DTO 原样处理。
- 可见时间使用带 `+08:00` 偏移的 ISO 8601 字符串。
- GET 只读；POST 创建或执行动作；PATCH 部分更新；PUT 完整替换子资源；DELETE 执行受控删除。
- 匿名端点必须显式 `@Public()`，其余端点默认鉴权并按需声明权限。

## 2. DTO 与错误

- 所有 body、query 和 path 参数都必须使用 class DTO 运行时校验。
- 全局 ValidationPipe 转换类型、拒绝未知字段并在首个错误处停止。
- 非法参数返回 `400` 和 `VALIDATION_ERROR`，不能静默截断、夹取或忽略。
- Controller 不重复实现字符串长度、数字范围和枚举校验。
- 失败响应统一包含 `status`、`code`、`message`、`requestId`、`timestamp` 和 `path`。
- 用户消息使用清晰中文，错误码使用稳定大写英文；不向前端暴露 SQL、SDK、堆栈和密钥。

## 3. 分页

持续增长的用户、日志、主数据、单据和事实记录必须服务端分页。有明确小上限的选项、字典和树结构
可以不分页；规模增长后改为远程搜索。

请求参数：

| 参数     | 默认值 | 约束                                   |
| -------- | -----: | -------------------------------------- |
| page     |      1 | 大于等于 1 的整数                      |
| pageSize |     10 | 1 到 100 的整数；管理端提供 10、20、50 |

公共 `PageQueryDto` 完成 number 转换和校验。Controller 不使用 `Number()`、`Math.min()` 或
`Math.max()` 手工处理。Repository 接收已规范化的分页值，不自行决定默认值。

响应统一为：

```ts
interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
```

- 对于各业务接口分页继承此类型进行实现
- 不返回 `totalPages`，由调用方推导。
- 越界页返回空 `items`，保留请求页码。
- 修改筛选或 pageSize 后，前端回到第一页再请求。
- 普通管理列表的 count 和数据查询不要求快照事务；要求一致快照的报表必须单独声明。
- 前端至少保证响应体接口类型使用该类型进行约束

## 4. 筛选与排序

- `keyword` 在应用边界 trim，空字符串视为未提供。
- 精确筛选与模糊搜索字段必须在模块文档中列明。
- 确有交互需求时使用 `sortBy` 和 `sortOrder`；`sortOrder` 只允许 `asc`、`desc`。
- `sortBy` 必须映射到服务端白名单，禁止把客户端字段直接拼入 SQL。
- 分页查询必须稳定排序，并以唯一 ID 作为最后一个排序条件。
- 业务流水默认按 `created_at DESC, id DESC`；主数据使用业务编码或 `sort_order, id`。

## 5. 列表、选项与批量操作

- 正式业务列表不得全量下载后在浏览器切片；持续增长的用户、日志、主数据、单据和事实记录必须服务端分页（见第 3 节）。
- 表单下拉选择必须通过独立、最小字段的 `/options` 接口获取，禁止复用分页列表接口在浏览器过滤/切片；一个 `/options` 只承载一类可选项，不提供把多类选项打包返回的聚合端点（如 `form-options`）。前端只在弹窗打开等确需多类候选的生命周期并发组合独立 loader；展开某个下拉时只刷新对应资源，不得重新形成前端聚合端点语义。候选实例的所有权与局部边界见 `frontend-architecture.md`。多个页面消费同一 `/options` 端点只代表复用同一后端契约，不代表前端共享缓存状态；前端候选实例按消费方局部持有。
- `/options` 只返回表单需要的最小字段，并默认排除停用、删除记录；根据候选集合是否完整，明确采用“全量候选”或“窗口候选”契约，不得在未改变契约的情况下静默增加分页、关键词窗口或 `LIMIT`。
- 跨页面 `/options` 授权契约：`/options` 是只读参考数据，端点按「任意一个合法消费页面的视图权限」放行（any-of，`RequirePermission` 传权限数组）。新增或拆分 `/options` 时授权集必须是其全部消费页面视图权限的并集，不得收紧消费页面的授权；每个端点须在模块 API 文档列明消费页面与授权集。前端把选项请求视为 best-effort（`skipErrorHandling`），单个选项失败只影响该项下拉，不得让成功选项整体丢失或触发全局 403 跳转。
- 批量写操作必须设置 DTO 数组上限，返回明确的整体成功或原子失败语义。
- 文件上传声明 MIME、大小和数量限制；下载文件名必须安全编码，不暴露存储凭证或签名细节。

### 5.1 候选完备性与增长迁移

**全量候选**适用于业务口径下具有明确小规模的活动集合。端点必须返回全部当前可选项，不分页、不截断，前端使用本地 `filterable`；成功响应中缺失的已选 ID 可以判定为不可选。业务规模预期只能用于决定当前契约，不能直接写成 SQL 上限，异常出现的第 21 条也必须返回。

`/production/work-orders/options` 当前属于全量候选：只返回 `released` 且扣除非取消批次后仍有可分配余量的工单，业务预期同时存在不超过 20 条。该端点不得设置 `LIMIT 20`、`LIMIT 50` 或关键词结果窗口，前端采用普通下拉框本地筛选。

全量候选出现以下任一情况时进入远程搜索迁移评估，不自动截断现有响应：

- 活动候选持续接近或超过 200 条；
- 响应体积、接口延迟或浏览器渲染已影响既定性能目标；
- 本地下拉已不适合用户定位候选，需要服务端搜索、分组或更多筛选条件。

迁移后的**窗口候选**必须同时完成以下契约变更，禁止只给原查询增加 `LIMIT`：

1. 提供受 DTO 校验的 `keyword`，并明确搜索字段、稳定排序和窗口上限；
2. 提供 `includeIds`（或等价的按 ID 解析端点），把当前已选且仍有效的项合并到搜索窗口，去重后返回；
3. 搜索窗口中缺失某 ID 不代表它已失效，只有已显式请求解析且仍未返回时，前端才能判定不可选；
4. 前端同步切换为带防抖和 last-request-wins 的远程搜索，每次搜索、展开和页面激活都携带当前已选 ID；
5. 补充窗口上限、已选项补全、无效 ID、去重、响应乱序和权限契约测试；
6. 先发布兼容新参数的后端，再切换前端，旧的全量语义只能在所有消费方完成迁移后移除。

## 6. 兼容性

- 已发布字段不能静默改名、改类型或改变空值语义。
- 新增可选字段保持旧客户端兼容；破坏性变更必须先更新 contracts、测试和模块 API 文档。
- 数据库 schema 变化只通过追加 migration 完成。

## 7. 请求上下文与幂等键

- 每个请求使用 `X-Request-Id` 关联响应与审计；只接受 8 到 128 位字母、数字、下划线或连字符，否则服务端生成 UUID。
- `User-Agent` 属于不可信元数据，进入审计上下文前最多保留 512 个字符，不得让超长头部破坏核心业务事务。
- 普通写命令使用 `CommandContext`，它只包含 `actorId`、`requestId`、IP、User-Agent，不包含幂等键；传递命令上下文不代表接口支持 HTTP 幂等。只有显式启用闭环的认证端点使用 `IdempotentCommandContext`，其 `actorId` 与 `idempotencyKey` 均为必填。
- 确认、冲销、库存流水生成等命令一旦启用服务端幂等闭环，统一从 `Idempotency-Key` 请求头读取，不在 body 中重复定义。具体接口必须显式声明该请求头为必填；未声明的接口不得由前端自行生成或发送幂等键。目标服务端契约中，未启用端点收到该头必须返回 `400 IDEMPOTENCY_NOT_SUPPORTED`（含 `@Public()` 公开端点），不得静默执行并形成伪幂等信号。
- `Idempotency-Key` 长度为 1 到 150；缺失时是否拒绝由具体命令声明，非法值统一返回 `400 VALIDATION_ERROR`。
- 同一幂等键和同一规范化请求返回原结果；同一键对应不同请求返回 `409 IDEMPOTENCY_CONFLICT`。
- 幂等错误使用稳定的 HTTP 状态与 code：键与请求内容冲突为 `409 IDEMPOTENCY_CONFLICT`，瞬态存储失败为
  `503 IDEMPOTENCY_STORAGE_RETRYABLE`，已保存结果损坏为 `500 IDEMPOTENCY_RESULT_CORRUPT`。缺少、非法或
  端点不支持幂等键才属于 400；不得把同键不同内容误报为 400。
- 指纹生成器、幂等 executor 或业务 handler 内部出现 `TypeError` 等未预期代码异常时，保持
  `500 INTERNAL_SERVER_ERROR`。服务端记录异常类型、请求路径、`requestId` 与脱敏堆栈，对外不得暴露源码
  细节，也不得仅因异常发生在幂等调用链就改写为幂等错误。
- 每个启用接口必须在契约中列出参与服务端指纹的语义 path params、query、规范化 body 和 `version`；前端意图签名必须覆盖同一组客户端输入，任一字段变化都要结束旧意图并生成新键。
- 服务端幂等闭环至少包含键与规范化请求指纹的原子登记、执行状态及原结果持久化；在该闭环完成前，请求头只会形成伪幂等，不得启用。键的生命周期覆盖一次业务意图及其全部重试，不得在 API 包装函数的每次调用中随机生成。
- `IdempotencyKeyGuard` 负责校验并规范化 header，幂等参数装饰器只读取 Guard 写入的请求局部值；Repository Port/Adapter 只接收 `CommandContext`，不得解析 header、接收 `IdempotentCommandContext` 或读取幂等键。
- 文件上传、外部 HTTP、消息发送等非 MySQL 事务副作用不能仅套用当前 executor 即宣称幂等；Product 文件上传当前保持非幂等，误带该头必须在对象存储和数据库写入前拒绝。
- 本项目由管理端在提交意图第一次正式提交时使用 `crypto.randomUUID()` 生成键；服务端不提供预领取键接口，也不以请求内容 hash 代替意图键。相同有效载荷的超时、断网、无响应和 `502/503/504` 复用原键；明确普通 500 不自动重试，修改有效载荷或上一次已明确成功后重新操作必须使用新键。
- 前端全局 HTTP 错误处理器只根据服务端明确 code 映射幂等提示；业务组件不得自行推断错误来源或用固定
  幂等文案覆盖普通 500。页面为防重复而保留原提交标识属于恢复状态，不代表错误发生在幂等模块。
- 键实际绑定“一次尚未确认结果的提交意图”，不绑定点击次数或弹窗开关；第一次正式提交才生成。服务端只能在客户端复用同一键时重放结果，不负责恢复客户端丢失的键。当前前端没有表单草稿/待提交意图持久化，浏览器硬刷新后不能自动恢复 K1；只保存 key 或 payload hash 不构成恢复闭环。
- 第一阶段只保存并重放成功业务结果，端点使用其固定成功状态码；`X-Request-Id` 等易变响应头按当前重试请求重新生成。DTO、鉴权和请求头校验在幂等登记之前完成，失败结果不缓存。
- `expires_at` 表示记录允许被清理而非自动失效；最短保留期内必须重放，过期但尚未物理删除时仍重放，物理删除后相同 scope/key 才按新请求处理。具体接口必须声明其最短保证窗口。
- 首次登记保存 `initial_request_id` 以关联首次业务成功审计；原始幂等键不重复写入 `operation_logs`，成功重放也不新增业务成功审计。
- 当前已启用闭环的端点包括 `POST /api/production/work-orders/:workOrderId/batches`（scope
  `production.batch.create.v2`）、`POST /api/production/batches/:batchId/material-allocations`（scope
  `production.material-allocation.create.v1`）和 `POST /api/production/batches/:batchId/material-outbounds`
  （scope `production.material-outbound.create.v2`），以及
  `POST /api/production/material-outbounds/:outboundId/actions/confirm`（scope
  `production.material-outbound.confirm.v1`）、`POST /api/production/purchase-inbounds`（scope
  `production.purchase-inbound.create.v1`）以及
  `POST /api/production/purchase-inbounds/:inboundId/actions/confirm`（scope
  `production.purchase-inbound.confirm.v1`）、`POST /api/production/batches/:batchId/step-records/:recordId/reports`
  （scope `production.step-report.create.v3`）以及
  `POST /api/production/batches/:batchId/step-records/:recordId/reports/:reportId/actions/correct`
  （scope `production.step-report.correct.v3`）、返工整单完成
  `POST /api/production/reworks/:reworkId/actions/complete`（scope
  `production.rework.complete.v1`）和异常报废补料批准
  `POST /api/production/abnormal-dispositions/:dispositionId/actions/approve-scrap-supplement`（scope
  `production.abnormal.scrap-supplement-plan.confirm.v1`）。取消待确认入库单使用状态与 `version` 天然幂等，禁止发送
  `Idempotency-Key`。契约与重放语义见
  [`concurrency-and-idempotency.md`](concurrency-and-idempotency.md) §3.3；全部写端点「需要幂等键 / 有自然
  键兜底 / 当前做不到」的完整分类见该文 §4.1。未声明启用的端点收到该头返回
  `400 IDEMPOTENCY_NOT_SUPPORTED`（该门禁已由全局 `IdempotencyKeyGuard` 落地）；其余接口在前端发送该头
  前必须在其模块契约中显式标记启用。事务、指纹、存储和测试方案见
  [`http-idempotency-implementation-plan.md`](http-idempotency-implementation-plan.md)。

工序普通报工仍使用同一个 `reports` 端点，但业务意图必须互斥：正常报工提交 `normalQuantity > 0, abnormalQuantity = 0, abnormalOrigin = null`；异常报工提交 `normalQuantity = 0, abnormalQuantity > 0` 并填写 `abnormalOrigin`。后端拒绝两个数量同时大于 `0`，员工端必须以“正常报工/异常报工”两个入口表达，不能仅依赖前端隐藏字段。

异常报废补料页面的“暂存需求”保存服务端可恢复草稿，而不是创建正式物料需求。草稿写入 `production_scrap_supplement_plan/_line`，不得改变异常处置状态，不得写入 `production_item_demand`，因而不能参与分配或出库；保存命令使用 `planVersion` 做方案乐观并发控制，并使用 `dispositionVersion` 防止基于过期异常暂存。只有复核页的“确定报废并生成”才提交最终确认命令，并在一个事务内批准异常、生成报废事实、补产授权、补料单和正式需求，再将方案转为 `confirmed`。管理端不再调用可跳过方案复核的直接批准入口。

- `GET /production/abnormal-dispositions/:dispositionId/scrap-supplement-plan`：返回当前方案或 `null`。
- `PUT /production/abnormal-dispositions/:dispositionId/scrap-supplement-plan`：创建或按 `planVersion` 整体替换草稿明细。
- `POST /production/abnormal-dispositions/:dispositionId/scrap-supplement-plan/actions/confirm`：按方案版本幂等确认并生成正式闭环事实。

Production 4.2-B 的工序执行命令采用批次与工序记录双重上下文：

- `POST /api/production/batches/:batchId/step-records/:recordId/actions/assign`
- `POST /api/production/batches/:batchId/step-records/:recordId/actions/unassign`
- `POST /api/production/batches/:batchId/step-records/:recordId/actions/reassign`
- `POST /api/production/batches/:batchId/step-records/:recordId/actions/start`
- `POST /api/production/batches/:batchId/step-records/:recordId/actions/complete`
- `GET /api/production/worker-tasks`
- `GET /api/production/batches/:batchId/step-records/:recordId/sop-content`
- `GET /api/production/worker-tasks/batches/:batchId/step-records/:recordId/sop-content`

五个命令均提交当前工序 `version`，派工与改派额外提交 `responsibleUserId`；它们使用状态短路与乐观锁，禁止发送 `Idempotency-Key`。`complete` 只允许当前负责人完成已经开工的无需报工工序，必须报工工序仍由报工数量自动完成。员工任务查询、开工和无需报工工序完工分别由 `production:worker-tasks:view`、`production:steps:start`、`production:steps:complete` 保护，管理端三个派工命令由 `production:steps:assign` 保护。

两个 SOP 内容端点都从 `batch_step_records` 解析默认或现场实际 SOP 的冻结文件名、对象键和版本号，不读取当前工序配置。管理端端点由 `production:tasks:view` 保护；员工端点由 `production:worker-tasks:view` 保护，并在数据库查询中强制工序 `responsible_user_id` 等于当前用户，禁止仅凭 URL 下载他人任务。追溯等其他业务页面应新增与自身查看权限匹配的端点并复用同一快照读取服务，不得扩大员工端点的数据范围。

## 8. 乐观锁与冲突

- 可变业务单据命令在 body 中携带当前整数 `version`；Repository 使用 `WHERE id=? AND version=?` 原子更新并递增版本。
- 受影响行数为 0 时抛出协议无关的并发业务错误，由 HTTP 异常出口映射为 `409 CONCURRENT_MODIFICATION`。
- application、domain 和 persistence helper 不直接抛 Nest HTTP 异常；HTTP 状态与错误信封只在 presentation 层映射。
