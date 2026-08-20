# 项目整改、阶段任务与待决策事项

本文是项目审查和开发阶段安排的正式参照，用于区分已经确认的问题、按阶段实施的整改、暂不能直接实施的业务冲突，以及一般工程任务。

## 1. 使用规则

- `已完成`：已经落地，仅在回归审查发现新证据时重新打开。
- 幂等闭环相关事项的进度统一使用 `docs/http-idempotency-implementation-plan.md`「进度口径」的四级状态
  （planned → wired → verified → released）；「已完成」只用于 released 对应的事项。
- `立即整改`：问题和目标行为已经确认，可以进入实施计划。
- `阶段实施`：问题已经确认，但必须跟随对应业务迁移阶段实施，不得提前扩大范围。
- `滞后 / 待决策`：现象或冲突已经发现，但实际业务需求、状态语义或计算口径尚未确定；只记录约束和决策输入，不直接改代码或 migration。
- 数据库业务设计仍以 `docs/database/README.md` 及其列出的领域章节为准；本文件记录实施时机和待决策事项。若两者存在冲突，必须先完成评审并同步规范，不能由实现自行选择。
- 数据库结构调整只能追加 migration，已执行 migration 不得修改。
- 系统管理的文件及其对象存储内容不得硬删除；业务“删除”只能通过停用、归档或软删除表达，并保留历史追溯能力。

## 2. 已完成事项

1. 对象存储已调整为 S3 标准适配器，并完成相关代码、Docker Compose 配置和上传文件测试审查。
2. 项目环境变量已经统一。
3. 已启用工艺路线的工序和 SOP 快照已在后端冻结；`202607290002-product-route-step-sop-version-snapshot` 已补充独立的 `sop_version_no_snapshot`，路线写入时会同时冻结文件名、对象键和版本号。

## 3. 已确认整改清单

### 3.1 System RBAC 写操作结果和数据库错误映射

状态：`已完成`

已确认问题：

- 修改不存在用户的状态时，Repository 可能直接返回，HTTP 仍表现为成功。
- 给不存在用户分配空角色列表、给不存在角色分配空权限列表时，可能记录成功审计。
- 无效角色、权限、部门等引用依赖数据库外键失败，可能向客户端返回通用 500。
- 用户名、角色编码等自然键冲突缺少统一映射，System 与 Product 的 409 语义不一致。

整改要求：

- Repository 返回明确的 `success`、`not-found`、`invalid-reference`、`conflict` 结果或稳定模块错误。
- 在同一事务内锁定目标用户或角色，并校验引用集合；空集合也必须校验目标是否存在。
- 重复自然键返回 409，无效输入或引用返回稳定的 400/404，不得把 MySQL 错误直接暴露为 500。
- 核心写入和成功审计保持同一事务。
- 补充不存在目标、空角色/权限集合、无效引用和重复自然键的 API 测试及真实 MySQL 集成测试。

完成说明：

- RBAC 写路径统一返回 `RbacWriteResult`（`success`/`invalid-input`/`not-found`/`invalid-reference`/`conflict`）。写操作在事务内 `FOR UPDATE` 锁定目标用户或角色及引用记录，按主键升序加锁统一锁顺序，空集合同样校验目标存在；空白名称、短密码和非法状态由 application 层返回 `invalid-input` 结果。
- `check-api-architecture.mjs` 的 `operation_logs` 唯一写入口检查增强为识别反引号表名、`REPLACE [INTO]` 和 schema 前缀写法。
- `ER_DUP_ENTRY` 映射为 `conflict`（409）、外键失效映射为 `invalid-reference`（400），不再把 MySQL 错误暴露为 500；RbacService 不再直接抛 Nest HTTP 异常，由 RbacController（presentation）统一映射 HTTP 状态和错误信封。
- 补充了仓库单元测试、控制器 API 测试和 `tests/integration/identity/rbac-persistence.mysql.test.ts` 真实 MySQL 集成测试。

### 3.2 application 层协议和基础设施泄漏

状态：`已完成`

已确认问题：

- Identity 和 Product application 直接抛出 Nest HTTP 异常。
- Product、Production application 识别 `ER_DUP_ENTRY` 等数据库驱动错误码。
- Production 通过 Product 的公开入口依赖 `ProductDomainError`，公开错误契约和内部 domain 错误边界不清晰。
- 当前 ESLint 和 `check-api-architecture.mjs` 没有完整覆盖 Identity、Product、Production，导致 `architecture:check` 可能误报通过。

整改要求：

- 允许 application 使用 `@Injectable` 作为当前模块化单体的依赖注入手段，但不得直接抛 Nest HTTP 异常。
- infrastructure adapter 将数据库、S3 等实现错误映射为稳定模块错误；presentation 统一映射 HTTP 状态和错误结构。
- 跨模块公开稳定错误结果或查询契约，不直接把模块内部 domain 错误作为调用方控制流。
- ESLint 和架构检查同时覆盖 Identity、Product、Production 及相关 common 边界。
- 补充架构回归测试，保证 application 不引用 HTTP 异常、数据库驱动错误和 SDK 类型。

完成说明：

