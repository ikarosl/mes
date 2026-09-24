# HTTP API 通用规范

本文是所有 HTTP 接口的通用约定。模块 API 文档只记录自身资源、筛选字段和偏差，不重复本文。

## 1. 基础约定

- 全局前缀为 `/api`，资源路径使用复数或稳定业务集合名称。
- JSON 字段使用 camelCase；数据库字段和业务稳定代码使用 snake_case。
- HTTP 中的数据库 ID 使用字符串，避免 JavaScript 大整数精度问题。
- 业务数量请求使用 JSON number，但当前只接受整数：正数量最小为 `1`，明确允许空累计/拆分的字段可为 `0`，单列最大值为 `99999999`；服务端必须拒绝小数、超范围值和依赖舍入的输入。数量响应沿用契约规定的字符串或数字类型；字符串必须是 `"12"` 这样的十进制整数字符串，不补小数位。MySQL 聚合可能返回字符串，适配器必须显式规范化，不能依赖驱动类型。产品规格参数等纯 JSON 记录不属于业务数量请求，按对应 DTO 原样处理。
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

- 不返回 `totalPages`，由调用方推导。
- 越界页返回空 `items`，保留请求页码。
- 修改筛选或 pageSize 后，前端回到第一页再请求。
- 普通管理列表的 count 和数据查询不要求快照事务；要求一致快照的报表必须单独声明。
- 前后端分页响应均复用 `PageResult<T>`。

## 4. 筛选与排序

- `keyword` 在应用边界 trim，空字符串视为未提供。
- 精确筛选与模糊搜索字段必须在模块文档中列明。
- 确有交互需求时使用 `sortBy` 和 `sortOrder`；`sortOrder` 只允许 `asc`、`desc`。
- `sortBy` 必须映射到服务端白名单，禁止把客户端字段直接拼入 SQL。
- 分页查询必须稳定排序，并以唯一 ID 作为最后一个排序条件。
- 业务流水默认按 `created_at DESC, id DESC`；主数据使用业务编码或 `sort_order, id`。

## 5. 列表、选项与批量操作

- 正式业务列表不得全量下载后在浏览器切片；持续增长的用户、日志、主数据、单据和事实记录必须服务端分页（见第 3 节）。
- 表单下拉选择必须通过独立、最小字段的 `/options` 接口获取，禁止复用分页列表接口在浏览器过滤/切片；一个 `/options` 只承载一类可选项，不提供把多类选项打包返回的聚合端点（如 `form-options`）。前端只在弹窗打开等确需多类候选的生命周期并发组合独立 loader；展开某个下拉时只刷新对应资源，不得重新形成前端聚合端点语义。候选实例的所有权与局部边界见[管理端架构](../apps/admin-web/docs/architecture.md)。多个页面消费同一 `/options` 端点只代表复用同一后端契约，不代表前端共享缓存状态；前端候选实例按消费方局部持有。
- `/options` 只返回表单需要的最小字段，并默认排除停用、删除记录；根据候选集合是否完整，明确采用“全量候选”或“窗口候选”契约，不得在未改变契约的情况下静默增加分页、关键词窗口或 `LIMIT`。
- 跨页面 `/options` 授权契约：`/options` 是只读参考数据，端点按「任意一个合法消费页面的视图权限」放行（any-of，`RequirePermission` 传权限数组）。新增或拆分 `/options` 时授权集必须是其全部消费页面视图权限的并集，不得收紧消费页面的授权；每个端点须在模块 API 文档列明消费页面与授权集。前端把选项请求视为 best-effort（`skipErrorHandling`），单个选项失败只影响该项下拉，不得让成功选项整体丢失或触发全局 403 跳转。
- 批量写操作必须设置 DTO 数组上限，返回明确的整体成功或原子失败语义。
- 文件上传声明 MIME、大小和数量限制；下载文件名必须安全编码，不暴露存储凭证或签名细节。

### 5.1 候选完备性与增长迁移

