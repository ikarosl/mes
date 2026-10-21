# @company/constants

前后端共享的稳定业务代码、权限常量、显式权限目录与只读中文映射。这里不放 DTO、查询或组件；传输结构由 [contracts](../contracts/README.md) 所有，状态转换与业务资格由[所属模块](../../docs/README.md#应用与模块)维护。

新增封闭代码同步 constants、contracts 与数据库 CHECK；权限目录随对应 migration 发布。预留代码、旧历史动作或展示用状态不代表已开放相应命令。Vue 与 Repository 不另存代码字典副本。

权限编码由 [permissions.ts](src/permissions.ts) 维护，可分配权限的名称、显式父级、类型、路由和排序由 [permission-catalog.ts](src/permission-catalog.ts) 的 `PERMISSION_CATALOG` 集中维护，并随成对 migration 发布。通配权限 `*` 由 [system seed](../database/seed/README.md) 单独管理；目录父子不隐式授予子权限，HTTP 鉴权以接口声明的编码为准，完整目录规则由 [Identity](../../apps/api/src/modules/identity/docs/database.md#14-permissions) 所有。

“工序报工”与“工序执行与报工管理”的中文提示复用同一目录文件中的 `PRODUCTION_STEP_PERMISSION_LABELS`，具体授权与写入资格由 [Production](../../apps/api/src/modules/production/README.md) 所有。

内部业务编号的语义类型与人工前缀映射维护在 [business-number.ts](src/business-number.ts)，运行与数据库边界见[业务编号](../../apps/api/docs/business-numbering.md)。

导出入口见 [src/index.ts](src/index.ts)，完整状态及映射直接查源码，本入口不重复枚举。

## 验证

```text
corepack pnpm --filter @company/constants typecheck
corepack pnpm --filter @company/constants typecheck:test
corepack pnpm --filter @company/constants test
```

应用构建与类型检查不编译相邻测试；`typecheck:test` 独立检查测试文件，Vitest 继续执行正式测试。暂缓正式测试时，将旧契约断言迁移列入路线图，不以应用检查通过代替测试通过。