- Identity `auth.service` 改用协议无关的 `AuthenticationError`（`identity/domain/auth.errors.ts`），由 `auth.controller` 和 `auth.guard`（presentation）捕获后映射为 401，不再在 application 抛 `UnauthorizedException`。
- Product application 移除 5 个 Nest HTTP 异常类和 `ER_DUP_ENTRY` 识别；业务失败统一抛 `ProductDomainError`，新增 `ProductDomainExceptionFilter` 统一映射 HTTP（`NOT_FOUND`→404、`CONFLICT`/`ROUTE_IN_USE`/`DEFAULT_ROUTE_IN_USE`→409、`STORAGE_UNAVAILABLE`→502、其余→400），在 `ProductController` 注册。
- S3 存储适配器把对象存储失败映射为 `ProductDomainError('STORAGE_UNAVAILABLE')`；Product 与 Production 写仓库分别在 infrastructure 把 `ER_DUP_ENTRY` 映射为 `CONFLICT`（`mysql-product.shared.ts` 的 `mapProductWriteError`、`mysql-production.shared.ts` 的 `ensureNoDuplicate`）。
- 跨模块契约：`ProductSnapshotQuery` 改为返回稳定结果联合 `ProductQueryResult`，`ProductDomainError` 不再从 `product/public.ts` 导出，Production 不再依赖 Product 内部 domain 错误作为控制流，改按结果 `status` 分支映射为 `ProductionDomainError`。
- ESLint application 层新增 `no-restricted-syntax`（禁止 `@nestjs/common` 的所有 `*Exception` 命名导入与 `ER_*` 驱动错误码字面量），`no-restricted-imports` 补 `@aws-sdk/*` 等 SDK 包；`check-api-architecture.mjs` 重构为可导入的 `checkApiArchitecture()`，覆盖 identity/product/production 三个模块 application/domain 的 HTTP 异常、DB 驱动错误码、SDK 依赖、application/ports 的 mysql2 泄漏及 public.ts 的 domain 错误导出，并由 `scripts/__tests__/api-architecture.test.ts` 做源码级回归。
- 门禁按“所有 `*Exception`”匹配而非枚举已知类名：ESLint `no-restricted-syntax` 用 `ImportSpecifier[imported.name=/Exception$/]`，架构检查用 `@nestjs/common` 导入块内任意 `*Exception` 命名导入的正则，`UnprocessableEntityException`、`InternalServerErrorException`、`RequestTimeoutException` 等未枚举的 Nest 异常类同样被拦截；`checkApiArchitecture(extraSources)` 支持注入虚拟违规文件，`api-architecture.test.ts` 补充负向 fixture（未枚举异常类、DB 错误码、SDK、mysql2、public.ts domain 错误导出、operation_logs 直写均能拦截，非 Nest `*Exception` 不误报），避免门禁“假通过”。

### 3.3 `operation_logs` 所有权与事务审计边界

状态：`已完成`

原冲突：

- `docs/architecture.md` 将 `operation_logs` 归属 Identity/System，同时规定 common 不拥有业务表、模块不得直接修改其他模块拥有的表。
- 当前 `common/audit/transactional-audit-writer.ts` 直接保存 `operation_logs` 的 SQL，Product 和 Production repository 通过它参与业务事务。
- 简单改为调用现有 Identity `AuditRepository.writeLog()` 不能自动保证加入调用方已经开启的数据库事务。

已确定并落地的规则：

- `operation_logs` 明确归类为项目级平台审计基础设施，不属于 Identity/System、Product、Production
  或 `common` 的业务数据；历史上与 RBAC 表位于同一初始 migration 不构成 Identity/System 所有权。
- `common/audit/transactional-audit-writer.ts` 是唯一允许直接写 `operation_logs` 的基础设施入口。
  各业务模块在自身事务 executor 内直接调用该 Writer，不要求也不得为了形式合规而通过 Identity
  或其他模块的 `public.ts` 转发。
- application port 继续禁止暴露 Pool、Connection 或事务 executor；审计 Writer 仅在 infrastructure
  事务实现中使用。
- `docs/architecture.md` 和自动架构检查已同步；审计查询当前继续由 Identity/System 提供公开能力。
- 核心写入失败或成功审计失败时必须整体回滚；通用请求、拒绝和失败日志继续保持 best-effort。

### 3.4 正式业务列表分页和文件拆分

状态：`已完成`

完成说明：

- `process_steps`、`product_categories` 列表改为服务端分页（新增 `ProcessStepQuery`/`ProductCategoryQuery`，返回 `PageResult<T>`），前端 `ProcessesPage.vue`、`ProductCategoriesPage.vue` 不再全量下载后在浏览器切片；分类页父分类下拉改用独立 `/categories/options`，与分页列表解耦。
- 表单选择统一改为独立、最小字段的 `/options` 接口：新增 `/categories/options`、`/process-steps/options`、`/process-routes/options`，与已有 `/products/options`、`/users/options` 一起由前端 `Promise.all` 并发组合；删除聚合端点 `products/form-options`、`process-routes/form-options`，消除完整列表类型（`ProductCategoryListItem`/`ProcessStepListItem`）泄漏到表单。
- 按变化原因拆分超长基础设施文件：分类聚合拆为 `MysqlProductCategoryRepository`（新端口 `ProductCategoryRepository`），产品/BOM 聚合保留 `MysqlProductCatalogRepository`；路线生命周期保留 `MysqlProcessRouteRepository`，路线步骤（SOP 快照冻结、BOM 关联）拆为 `MysqlProcessRouteStepRepository`（新端口 `ProcessRouteStepRepository`）。`ProcessesPage.vue`/`ProductCategoriesPage.vue` 抽取 `useProcessSteps`/`useProductCategories` composable（视图与状态分离）。warehouse 演示页、System 模块等在各自迁移阶段再处理，不为压行数机械拆分。
- 规范与门禁：`docs/api-conventions.md` §5 明确“表单选择必须使用独立 `/options`、禁止复用分页列表接口在浏览器过滤、聚合 form-options 为反模式”；`docs/coding-standards.md` §4/§5 定义聚合/视图内聚警示线（基础设施 500 行、Vue 视图 1000 行）并给出拆分原则；`eslint.config.js` 的 `max-lines` 保持 warn 作为内聚信号并补注释说明。
- 验证：API 与前端 typecheck、单测、lint、architecture:check、build 全部通过；`form-options` 端点与前端调用在源码中无残留，仅文档作为反模式说明保留。

### 3.5 前端行内操作提交中守卫

状态：`已完成`