**全量候选**适用于业务口径下具有明确小规模的活动集合。端点必须返回全部当前可选项，不分页、不截断，前端使用本地 `filterable`；成功响应中缺失的已选 ID 可以判定为不可选。业务规模预期只能用于决定当前契约，不能直接写成 SQL 上限，异常出现的第 21 条也必须返回。

当前工单全量候选的过滤和授权见[Production 工单设计](../apps/api/src/modules/production/docs/database/work-orders-and-batches.md)，不能把业务预期数量转成静默截断。

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

本节维护 HTTP 契约；服务端事务、存储、scope 与重放机制见[幂等契约](../apps/api/docs/idempotency.md)，上下文分层见[命令上下文](../apps/api/docs/command-context.md)，客户端恢复见[HTTP 错误处理](../apps/admin-web/docs/http-error-handling.md)。

- `X-Request-Id` 只接受 8—128 位字母、数字、下划线或连字符，否则生成 UUID；响应和审计使用同一请求身份。进入上下文的 User-Agent 最多 512 字符。
- 普通命令使用 `CommandContext`；只有显式启用的认证命令使用 `IdempotentCommandContext`，后者的 actorId 与 idempotencyKey 必填。Repository 不接幂等上下文，不解析 HTTP 头。
- 幂等键统一来自 `Idempotency-Key`，长度 1—150，不在 body 重复定义。是否必填由具体端点声明；未启用端点（含匿名及文件上传）收到此头必须在副作用前返回 `400 IDEMPOTENCY_NOT_SUPPORTED`，不能静默执行。
- 同键同规范化请求返回原成功结果；同键不同内容返回 `409 IDEMPOTENCY_CONFLICT`，瞬态存储错误为 `503 IDEMPOTENCY_STORAGE_RETRYABLE`，损坏的已存结果为 `500 IDEMPOTENCY_RESULT_CORRUPT`；非法头为 `400 VALIDATION_ERROR`。未预期代码异常保持 `500 INTERNAL_SERVER_ERROR`，不因发生在幂等链中而改写错误来源。
- 每个端点声明参与指纹的语义 path/query/body/version 及最短保证窗口。前端意图签名覆盖同组输入；同一次未确认结果的重试复用原键和请求，改内容或成功后重新操作使用新键，不能在每次 API 调用随机换键。
- 管理端在首次正式提交生成 `crypto.randomUUID()`，不预领取、不以 payload hash 代替键。无响应、断网及 502/503/504 保留原意图；明确普通 500 不自动重试。硬刷新目前不能恢复待提交意图，仅保存 key 或 hash 不构成恢复闭环。
- DTO、鉴权和请求头校验先于登记；当前只保存成功结果，成功状态码由端点固定，响应 requestId 等易变头按本次请求生成。失败不缓存；重放不新增业务成功审计。
- 启用范围以 scope 常量和 `@IdempotentEndpoint` 声明为准，见[当前启用范围](../apps/api/docs/idempotency.md#1-当前启用范围)。只有原子登记、业务执行和结果持久化闭环完成后才启用；外部存储、HTTP 或消息副作用不能仅套 MySQL executor 宣称幂等。

各业务命令的输入互斥、草稿／正式提交、权限及是否发送幂等键由其所有者维护，例如[生产执行](../apps/api/src/modules/production/docs/database/execution-traceability-quality.md)与[补料需求](../apps/api/src/modules/production/docs/database/demand-allocation-and-outbound.md)。

## 8. 乐观锁与冲突

- 可变业务单据命令在 body 中携带当前整数 `version`；Repository 使用 `WHERE id=? AND version=?` 原子更新并递增版本。
- 受影响行数为 0 时抛出协议无关的并发业务错误，由 HTTP 异常出口映射为 `409 CONCURRENT_MODIFICATION`。
- application、domain 和 persistence helper 不直接抛 Nest HTTP 异常；HTTP 状态与错误信封只在 presentation 层映射。
