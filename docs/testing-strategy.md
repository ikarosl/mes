# 测试体系

## 分层

- Unit：纯领域规则、状态机、数量计算、权限判断和数据规范化，不连接外部服务。
- Package/Application：workspace 导出契约、应用服务、Repository adapter 和基础设施组件；测试放在被测代码旁。
- Integration：真实 migration、MySQL 约束、Repository、事务和并发行为；放在根 `tests/integration`。
- API：NestJS Controller、DTO 校验、鉴权、错误信封、幂等和 HTTP 管线。
- Component：Vue 组件、表单、Store、Composable、菜单、路由和整页权限入口。
- E2E：通过公开 UI/API 验证少量跨系统核心旅程；当前尚未启用。
- Performance：关键查询与写路径的容量基线；当前尚未启用。

页面是否渲染属于 Component/Smoke，不作为 E2E。前端权限测试覆盖菜单、路由和整页入口；每个写接口的权限仍由后端 API 测试覆盖。

## 目录所有权

- 单元、组件和包级测试放在被测源码旁的复数目录 `__tests__/*.test.ts`。
- 后端模块测试跟随对应的 domain、application、infrastructure 或 presentation 层。
- 前端测试跟随对应组件、Store、Composable 或 view。
- 只有跨 workspace 的测试进入根 [tests](../tests/README.md)。当前该目录只实现真实 MySQL Integration。
- 不为尚无测试实现的 Contract、E2E 或 Performance 创建占位子目录。

## 常规门禁

根 `pnpm verify` 依次覆盖格式、文档链接、架构、migration、秘密和生产依赖扫描、Lint、构建、类型检查及单元/组件测试。禁止使用 `--passWithNoTests` 让缺失测试静默通过。

新增或修复业务规则必须补相邻测试；跨模块契约、数据库事务或 HTTP 管线发生变化时，补对应根 Integration/API 测试。历史代码重构前先以 characterization test 锁定现有行为。

## Production MySQL Integration

真实 MySQL 套件通过根命令运行：

```text
corepack pnpm typecheck:integration
corepack pnpm test:production:mysql
```

运行约束：

1. 必须显式设置 `RUN_MYSQL_INTEGRATION=1`。
2. `TEST_DB_HOST/PORT/NAME` 必填，`DB_HOST/PORT/NAME` 必须分别与其完全相等。
3. 数据库名必须以 `_test` 结尾；命令会在任何 migration 或清理前失败关闭。
4. 套件先构建运行时依赖的 workspace，再复用 `db:init` 初始化专用库并运行 `tests/integration`。
5. 本地 WSL Compose 默认使用宿主 `3307` 到容器 `3306`；CI 服务容器使用 `3306`。完整环境变量示例见根 [README](../README.md#数据库命令)。

库存事务测试删除 fixture 流水时，只允许使用以 `_test` 或 `_ci` 结尾的专用库，并在独占连接上短暂设置 `@company_inventory_test_cleanup = 1`。删除必须限定当前 fixture，随后立即清空会话变量；该机制不得用于开发、演示或生产数据库。

## 外部依赖与后续测试

MySQL migration 用户需要创建触发器；启用 binary log 的环境由数据库管理员配置等价于 `log_bin_trust_function_creators=1` 的策略，禁止为应用运行账号授予 `SUPER`。

只有具备独立测试环境、稳定数据准备/清理和至少一条真实核心旅程后，才启用 E2E。Contract 或 Performance 测试也必须先形成可运行入口、明确所有者和 CI 门禁，再进入根 tests 目录；不得用 README 代替实现。
