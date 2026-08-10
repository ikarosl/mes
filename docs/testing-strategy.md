# 测试体系

## 分层

- Unit：领域规则、状态机、数量计算、权限判断；不连接数据库。
- Integration：Repository、事务、迁移、MySQL 约束、Redis/Storage adapter；使用真实容器依赖。
- API：NestJS HTTP、DTO 校验、错误码、鉴权、幂等和 OpenAPI 契约。
- Component：Vue 页面组件、Modal 表单、页面权限入口、业务状态按钮、状态标签和 composable。前端权限测试覆盖菜单、路由和整页入口，不要求逐个验证操作按钮的权限隐藏；写接口权限由后端 API 测试覆盖。
- E2E：只覆盖跨 UI、API 和独立测试数据库的少量核心旅程，例如登录、建档、工单到批次、物料分配、报工、检验返工；页面能否渲染属于 Component/Smoke，不作为 E2E。
- Performance：查询和关键写路径容量基线；按发布或定时任务执行。

## 目录约定

- 单元测试和组件测试放在被测模块附近的 `__tests__` 目录中，文件名统一为 `*.test.ts`。
- 统一使用复数目录名 `__tests__`，不得使用 `__test__`，也不得将测试文件与生产源码平铺。
- 包级测试放在 `packages/<package>/src/__tests__`。
- 后端模块测试放在对应分层目录下的 `__tests__`，例如 `presentation/http/__tests__`。
- 前端组件、Store、Composable 测试放在对应源码目录下的 `__tests__`。
- 跨模块的集成、契约、E2E 和性能测试分别放在根目录 `tests/integration`、`tests/contract`、`tests/e2e` 和 `tests/performance`。

## PR 门禁

1. format check
2. lint（零 error）
3. typecheck
4. unit + component tests，禁止无测试静默通过
5. build
6. MySQL migration fresh test
7. integration/API tests
8. 依赖与秘密扫描

## Production MySQL 持久化集成测试

根级 Integration 测试由 `typecheck:integration` 纳入 `pnpm verify`；即使运行时依赖未启动，也必须通过静态类型检查。

Production 的事务、并发建批、物料需求快照和幂等键需要在真实 MySQL 中验证。该测试直接调用 Repository 和真实 MySQL，不经过浏览器，因此属于 Integration，不属于 E2E。启动专用测试 MySQL，并设置 `RUN_MYSQL_INTEGRATION=1`、`TEST_DB_NAME`、`DB_NAME` 与 `ADMIN_PASSWORD` 后，执行 `pnpm test:production:mysql`（环境变量设置方式任选其一）：

- PowerShell：`$env:RUN_MYSQL_INTEGRATION='1'; $env:TEST_DB_NAME='easy_mes_test'; $env:DB_NAME='easy_mes_test'`，再执行 `pnpm test:production:mysql`；
- Bash：`RUN_MYSQL_INTEGRATION=1 TEST_DB_NAME=easy_mes_test DB_NAME=easy_mes_test pnpm test:production:mysql`；
- 或直接在仓库根 `.env` 中写入这三个变量：`scripts/assert-mysql-integration-enabled.mjs` 会在任何判定前先加载 `.env`；系统环境变量（PowerShell `$env:`）优先于 `.env`，`.env` 不会覆盖已注入的变量。

该命令会先检查显式开关与专用测试库门禁（`TEST_DB_NAME` 必填，`DB_NAME` 必须与 `TEST_DB_NAME` 完全相等且库名以 `_test` 结尾，开发/生产库名一律拒绝），随后构建所需 workspace，复用 `db:init` 执行 migration、系统 seed 和管理员初始化，再重复执行一次 seed 证明幂等性，最后运行 `tests/integration` 全套测试
（`vitest.mysql.config.ts` 的 include 为 `tests/integration/**/*.test.ts`，当前共 5 个文件：
`production/production-persistence.mysql.test.ts`、`identity/rbac-persistence.mysql.test.ts`、
`idempotency/http-idempotency.mysql.test.ts`、`idempotency/create-batch-closed-loop.mysql.test.ts` 与
`idempotency/create-batch-http-pipeline.mysql.test.ts`）。未设置开关时，专用命令会在任何数据库操作前失败；IDE 或普通测试发现该文件时则将其跳过，避免误迁移 `.env` 指向的数据库。

HTTP 幂等平台的 MySQL 适配器与真实 MySQL 集成用例已落地（与 production 集成测试一样以
`RUN_MYSQL_INTEGRATION=1` 与 `_test` 专用测试库门禁；CI 已新增 `integration-mysql` 作业在专用测试库
`company_mes_next_test` 上执行同一套件，待首次运行确认，跑通记录见 `docs/todo.md` 4.1 的进度口径）：
`tests/integration/idempotency/http-idempotency.mysql.test.ts` 覆盖同键并发只执行一次、同键同指纹重放、
同键不同指纹冲突、首次事务回滚后再次执行、提交成功但响应丢失后的重试、到期未清理仍重放、物理清理后
按新请求执行、housekeeping 到期清理（已到期 completed 物理删除、未到期保留重放、异常 processing
只告警不处置），以及 executor 瞬态错误分类的真实双事务锁等待用例；
`create-batch-closed-loop.mysql.test.ts` 定位为 **application/database 闭环**（直接构造
Controller/Service/executor/真实仓库，未经过 HTTP 管线），验证幂等记录、业务写入与成功审计三表同事务
（成功同提交、失败同回滚、重放不新增写入）；HTTP 管线部分由新增
`create-batch-http-pipeline.mysql.test.ts` 覆盖（启动 Nest 测试应用 + supertest：AuthGuard/
IdempotencyKeyGuard 顺序、DTO Pipe、CurrentIdempotentCommandContext、AuditInterceptor、HttpExceptionFilter 最终
错误信封）。API/契约测试还覆盖未启用端点拒绝意外 header、响应与失败审计都映射为同一 409 错误码、
首次 request ID 可关联成功审计，以及结果 codec 拒绝非 JSON-safe 输出。完整矩阵见
[`http-idempotency-implementation-plan.md`](http-idempotency-implementation-plan.md)。

命令上下文迁移测试同时锁定：普通 `CommandContext` 不含幂等键；Guard 将 trim 后的键写入请求局部私有
属性；只有 createBatch 使用 `IdempotentCommandContext` 和 executor；Repository Port/Adapter 不依赖该
子类型。Product 文件上传 HTTP 契约测试必须证明误带 header 返回 `IDEMPOTENCY_NOT_SUPPORTED`，且
`storage.storeSop()` 与数据库 Repository 均未调用。

天然幂等复验必须从完整 application/API 路径执行，不能只调用 Repository。尤其
`generateMaterialDemands` 需要验证响应丢失后的重试不会在状态短路前因实时 BOM 已变化而失败，并使用
真实双事务证明并发调用只生成一次需求和一次成功审计。

## E2E 启用条件

当前阶段不保留 admin-web 子包内基于 CSS 结构和空页面渲染的 Playwright 测试，也不把 E2E 纳入 `pnpm verify`。只有在具备独立测试数据库、稳定数据准备/清理机制，以及至少一条完整业务旅程时，才在根目录 `tests/e2e` 增加 Playwright 配置和测试。主干或发布候选届时额外运行 E2E、镜像构建、镜像扫描和升级迁移测试。

## 最低策略

不先追求虚高覆盖率。新增或修复业务规则必须有测试；核心领域先设分支覆盖率门槛，UI 关注关键交互。历史代码迁移前先补 characterization tests，锁定已有行为后再重构。
