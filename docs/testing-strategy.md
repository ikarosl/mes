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

Production 的事务、并发建批、物料需求快照和幂等键需要在真实 MySQL 中验证。该测试直接调用 Repository 和真实 MySQL，不经过浏览器，因此属于 Integration，不属于 E2E。启动专用测试 MySQL 并设置 `RUN_MYSQL_INTEGRATION=1` 后，执行 `pnpm test:production:mysql`；该命令会先检查显式开关，随后才构建 database 包并应用当前 migration，再运行 `tests/integration/production` 下的测试。未设置开关时，专用命令会在任何数据库操作前失败；IDE 或普通测试发现该文件时则将其跳过，避免误迁移 `.env` 指向的数据库。

HTTP 幂等框架当前只有抽象端口单测，不代表服务端闭环已通过。后续 MySQL adapter 落地时，必须新增
真实双连接/双事务测试，覆盖同键并发只执行一次、同键同指纹重放、同键不同指纹冲突、首次事务回滚后
可再次执行、提交成功但响应丢失后的重试、到期未清理仍重放和物理清理后按新请求执行；不得用内存 fake
或顺序单测替代。API/契约测试还必须覆盖未启用端点拒绝意外 header、响应与失败审计都映射为同一 409
错误码、首次 request ID 可关联成功审计，以及结果 codec 拒绝非 JSON-safe 输出。完整矩阵见
[`http-idempotency-implementation-plan.md`](http-idempotency-implementation-plan.md)。

天然幂等复验必须从完整 application/API 路径执行，不能只调用 Repository。尤其
`generateMaterialDemands` 需要验证响应丢失后的重试不会在状态短路前因实时 BOM 已变化而失败，并使用
真实双事务证明并发调用只生成一次需求和一次成功审计。

## E2E 启用条件

当前阶段不保留 admin-web 子包内基于 CSS 结构和空页面渲染的 Playwright 测试，也不把 E2E 纳入 `pnpm verify`。只有在具备独立测试数据库、稳定数据准备/清理机制，以及至少一条完整业务旅程时，才在根目录 `tests/e2e` 增加 Playwright 配置和测试。主干或发布候选届时额外运行 E2E、镜像构建、镜像扫描和升级迁移测试。

## 最低策略

不先追求虚高覆盖率。新增或修复业务规则必须有测试；核心领域先设分支覆盖率门槛，UI 关注关键交互。历史代码迁移前先补 characterization tests，锁定已有行为后再重构。
