# @company/constants

前后端共享的稳定业务代码、权限常量与只读中文映射。这里只维护代码值，不放 DTO、查询或组件；传输结构由 [contracts](../contracts/README.md) 所有，状态转换与业务资格由[所属模块](../../docs/README.md#应用与模块)维护。

新增封闭代码同步 constants、contracts 与数据库 CHECK；权限目录随对应 migration 发布。预留代码、旧历史动作或展示用状态不代表已开放相应命令。Vue 与 Repository 不另存代码字典副本。

“工序报工”与“工序执行与报工管理”两项权限的中文提示名称由 [permissions.ts](src/permissions.ts) 维护，与只读权限目录随同一版本发布；具体授权与写入资格由 [Production](../../apps/api/src/modules/production/README.md) 所有。

内部业务编号的语义类型与人工前缀映射维护在 [business-number.ts](src/business-number.ts)，运行与数据库边界见[业务编号](../../apps/api/docs/business-numbering.md)。

导出入口见 [src/index.ts](src/index.ts)，完整状态及映射直接查源码，本入口不重复枚举。

## 验证

```text
corepack pnpm --filter @company/constants typecheck
corepack pnpm --filter @company/constants test
```
