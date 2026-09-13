# @company/constants

前后端共享的稳定代码值与权限常量，当前覆盖通用错误/并发代码、权限、System、Product、Production 和 Approval 状态及库存代码。

这里只维护枚举式事实和只读映射，不放 DTO、数据库查询或展示组件。传输结构由 `@company/contracts` 所有，业务状态转换规则由所属模块 domain 所有。

## 验证

```text
corepack pnpm --filter @company/constants typecheck
corepack pnpm --filter @company/constants test
```

生产工序只通过报工数量达标自动完成，不定义员工单独完成工序权限。

Approval 的 `role/user` 分配类型及中文映射统一在本包维护。待办属于节点，已移除个人任务状态及重新分派权限；`blocked` 仅作为当前无合格人的展示状态，旧重新分派动作编码仅用于读取历史记录。
