# @company/constants

前后端共享的稳定业务代码、权限常量与只读中文映射。这里只维护代码值，不放 DTO、查询或组件；传输结构由 [contracts](../contracts/README.md) 所有，状态转换与业务资格由[所属模块](../../docs/README.md#应用与模块)维护。

新增封闭代码同步 constants、contracts 与数据库 CHECK；权限目录随对应 migration 发布。预留代码、旧历史动作或展示用状态不代表已开放相应命令。Vue 与 Repository 不另存代码字典副本。

导出入口见 [src/index.ts](src/index.ts)，完整状态及映射直接查源码，本入口不重复枚举。

## 验证

```text
corepack pnpm --filter @company/constants typecheck
corepack pnpm --filter @company/constants test
```
