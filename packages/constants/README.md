# @company/constants

前后端共享的稳定业务代码、权限常量、显式权限目录与只读中文映射。这里不放 DTO、查询或组件；传输结构由 [contracts](../contracts/README.md) 所有，状态转换与业务资格由[所属模块](../../docs/README.md#应用与模块)维护。

封闭代码的维护要求见[数据库公共规则](../../docs/database-conventions.md#统一类型与状态规则)，权限发布与目录含义见 [Identity](../../apps/api/src/modules/identity/docs/database.md#14-permissions)。预留代码或历史动作不表示已开放相应业务。

权限入口为 [permissions.ts](src/permissions.ts) 与 [permission-catalog.ts](src/permission-catalog.ts)，后者同时提供名称、层级及中文提示；本包不另列副本。

内部业务编号的语义类型与人工前缀映射维护在 [business-number.ts](src/business-number.ts)，运行与数据库边界见[业务编号](../../apps/api/docs/business-numbering.md)。

导出入口见 [src/index.ts](src/index.ts)，完整状态及映射直接查源码，本入口不重复枚举。

## 验证

```text
corepack pnpm --filter @company/constants typecheck
corepack pnpm --filter @company/constants typecheck:test
corepack pnpm --filter @company/constants test
```

应用检查与正式测试的区别见[测试策略](../../docs/testing-strategy.md)。
