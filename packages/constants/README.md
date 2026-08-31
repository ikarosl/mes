# @company/constants

前后端共享的稳定代码值与权限常量，当前覆盖通用错误/并发代码、权限、System、Product 和 Production 状态及库存代码。

这里只维护枚举式事实和只读映射，不放 DTO、数据库查询或展示组件。传输结构由 `@company/contracts` 所有，业务状态转换规则由所属模块 domain 所有。

## 验证

```text
corepack pnpm --filter @company/constants typecheck
corepack pnpm --filter @company/constants test
```