- 弹窗表单已经使用 `submitting` 和 `:loading`；下达、关闭、取消、启停、删除、生成物料等行内操作仍缺少统一 pending 守卫。
- 重复状态流转通常会被 version 乐观锁阻止，数据安全但会产生多余请求和 409；交互层守卫不能替代服务端幂等。
- 使用行级 `pendingIds: Set<string>`，入口同步添加、`finally` 删除，并绑定按钮 `disabled/loading`。
- 涉及 Production 页面以及 Product、System 的 `toggleStatus`、`deleteRole` 等操作。

完成说明：

- 新增 `useRowPending()`，以页面实例内的 `Set<string>` 同步守卫行内写操作；入口先占用、`finally` 释放，并绑定相应按钮的 `loading` 与 `disabled`。
- 已覆盖 Product、Production、System 三个域的启停、删除、下达、关闭、取消、生成物料等行内写操作，并补充 composable 与页面组件测试。
- 该守卫只消除同一页面的重复点击；后端幂等与乐观锁仍是跨请求和并发写入的安全边界。

### 3.6 跨页面 `/options` 授权契约与前端数据所有权解耦

状态：`已完成（含代码审查修正）`

已确认问题：

- 拆分独立 `/options` 后，每个选项端点被改为要求各自资源的视图权限，导致只拥有单页面权限的合法角色
  （如仅 `product:products:view`）在加载产品页所需的 `/categories/options`、`/process-routes/options` 时被
  403；前端页面级 `Promise.all` 因任一选项失败整体不赋值，且 403 触发全局处理器跳转无权限页。
- 页面级 `loadData()` 同时刷新「列表 + 全部 options」，把无关数据绑成共同失败域，写操作成功也连带
  刷新无关选项。

整改要求：

- 跨页面 `/options` 按「任意一个合法消费页面的视图权限」授权（any-of），授权集为消费页面视图权限的并集。
- 前端按数据所有权拆分：正式列表由页面级 list composable 持有；页面筛选项由页面级 options composable
  持有；表单/弹窗专用候选由弹窗级 composable 在打开/展开时加载，独立错误边界。
- 选项请求使用 `skipErrorHandling` 且逐项 best-effort，单个选项失败只影响该项下拉，不拖累列表或其他选项，
  也不触发全局 403 跳转。

完成说明：

- `permissionMatches` 支持 `string | string[]`（any-of），`RequirePermission` 接受权限数组；product 5 个
  options 端点按全部消费页面视图权限并集设置 OR 授权集（`categories/options`→[products,categories]、
  `process-steps/options`→[processes,routes]、
  `products/options`→[products,routes,production:orders:view,production:tasks:view]、
  `process-routes/options`→[products,routes,production:orders:view,production:tasks:view]、
  `users/options`→[routes,production:orders:view,production:tasks:view]），覆盖生产工单/任务页消费，精确恢复旧聚合端点的授权行为。
- 前端候选数据所有权收敛为“composable 实现复用、所有者实例局部化”：新增 `useRefreshableOptions` 基础实例
  与 `useProductOptions`/`useProcessRouteOptions`/`useUserOptions`/`useProcessStepOptions` 资源包装，
  正式列表仍由页面级 `useXxxList` 持有。同一缓存路由页内多个消费者共享同一候选源实例时提升到页面持有，
  否则由最近消费者（页面或弹窗）自持；谁持有实例谁负责它的页面激活刷新，消费者只通过 `refresh-x` 事件
  触发刷新。候选刷新时机为页面激活、弹窗打开、下拉展开；最新候选与当前已选值经 `live-options` 合并，
  失效已选值显示并拦截提交。删除共享 Pinia 参考 Store（`reference-options.ts`）以及 ensure/invalidate/
  revision/generation 语义。
- 契约与测试：`docs/api-conventions.md` §5 与 `docs/product-master-data-api.md` 明确跨页面 options 授权契约；
  补 any-of 守卫测试、options 元数据契约与「最小权限角色矩阵」测试（仅持单页面权限可读该页全部选项）。

代码审查修正：

- 任务表单「已下达工单候选」改为独立 `GET /production/work-orders/options` 端点（完整返回全部 `released` 且仍有余量的工单，前端本地过滤，最小字段 `WorkOrderOption`），移除复用正式分页接口在浏览器过滤/切片的实现（api-conventions.md §5）；任务弹窗编辑模式不再对只读工单做失效校验，已全部分配/状态变化/不在候选的工单不再阻断保存。
- 「刷新后合并当前选择并显示失效」补全：生产批次/任务/工序执行弹窗的路线与负责人下拉、工单/任务/产品页面的筛选下拉统一接入 `buildLiveOptions` 合并与提交前 `hasUnavailableSelection` 拦截。
- 任务默认路线解析改为候选就绪后补算：工单候选先返回而产品/路线未就绪时，记录待解析工单，产品/路线候选就绪后 `watch` 补算默认路线与工序预览，用户手动改路线不被候选刷新覆盖。
- 分类候选统一为 `useRefreshableOptions` 薄包装 `useProductCategoryOptions`（失败保留上次成功快照，不再置空误判失效），移除 `useProductCategories` 内重复的 options 加载；分类页父分类候选由弹窗自持实例。
- `useProductCategories`/`useProcessSteps` 正式列表补 last-request-wins；`ProductCategoriesPage` 移除 `onActivated` 首帧双请求（仅 `onMounted` 加载列表）。
- 关键明细生命周期：产品物料清单弹窗页面激活只刷新候选、明细失败由「刷新物料」按钮显式重试并禁用「添加已有物料」；路线步骤/物料清单弹窗关闭时推进请求 token，丢弃关闭后迟到的明细响应。

## 4. 已确认但按阶段实施

### 4.1 Production HTTP 幂等闭环

