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

仓库内 `.worktrees/` 与 `.claude/worktrees/` 是独立 checkout 的临时副本；`temp/`、`ai_output/` 是 Git 忽略的本地草稿和输出，不属于交付源码。格式、Lint、Vitest 发现与 Docker 构建上下文均排除这些目录，避免本地检查混入 CI checkout 中不存在的临时文件。当前 `apps/`、`packages/`、`scripts/` 和 `tests/` 中的有效测试仍按原入口执行。

根单元／组件 Vitest 配置每个进程最多使用 2 个 worker，避免 Turbo 同时运行多个 workspace 时重复按整机 CPU 数量扩张进程池；MySQL 套件仍按其专用配置逐文件执行。

MySQL 单例与 hook 超时为 180 秒，为完整 migration 链及清理保留执行余量；断言、专用测试库保护和失败退出保持生效。

API、管理端以及 contracts／constants／utils 的应用构建、应用类型检查不编译相邻测试文件；测试通过 Vitest 独立运行。测试类型检查分别使用
`corepack pnpm --filter @company/api typecheck:test`、`corepack pnpm --filter @company/admin-web typecheck:test`、`corepack pnpm --filter @company/contracts typecheck:test`、`corepack pnpm --filter @company/constants typecheck:test` 和 `corepack pnpm --filter @company/utils typecheck:test`，在集中修复或验证测试时单独执行，不阻塞应用构建。用户暂缓正式测试期间，重要覆盖缺口按能力集中在[路线图](roadmap.md#存量测试恢复待正式测试授权)，收录边界遵守 [AGENTS.md](../AGENTS.md#文档读取与维护)；不能以应用检查通过代替测试检查。

交付和正式测试的先后顺序以 [AGENTS.md](../AGENTS.md#数据库与交付约定) 为准。进入正式测试阶段后，新增或修复业务规则必须补相邻测试；跨模块契约、数据库事务或 HTTP 管线发生变化时，补对应根 Integration/API 测试。在已获准编写测试的阶段，历史代码重构前先以 characterization test 锁定现有行为。

### 暂缓完善测试集期间的存量清理

当前仅维护本地与 CI 可执行的存量门禁，不代表进入正式测试补全阶段。废弃测试须先由子代理核对现行实现和所有者文档、向主代理报告，再由主代理判断重要性：已移除功能的专属低重要性断言可以删除；权限、事务、幂等、库存事实、并发及数量不变量等高重要性覆盖在原文件仅保留测试说明注释，并以 `TODO(scope): 测试目的；重要性与暂停原因；恢复条件` 和 `it.todo` 显式登记，不保留旧测试实现。共享夹具整体失效时仅原位保留恢复说明；不得以全局排除、忽略类型错误或空测试通过代替登记。

文案、已确定的权限路径及必填夹具字段可作最小机械适配；需要新数据准备或重写业务旅程的用例等待正式测试授权。测试报告中的 TODO 是待恢复覆盖，不能计入通过数；恢复优先级及待验收集中在[路线图](roadmap.md#存量测试恢复待正式测试授权)。

## 业务 MySQL Integration

现有 `test:production:mysql` 命令覆盖根 `tests/integration` 下全部真实 MySQL 套件，包括 Production、Identity、审批 BOM 闭环和审批/产品迁移；命令名称不限制测试目录。

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
5. 本地 WSL Compose 默认使用宿主 `3307` 到容器 `3306`；CI 服务容器使用 `3306`。按下方示例在当前终端临时设置，系统环境变量优先于根 `.env`。

PowerShell：

```powershell
$env:RUN_MYSQL_INTEGRATION='1'
$env:TEST_DB_HOST='127.0.0.1'
$env:TEST_DB_PORT='3307'
$env:TEST_DB_NAME='easy_mes_test'
$env:DB_HOST=$env:TEST_DB_HOST
$env:DB_PORT=$env:TEST_DB_PORT
$env:DB_NAME=$env:TEST_DB_NAME
pnpm test:production:mysql
```

Bash：

```bash
RUN_MYSQL_INTEGRATION=1 TEST_DB_HOST=127.0.0.1 TEST_DB_PORT=3307 \
TEST_DB_NAME=easy_mes_test DB_HOST=127.0.0.1 DB_PORT=3307 \
DB_NAME=easy_mes_test pnpm test:production:mysql
```

也可在仓库根 `.env` 配置 `TEST_DB_*`，但为避免常规开发连接被改为测试库，建议只在执行命令的终端临时覆盖 `DB_*`。系统环境变量优先于 `.env`。

Docker 不是执行前提。已有本机 MySQL 服务时直接使用其实际主机和端口，临时将 `DB_*` 与 `TEST_DB_*` 同时指向独立测试库后运行上述命令；不要仅为测试改写常规 `.env` 或把开发库当作清理目标。`test:production:mysql` 自行初始化测试库，无需执行启动容器的 `infra:init`。

审批场景验证见 [Approval](../apps/api/src/modules/approval/README.md)，通知发布、本人隔离与提交后钩子验证见 [Notification](../apps/api/src/modules/notification/README.md)；跨模块套件入口与 fixture 清理要求见[tests](../tests/README.md)。模块专题维护业务覆盖，本规范不重复逐条列出。

库存事务测试删除 fixture 流水时，只允许使用以 `_test` 或 `_ci` 结尾的专用库，并在独占连接上短暂设置 `@company_inventory_test_cleanup = 1`。删除必须限定当前 fixture，随后立即清空会话变量；该机制不得用于开发、演示或生产数据库。

## 外部依赖与后续测试

MySQL migration 用户需要创建触发器；启用 binary log 的环境由数据库管理员配置等价于 `log_bin_trust_function_creators=1` 的策略，禁止为应用运行账号授予 `SUPER`。

只有具备独立测试环境、稳定数据准备/清理和至少一条真实核心旅程后，才启用 E2E。Contract 或 Performance 测试也必须先形成可运行入口、明确所有者和 CI 门禁，再进入根 tests 目录；不得用 README 代替实现。
