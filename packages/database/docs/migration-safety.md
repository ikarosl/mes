# 迁移安全

迁移运行器在专用连接上获取 MySQL 建议锁 `easy_mes_migration`，然后读取校验和或执行 SQL。锁在 `finally` 块中释放，即使迁移失败也不例外。每条迁移只有在 SQL 执行成功后才会被记录。

迁移始终为仅追加（append-only）。新鲜验证会对一个干净的 MySQL 8.4 数据库应用所有迁移，然后再次运行迁移命令以证明待处理状态处理的幂等性，若存在待处理或校验和不匹配的文件则状态验证失败。升级和并发迁移器集成测试仍是下一个必需的测试环境里程碑。

系统基础数据位于 `packages/database/seed`，由 `pnpm db:seed` 幂等写入；测试业务数据仍由各 integration fixture 自行创建和清理。`pnpm db:init` 统一编排 migration、seed 和管理员账号初始化，但不能替代 migration fresh、升级迁移或并发迁移器测试。权限目录与应用代码和接口版本绑定，继续由对应的不可变 migration 管理，不与账号或测试 fixture 混放。演示或联调样例数据不属于系统基础数据，置于独立的 `packages/database/demo` 目录，由显式命令 `pnpm db:seed:demo` 加载。命令要求 `ALLOW_DEMO_SEED=1` 和单独的 `DEMO_USER_PASSWORD`，按业务编码幂等更新 System 演示角色/账号与 Product 主数据；`db:init`、生产部署与 CI 均不得自动加载。

数据库运行器保留两类入口：开发与 CI 使用 `tsx src/*.ts`，避免每次修改后手工构建；对应的 `*:compiled` 脚本使用 `node dist/*.js`，只消费构建产物。API 生产镜像通过 `pnpm --filter @company/api... build` 预先构建 `@company/database`，并通过 deploy 产物携带 `dist`、`migrations` 和 `seed`，不安装或运行 `tsx`。CD 迁移阶段必须以同一不可变 API 镜像执行一次性命令 `node node_modules/@company/database/dist/migrate.js`；成功后才允许启动或更新 API 工作负载。