状态：`released（代码契约启用层面，四级口径见 http-idempotency-implementation-plan.md「进度口径」：2026-08-07 pnpm verify 全绿（18/18 任务，apps/api 42 文件 / 310 用例、admin-web 43 文件 / 257 用例）且本地以 PowerShell $env:RUN_MYSQL_INTEGRATION='1'; $env:TEST_DB_NAME='easy_mes_test'; $env:DB_NAME='easy_mes_test'（Bash 等价：RUN_MYSQL_INTEGRATION=1 TEST_DB_NAME=easy_mes_test DB_NAME=easy_mes_test）全量集成套件实测通过（5 文件 / 29 用例，含 HTTP 管线与真实锁等待 1205 用例）；瞬态错误契约已覆盖完整事务边界（登记 INSERT、handler 内业务 SQL、重放 SELECT、completed UPDATE、取连接/开启事务/提交统一映射 retryable 503；rollback 失败不覆盖原始异常；handler 内其他 SDK 网络错误不误判；firstRun/replay 成功指标 commit 后记录）；集成门禁要求 TEST_DB_NAME 必填、DB_NAME 必须与 TEST_DB_NAME 完全相等且库名以 _test 结尾（本地在 easy_mes_test 上完成，CI 使用 easy_mes_next_test）；契约已声明 Idempotency-Key 必填、前端已发送；CI 的 integration-mysql 作业待首次运行确认）`

当前状态：

- 数据层已经使用业务唯一约束和 version 乐观锁。
- `production_item_demand` 使用 `NORMAL:{production_batch_id}:{product_material_id}` 作为内部稳定键。
- 平台闭环已落地：`202608050001-http-idempotency-records` migration（`UNIQUE(scope,idempotency_key)`、
  `initial_request_id` 索引、completed 三字段联动 CHECK）、规范化请求指纹 + JSON-safe 校验、MySQL
  `IdempotencyExecutor` 适配器与平台 module、架构门禁（`http_idempotency_records` 唯一写入口）。
- 端点级启用元数据已落地：`@IdempotentEndpoint({ scope })` + `IdempotencyKeyGuard`（未启用端点携带键 → 400
  `IDEMPOTENCY_NOT_SUPPORTED`，启用端点缺少/非法键 → 400 `VALIDATION_ERROR`）；`AuditInterceptor` 已把
  `ConcurrencyError` 记录为 409/原错误码，与全局 `HttpExceptionFilter` 一致。
- `IDEMPOTENCY_NOT_SUPPORTED` 已在 `packages/constants` 登记；端口已携带 `requestId`，结果 codec 返回
  递归 `JsonValue` 且写入前运行时校验。
- createBatch 试点已接线：Controller 声明 `@IdempotentEndpoint({ scope: CREATE_BATCH_IDEMPOTENCY_SCOPE })`；`ProductionService.createBatch` 经
  `IdempotencyExecutor` 包装（scope `production.batch.create.v2`、指纹含 workOrderId + 规范化 body、重放
  不重跑 handler 且不新增成功审计）；管理端 `useIdempotentIntent` 意图 composable 已接入两个建批调用点，
  `createOrderBatch` 发送 `Idempotency-Key` 并启用 unsafe 重试；幂等键生成仅依赖 Web Crypto
  （`crypto.randomUUID()`，不可用时经 `getRandomValues` 拼接 UUID v4），环境不支持时直接抛错阻止提交，
  绝不降级 `Math.random` 等非加密随机数（弱随机键可预测/碰撞会制造重复批次风险）。
- 试点接线深化：负责人启用等受数据库状态影响的业务校验移入首次执行的 handler，重放不
  重复校验（避免负责人停用后同键重试返回 400）；首次执行即在 handler 内富化并保存最终响应快照（含用户
  名），重放返回与首次成功完全一致的响应；`@company/database` 新增 `withActiveConnection`，使 executor
  外层事务内的校验与富化只读查询复用同一事务连接，保证幂等记录、业务写入、成功审计与 handler 内读取
  同一事务上下文。
- 前端意图闭环细化：`useIdempotentIntent` 在 `IDEMPOTENCY_RESULT_CORRUPT` 后置
  blocked 状态并阻止继续提交（不重试、不自动换新键，首次结果是否成功不可知）；请求层 `isCorruptResult`
  跳过对该错误码的自动重试；工单页/任务页建批弹窗在结果未知（pending/blocked）关闭时经 `getStatus()`
  守卫弹确认，用户确认才放弃 K1，取消则保留弹窗与键，避免静默丢弃 K1 导致重复的自动编号批次；两个
  页面均补关闭守卫组件测试（`ProductionOrdersPage.test.ts`、`ProductionTasksPage.test.ts`）。
- 真实数据下的 JSON-safe 缺陷已修复并由集成用例覆盖：mysql2 把 `plan_start_date` 等 DATE/DATETIME 列返回
  Date 实例（映射器类型曾误标 string），幂等结果 codec 断言失败会使 createBatch 整体回滚；
  `mapBatch`/`mapWorkOrder` 改经 `date()` 统一转北京 ISO 字符串，codec `encode` 改为 JSON 序列化往返固化
  最终响应快照，与客户端收到的序列化结果一致。
- 幂等基础设施错误已区分映射并接入失败审计：瞬态错误分类已由 executor 落地并覆盖完整事务边界（登记
  INSERT、handler 内业务 SQL、重放 SELECT、completed UPDATE，以及取连接/开启事务/提交统一映射为
  `IdempotencyStorageError('retryable')` → `503 IDEMPOTENCY_STORAGE_RETRYABLE`；rollback 失败 best-effort
  记录不覆盖原始异常；handler 内其他 SDK 网络错误原样冒泡不误判；firstRun/replay 成功指标只在 commit
  成功后记录，含真实双事务锁等待用例，随 `RUN_MYSQL_INTEGRATION=1` 套件验证）；结果损坏（已保存结果无法反序列化）→ `500
IDEMPOTENCY_RESULT_CORRUPT`；`HttpExceptionFilter` 与 `AuditInterceptor` 统一识别。前端
  `useIdempotentIntent` 对结果损坏阻塞当前意图并提示人工处理，不重试、不自动换新键（首次结果是否成功
  不可知），直到用户显式放弃（关闭弹窗/重新发起）。
