# 项目整改、阶段任务与待决策事项

本文是项目审查和开发阶段安排的正式参照，用于区分已经确认的问题、按阶段实施的整改、暂不能直接实施的业务冲突，以及一般工程任务。

## 1. 使用规则

- `已完成`：已经落地，仅在回归审查发现新证据时重新打开。
- `立即整改`：问题和目标行为已经确认，可以进入实施计划。
- `阶段实施`：问题已经确认，但必须跟随对应业务迁移阶段实施，不得提前扩大范围。
- `滞后 / 待决策`：现象或冲突已经发现，但实际业务需求、状态语义或计算口径尚未确定；只记录约束和决策输入，不直接改代码或 migration。
- 数据库业务设计仍以 `docs/new.md` 为准；本文件记录实施时机和待决策事项。若两者存在冲突，必须先完成评审并同步规范，不能由实现自行选择。
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
- 规范与门禁：`docs/api-conventions.md` §5 明确“表单选择必须使用独立 `/options`、禁止复用分页列表接口在浏览器过滤、聚合 form-options 为反模式”；`docs/coding-standards.md` §4/§5 把 500 行定义为聚合/视图内聚警示线并给出拆分原则；`eslint.config.js` 的 `max-lines` 保持 warn 作为内聚信号并补注释说明。
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

状态：`阶段 3 实施；分配、出库和库存流水迁移时启用`

当前状态：

- 数据层已经使用业务唯一约束和 version 乐观锁。
- `production_item_demand` 使用 `NORMAL:{production_batch_id}:{product_material_id}` 作为内部稳定键。
- `readIdempotencyKey`、`CommandContext.idempotencyKey` 和 `idempotencyConflict()` 为休眠代码，当前没有业务消费方。
- 客户端不得发送伪 `Idempotency-Key`；启用时必须在具体接口契约中声明必填。

已确认缺口：

- `nextBatchNo` 自动生成批次号；请求成功但响应丢失后重试会生成新的批次号和第二个批次，数据库 UNIQUE 无法识别同一业务意图。
- 后续状态流转仅依赖 version 时，成功响应丢失后的重试可能返回 409，而不能重放原结果。

实施要求：

- 使用 MySQL 中与业务写入同事务的幂等记录，保存幂等键、规范化请求指纹、执行状态和原结果；当前阶段不引入 Redis。
- 相同键和相同指纹重放原结果；相同键和不同指纹返回稳定冲突错误。
- 自动批次创建、后续确认、分配、出库和库存流水命令按风险逐项启用。
- 补充“提交成功但响应丢失后重试”、同键不同请求、并发相同键的真实 MySQL 集成测试。

待复验项：

- `generateMaterialDemands` 已通过 `SELECT ... FOR UPDATE` 锁定批次；两个并发事务是否仍会同时读到旧状态并触发相同 `idempotency_key` 冲突，必须通过真实 MySQL 双事务测试确认，不能仅凭静态推断认定。

### 4.2 Production 业务链路和追溯迁移

状态：`分阶段实施`

- 当前按生产工单、生产批次、工序报工、物料需求、分配和领料出库顺序迁移。
- 未完成的报工、分配、出库和批次完工状态不是当前已上线缺陷，但未实现按钮不得表现为可用功能。
- 通用库存、入库、退料、报废、盘点、质量和全链路追溯后端不得提前迁入。
- 旧项目没有可作为行为基准的完整追溯交互，不得根据页面原型臆造接口和状态。
- 生产、库存和质量事实链路稳定后，再按 `docs/new.md` 第四章实现 `inspection_records`、`rework_records`、`finished_flow_records` 和只读追溯查询。
- 批次完工确认必须校验必需报工工序完成、必检工序存在有效结论、没有未关闭返工。
- 追溯记录不得成为第二库存或需求事实来源；库存数量只从 `inventory_transaction` 汇总，生产需求只从 `production_item_demand` 读取。

### 4.3 `CurrentAuditContext` 类型迁移

状态：`滞后；不在当前整改范围`

- Identity `rbac.controller.ts` 和 Product `product.controller.ts` 仍使用已弃用的 `CurrentAuditContext` / `AuditContext`。
- 旧模块的类型系统后续统一升级；当前不因本项单独发起跨模块重构。
- 新代码继续使用 `CommandContext`，不得扩大旧接口使用范围。

## 5. 滞后及待业务决策事项

### 5.1 SOP 发布、版本和删除语义

状态：`整体方案滞后；实际需求确认后实施`

滞后原因：

- 尚未确认现场是继续从文件列表选择参考文件，还是在工序/任务入口直接上传并发布新版本。
- 尚未确定 SOP 的逻辑文档身份、版本序列、发布入口、权限和工序状态生命周期。
- `process_steps.status` 当前只有启用/停用，不能表达“从未启用的草稿”和“历史停用”；是否升级为 `draft -> enabled -> disabled -> archived` 需要同步业务规则、前后端交互、`docs/new.md` 和追加 migration。

在完整方案确定前必须遵守的最低规则：

- SOP 可以为空；不得全局强制所有工序上传 SOP。
- 系统管理的任何文件都不允许硬删除，包括数据库记录对应的文件和对象存储内容；业务“删除”只能通过停用、归档或软删除表达，并保留历史追溯能力。
- 允许物理清理的只有上传失败且未登记进数据库的孤儿对象（临时对象从未成为系统管理的文件，无追溯需求）；已登记进 `technical_files` 的记录及其对象存储内容一律不得硬删除。
- 已发布 SOP 的“删除”只能禁止未来选择，不得删除或覆盖存储对象；旧版本必须保留供历史路线和生产记录追溯。
- 新内容必须创建新的 `technical_files` 记录、新的 `version_no` 和新的 `object_key`，不得复用或覆盖旧记录、旧对象。
- 已启用路线继续使用已冻结的旧 SOP；草稿路线是否允许刷新或选择新版本，待交互方案确认。
- 校验和快照作为后续增强项，暂不与当前决策绑定。

实施约束：

- 当前不直接实施完整 SOP 生命周期和工序状态迁移。
- `DELETE /technical-files/:id` 已改为软删除（停用并标记删除，保留对象存储内容），满足“无硬删除”最低规则，可作为正式可用能力；完整发布、版本和归档生命周期仍滞后，待业务方案确认。
- 需求确认后先同步 `docs/new.md`、Product 策略和管理端交互，再追加 migration；不得修改已有 migration。

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