- createBatch 结果 codec 升级为 Zod 完整嵌套 schema（`production-batch-result.codec.ts`）：encode/decode 都经
  `productionBatchDetailSchema` 校验，不使用 `coerce`/`preprocess`，结构错误一律拒绝——首次结果结构错误在保存
  前使事务回滚，重放记录损坏走 `IDEMPOTENCY_RESULT_CORRUPT`；结果结构冻结在 scope `production.batch.create.v2`，
  形状变更必须 bump scope 并引入新 codec。
- 到期清理与运行观测已落地：新增 `infrastructure/idempotency/idempotency-housekeeping.service.ts`（平台到期
  清理唯一写入口，按小批次删除已到期 `completed` 记录，`expires_at` 只表示允许清理、物理删除前同键仍重放；
  发现持久化 `processing` 记录时告警并停止自动处置）与 `idempotency.metrics.ts`（in-memory 重放/冲突/失败
  计数，housekeeping 周期性输出重放率/冲突率/失败率摘要并重置窗口）；executor 在重放、冲突、结果损坏、
  可重试存储失败路径分别记录指标，平台日志只携带 requestId、scope 和脱敏键摘要（`idempotency-key-digest`），
  不再打印原始幂等键；架构门禁豁免 housekeeping 的到期清理写入。阶段 A 门槛（计划 §10 阶段 A 第 7/8 条、
  §12 观测项）已满足。
- 管理端当前没有表单草稿持久化、待提交恢复日志或按幂等键查询结果能力；内存 K1 只能随存活的
  composable/KeepAlive 实例保留，浏览器硬刷新后无法恢复；createBatch 试点界面/接口文档须声明该覆盖缺口。
- 前端闭环已加固：请求层对 `IDEMPOTENCY_RESULT_CORRUPT` 跳过自动重试（确定性失败，不得把重试次数浪费在
  必然失败的请求上，必须立即交回 composable 阻塞意图）；`useIdempotentIntent` 暴露
  idle/pending/blocked/expired 状态，意图超过服务端 12 小时重放保证窗口（`IDEMPOTENT_INTENT_TTL_MS`，
  与 executor 的 `expires_at = completed_at + 12 小时` 对齐，窗口从第一次正式提交的 `firstAttemptAt` 起算）
  后既不复用旧键重试也不自动换新键，须先核对业务结果；**结果未知的意图修改业务内容不得静默换键**（首次
  结果是否成功不可知，自动换新键盲发会制造重复批次，提交被拦截提示先核对、显式放弃后才生成新键）；
  两个创建弹窗在结果未知（模糊失败/提交在途/结果损坏/超出重试窗口）时关闭必须先经确认，取消
  保留弹窗与 K1、确认才 reset，避免静默丢 K1 或按“关闭并重新发起”生成 K2 造成第二个自动编号批次。
- 单元与契约测试通过，admin-web 类型检查与测试通过；真实 MySQL 集成套件已实测通过（进度 released）：
  2026-08-07 本地执行（当前可复现的 PowerShell/Bash 命令见根 README；本地 WSL Docker 使用
  宿主 `3307` 端口与 `easy_mes_test` 专用库）
  `pnpm test:production:mysql`（先经 `scripts/assert-mysql-integration-enabled.mjs` 校验显式开关与专用
  测试端点/库门禁——当前 `TEST_DB_HOST/PORT/NAME` 必填、`DB_HOST/PORT/NAME` 必须分别与之完全相等且库名必须以 `_test` 结尾，
  开发/生产库名一律拒绝；构建 utils/constants/database 后通过 `db:init`
  完成 migration、系统 seed 和管理员初始化，复验 seed 幂等性后运行
  `tests/integration` 全套），5 文件 / 29 用例全部通过；CI（`.github/workflows/ci.yml`）已新增
  `integration-mysql` 作业在专用测试库 `easy_mes_next_test` 上执行同一套件（待首次运行确认）；集成文件均以
  `process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip` 门禁。通用 executor 用例
  （`http-idempotency.mysql.test.ts`）覆盖并发、回滚、重放、冲突、过期清理，并新增 housekeeping 到期清理
  用例（已到期 completed 被物理删除、未到期保留重放、异常 processing 只告警不处置）；
  `create-batch-closed-loop.mysql.test.ts` 定位为 **application/database 闭环**（直接构造
  Controller/ProductionService/executor/真实仓库，未经过 HTTP 管线），证明
  "http_idempotency_records + production_batches + operation_logs"三者同一事务：成功三表同提交、业务失败
  三表同回滚、重放不新增写入且返回冻结快照；HTTP 管线部分由新增
  `create-batch-http-pipeline.mysql.test.ts` 覆盖（启动 Nest 测试应用 + supertest：AuthGuard/
  IdempotencyKeyGuard 顺序、DTO Pipe、CurrentIdempotentCommandContext、AuditInterceptor、HttpExceptionFilter 最终
  错误信封，含 Guard 门禁缺键 400、合法键放行）。每个用例前清空 scratch 与 scope 幂等记录，绝对计数断言
  不受跨用例/跨运行残留污染。

已确认缺口：

- `nextBatchNo` 自动生成批次号；请求成功但响应丢失后重试会生成新的批次号和第二个批次，数据库 UNIQUE 无法识别同一业务意图（已由 HTTP 幂等闭环覆盖）。
- 后续状态流转仅依赖 version 时，成功响应丢失后的重试可能返回 409，而不能重放原结果（阶段 C 逐项评估）。

实施要求：

- 后续动作：按风险评估工单下达/取消/关闭、批次状态确认、物料分配、出库和库存流水命令，逐项满足启用门槛
  后再扩展；`generateMaterialDemands` 先复验天然幂等再决定是否接入结果重放。
- 完整实施顺序、事务伪代码、前端生命周期和验收门槛见
  [`http-idempotency-implementation-plan.md`](http-idempotency-implementation-plan.md)。

待复验项：

- `generateMaterialDemands` 已通过 `SELECT ... FOR UPDATE` 锁定批次，但现有真实 MySQL 用例只覆盖顺序
  重复调用。必须补双事务测试；同时完整 application 路径会在状态短路前重新读取实时 BOM，第一次成功后
  若 BOM 变化，响应丢失重试可能先失败。因此当前只能认定 Repository 写入路径是天然幂等候选，不能静态
  断言整个 HTTP 端点无需结果重放。

### 4.2 Production 业务链路和追溯迁移

状态：`分阶段实施`

- 生产工单、生产批次、物料需求、最小分配与领料出库、工序派工与开工、工序报工的核心迁移顺序已经完成；此后已按批准切片追加外购物料窄入库、生产退料和现有库存批次盘点，不得据此扩展为通用 Inventory、Quality 或全链路 Traceability。
- 报工数据库模型已完成第一步：`202608100001-batch-step-reports` 新增不可变的分批报工事实，支持全量冲销和原单更正关系；同时迁移历史累计量并移除 `batch_step_records` 的四个累计数量列。
- 报工 application、HTTP、管理端、权限接线以及同事务的成功审计/幂等结果已经落地；数据库事实仍保持追加式写入，不恢复旧累计覆盖接口。
- 当前实施顺序已经收敛，必须按以下切片推进，不能因为报工事实表已经落地就绕过其物料前置链路：
  1. **4.2-A 最小物料分配与领料出库链路**：以追加 migration 落地本链路依赖的 `item_batch`、`inventory_transaction`、`production_item_allocation`、`outbound_order` 和 `outbound_detail`；本切片当时只开放可分配库存查询、生产需求分配/释放、生产领料出库及对应的 `production_material_outbound` 库存流水，不包含后续独立批准的外购物料窄入库、生产退料和现有库存批次盘点，也不提前迁入通用入库、库存报废或质量能力。分配必须以库存批次行锁和“账面可用量减有效预留”防止超分配；出库明细、负库存流水、成功审计和幂等结果必须同事务提交。全部正常需求完成有效分配后才允许批次进入 `material_assigned`，全部应领数量完成出库后才进入 `material_outbound`。同步完成 RBAC、HTTP、管理端操作和真实 MySQL 并发/回滚闭环测试。
  2. **4.2-B 工序派工与开工**：管理员逐工序确认负责人后执行 `pending -> assigned`；已派工员工显式开工后执行 `assigned -> doing` 并写入工序 `started_at`。第一道工序开工只接受 `production_batches.status = material_outbound`，并在同一事务把批次转为 `doing`、写入批次 `started_at`；物料分配或出库本身不得修改工序状态。本切片还必须返工现有临时接口：createBatch 不再接受或写入逐工序 `responsibleUserId`，批次创建后的 `responsible_user_id` 必须为空；现有“执行参数更新”不能继续以只改负责人但不改状态的方式冒充派工，实际 SOP 覆盖与派工/撤回/改派应拆成语义明确的命令和权限。
  3. **4.2-C 报工创建与管理员更正**：使用 migration 已校正的 `production:steps:report` POST 权限，稳定顺序锁定当前及相邻工序，校验 `required_normal` 和上下游数量，同事务写入普通/冲销/更正事实、异常待处置单、工序状态、成功审计和幂等结果，并补真实 MySQL 与 HTTP 闭环测试。普通报工只接受 `doing`；必报工工序在 `effective_normal == required_normal` 时自动完成。已完成工序更正后数量不足时，无下游冲突则重开为 `doing`，低于下游有效正常量则拒绝并提示先从下游冲销。
  4. **4.2-D 批次生产执行完工**：全部必报工工序完成后，服务端在事务内重新聚合最后一道必报工工序的 `effective_normal`，将其作为 `production_batches.completed_quantity`，并写入完工状态、时间、确认人和成功审计；客户端不得填写完成数量。没有必报工工序或数量不足时拒绝。当前不实现短批完工，未来必须通过独立生产损失/短批完工命令处理差额；本切片不写 `qualified_quantity`，也不等待尚不存在的最终质检结论。
- 工序状态规则已定稿，不再列为待决策项：`pending -> assigned -> doing -> completed`；开工前允许 `assigned -> pending` 撤回派工，合法更正导致数量不足或下游报废补产提高目标可触发 `completed -> doing`。批次执行完工仍由管理员显式确认；工单层另按 2026-08-13 定稿语义汇总所有批次后显式确认完工，两者是上下级聚合命令，不是互斥入口。
- 2026-08-11：4.2-A 与 4.2-B 已形成当前 UI/API/MySQL 闭环。`202608110002` 落地生产物料分配、出库和窄库存账本；`202608110003` 落地派工/开工权限，`202608110004` 追加员工“我的工序”页面权限，`202608130001` 补齐非必报工工序的员工显式完工权限。创建批次不再接收逐工序负责人，工序以 `pending + NULL responsible_user_id` 创建；管理端可逐工序派工、撤回和改派，员工端查看本人任务并显式开工，已开工的非必报工工序由当前负责人确认完成。必须报工工序仍只在有效正常数量达到要求时自动完成。
- 2026-08-11：4.2-C 与 4.2-D 已形成当前 UI/API/MySQL 闭环。报工与管理员更正使用不可变普通/冲销/替代事实并聚合有效数量；异常数量只创建待处置记录，不引入异常工序状态。2026-08-12 修正后续工序数量模型：所有必报工工序的最终 `required_normal` 均为批次计划量，上一工序有效正常量只作为当前 `released_normal` 报工上限；下游 `effective_normal + effective_abnormal` 合计不得超过该上限，达到部分放行量不得提前完成。生产执行完工由服务端重新聚合全部必报工工序，以末道必报工工序的有效正常数量写入 `completed_quantity`，客户端只提交 `version`；已完工重试返回既有结果且不重复审计，不写 `qualified_quantity`，不等待质量、返工或成品入库。执行事务套件覆盖未完成拒绝、成功审计同事务、审计失败回滚和天然幂等重放。
- 2026-08-11：当前 Production 只读生产追溯已落地独立查询投影和 `production:trace:view` 权限。支持按工单号、生产批次号、物料编码和库存批次号检索，只展示需求、分配、生产领料出库、负库存流水、工序、普通/冲销/替代报工链、有效聚合和异常待处置事实；不创建追溯事实表，不返回质量、返工、报废、退料或成品流向占位数组。
- 2026-08-11：生产领料出库修正为独立单据闭环。创建只形成 `pending_picking` 主单与多行明细，不扣库存；整单确认后才生成负库存流水并按已确认累计推进生产批次；待确认单可取消并释放可制单占用。管理端出库单列表、详情、确认、取消和浏览器打印已接真实 Production API。
- 2026-08-14：生产工单新状态语义已落地 Repository、HTTP 与管理端：取消只用于未下达草稿；首批次开工同事务推动工单进入 `doing`；下达后提前终止统一关闭且必须先处理全部未终态批次；足量完成由管理员在批次汇总弹窗显式确认，不由批次自动回写；`completed -> closed` 为行政归档。关闭原因进入事务审计，不新增高频查询字段，因此本次不需要 migration。
- 2026-08-14：生产任务生成与取消交互补齐。`released/doing` 工单只要仍有余量均可继续拆分批次；取消前展示待出库单、预留和需求影响，要求原因，并在事务中取消尚未确认的出库单、释放预留、关闭活动需求。第一版只允许 `pending/material_pending/material_assigned -> cancelled`，明确禁止已出库、已开工或已完成任务取消。
- 2026-08-20：工序报废补产已拆分为不可变 `batch_step_scrap_reproduction_authorization` 与补料单 `approved/fulfilled` 物流状态；需求直接关联补料单，异常报工区分当前/前置来源，并支持管理员选择物料计算截止工序。补料齐套后授权从首工序形成新增投入，按 `effective_normal` 逐道放行到额度截止工序。返工完成报工不重复消耗普通投入放行量；仍需持续补充大数据量查询性能基线。
- 2026-08-20：生产领料损耗补料已落地：只开放 `item_scrap.production_consumed`，管理员确认后固定一比一生成 `production_material_supplement(material_loss)` 与单条 `material_loss_supplement` 需求；只补实物，不增加产品补产授权或工序可报上限。migration、RBAC、后端事务、HTTP 幂等、统一管理端表格和测试已同步，其他库存报废场景继续禁用。
- 2026-08-13：异常“驳回”重新定义为专用“驳回并更正”事务，必须以不可变冲销/替代事实修正有效数量，禁止物理删除或只回退处置单状态。当前接口仍是只更新 `review_status` 的旧行为，管理端在新命令落地前不应把它描述为数量已修正。
- 2026-08-12：补齐 Production 内部窄库存账本的外购物料入库来源。`inbound_order` / `inbound_detail`
    只支持 purchased 的 pending 创建、整单确认和待确认取消；pending 不增加库存，确认逐明细生成
    `purchase_inbound` 正流水，取消不生成流水。管理端入库单与库存批次页已接真实 Production API，
    生产追溯补充入库单/正流水或“期初来源”，不扩展成通用 Warehouse、质量或成品库存能力。
- 2026-08-14：生产退料最小闭环已纳入当前 Production 范围。仅允许已确认生产领料的剩余物料退回，退回后固定进入公共 `available` 库存且不保留给原生产批次；“保留给原生产批次”和“退料报废”只允许在管理端预留禁用态，不得伪造后端能力。
- 2026-08-14：库存盘点最小闭环已纳入当前 Production 范围。仅覆盖现有 `item_batch × stock_status`，以账面快照、实盘数量和确认时原子差异流水完成调整；不扩展为通用仓储盘点或第二库存事实来源。
- 2026-08-12：生产报工记录页增加批次级执行摘要投影，一次分页查询返回必需的工序完成数、工序总数、有效异常累计和待处置异常数；管理端据此同时展示明确数值与进度条，并按北京时间在批次身份附近提示逾期。异常优先使用红色局部边框、标签和数值，逾期使用警告色；只强化既有执行事实，不引入异常工序状态或质量结论。
- 当前临时自检方案不创建过程检验任务，也不以 `need_inspection_snapshot` 或“无未关闭返工”阻塞下工序和生产执行完工；`effective_normal` 仅临时作为下工序放行量，不是最终质量合格量。批次最终质量确认、`qualified_quantity` 写入和质量驱动的返工扩展属于后续独立切片，不得混入 4.2-A/B/C；当前异常处置触发的最小返工闭环按已落地规则执行。
- 2026-08-11 数据库验证：临时 MySQL 8.4 空库完整应用至 `202608110001-production-abnormal-dispositions-and-demand-type-codes`，第二次执行无重复变更，migration status 全部为 applied；专用 `easy_mes_test` 完成 migration、系统 seed、管理员初始化和重复 seed 后，真实 MySQL 集成套件 5 文件 / 31 用例全部通过。该结果取代早于最新 migration 的 2026-08-10 空库证据。
- 当前已批准的库存相关范围仅包括：`purchased` 外购物料窄入库、生产物料分配与领料出库、已确认生产领料退回公共可用库存，以及现有 `item_batch × stock_status` 盘点。通用 Inventory 的其他出入库与库存报废、Quality 和全链路 Traceability 后端仍不得提前迁入。
- 旧项目没有可作为行为基准的完整追溯交互，不得根据页面原型臆造接口和状态。
- 异常返工与工序报废补产的当前最小闭环已经实现；尚未开放的是通用库存报废、最终质检放行、成品入库/流向和全链路追溯。“驳回并更正”仍须按不可变冲销/替代事实落地，禁止退回为物理删除或只修改审批状态；不得提前实现 `inspection_records`、`finished_flow_records`。
- 当前批次生产执行完工与最终质量确认必须保持两个语义：前者采用临时自检口径，由最后一道必报工工序的 `effective_normal` 自动形成 `completed_quantity`，不校验尚不存在的有效检验结论或未关闭返工；后者在质量模型、返工模型和 `qualified_quantity` 写入口径定稿前不得开放。未来质量闭环不能反向篡改当前 `normal_quantity` 的自检含义。
- 追溯记录不得成为第二库存或需求事实来源；库存数量只从 `inventory_transaction` 汇总，生产需求只从 `production_item_demand` 读取。

### 4.3 命令上下文与幂等能力分离

状态：`已完成（2026-08-10）`

- Identity、Product、Production 普通写命令已统一为不含幂等键的 `CommandContext`；废弃的
  `AuditContext` / `CurrentAuditContext` 已从生产代码删除。
- 已登记的 createBatch、物料分配创建和生产领料出库使用 `IdempotentCommandContext` 与
  `CurrentIdempotentCommandContext`；Guard 校验并规范化 header 后写入请求局部私有属性，普通装饰器不再解析幂等键。
- application port 与 Repository 只接收 `CommandContext`；相关 Production Service 在调用 Repository 前显式
  去除幂等键。架构门禁禁止旧类型回流、幂等上下文泄漏、未登记 executor/前端 header 使用及重复 Guard。
- Product 文件上传保持非幂等；HTTP 契约测试验证误带 header 在对象存储与数据库副作用前拒绝。
- 2026-08-11 验证：`pnpm verify` 全绿（API 43 文件 / 313 用例、管理端 43 文件 / 257 用例，lint 0 error / 18 warning）；包含最新 migration 的临时 MySQL 8.4 空库双执行与状态检查通过，专用 `easy_mes_test` 的完整真实 MySQL 套件 5 文件 / 31 用例通过。

## 5. 滞后及待业务决策事项

### 5.1 SOP 发布、版本和删除语义

状态：`整体方案滞后；实际需求确认后实施`

滞后原因：

- 尚未确认现场是继续从文件列表选择参考文件，还是在工序/任务入口直接上传并发布新版本。
- 尚未确定 SOP 的逻辑文档身份、版本序列、发布入口、权限和 `process_steps` 工序主数据生命周期；这里不指已经定稿的 `batch_step_records` 执行状态机。
- `process_steps.status` 当前只有启用/停用，不能表达“从未启用的草稿”和“历史停用”；是否升级为 `draft -> enabled -> disabled -> archived` 需要同步业务规则、前后端交互、对应数据库领域章节和追加 migration。

在完整方案确定前必须遵守的最低规则：

- SOP 可以为空；不得全局强制所有工序上传 SOP。
- 系统管理的任何文件都不允许硬删除，包括数据库记录对应的文件和对象存储内容；业务“删除”只能通过停用、归档或软删除表达，并保留历史追溯能力。
- 允许物理清理的只有上传失败且未登记进数据库的孤儿对象（临时对象从未成为系统管理的文件，无追溯需求）；已登记进 `technical_files` 的记录及其对象存储内容一律不得硬删除。
- 已发布 SOP 的“删除”只能禁止未来选择，不得删除或覆盖存储对象；旧版本必须保留供历史路线和生产记录追溯。
- 新内容必须创建新的 `technical_files` 记录、新的 `version_no` 和新的 `object_key`，不得复用或覆盖旧记录、旧对象。
- 已启用路线继续使用已冻结的旧 SOP；草稿路线是否允许刷新或选择新版本，待交互方案确认。
- 校验和快照作为后续增强项，暂不与当前决策绑定。

实施约束：

- 当前不直接实施完整 SOP 生命周期和 `process_steps` 工序主数据状态迁移。
- `DELETE /technical-files/:id` 已改为软删除（停用并标记删除，保留对象存储内容），满足“无硬删除”最低规则，可作为正式可用能力；完整发布、版本和归档生命周期仍滞后，待业务方案确认。
- 需求确认后先同步对应数据库领域章节、Product 策略和管理端交互，再追加 migration；不得修改已有 migration。

### 5.2 Production 数量计算精度

状态：`滞后；计算口径待业务确认`

滞后原因：

- 部分业务计算可能需要使用浮点计算过程，但当前尚未确认哪些计算允许使用、在哪一步舍入以及最终业务口径。
- 尚未确定四舍五入方式、比较精度、溢出处理和中间计算精度。
- 在统一口径前直接替换为某个 decimal 库或定点实现，可能固化错误业务语义。

当前约束和待确认项：

- 数据库存储继续遵守 `DECIMAL(12,4)`；不得把数据库事实字段改为 FLOAT/DOUBLE。
- 当前 `multiply()` 使用 JavaScript `Number` 后 `toFixed(4)`，属于已知待确认实现，不立即修改。
- 需要按字段和业务动作明确：输入允许精度、中间计算精度、舍入时点、舍入模式、比较规则、最大值和溢出行为。
- 口径确认后，再选择字符串十进制、定点整数或经评审的 decimal 库，并补 `0.0001`、边界舍入、最大值和乘法溢出测试。

## 6. 后续工程与部署任务

1. 其余正式范围模块的业务逻辑按批准顺序迁移。
2. Docker 开发环境快速启动脚本和跨平台兼容可以滞后实施。
3. 文件拆分和质量门禁稳定后，最高优先级执行完整 CI/CD 模拟，保证运维部署环境。
4. 最后统一生成 Compose、Nginx 等部署文件，避免环境变量分散及一处修改多处同步。
