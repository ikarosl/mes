# @company/constants

前后端共享的稳定代码值与权限常量，当前覆盖通用错误/并发代码、权限、System、Product、Production、Approval 状态、库存代码及 Notification 事件/来源/目标/筛选类型。

这里只维护枚举式事实和只读映射，不放 DTO、数据库查询或展示组件。传输结构由 `@company/contracts` 所有，业务状态转换规则由所属模块 domain 所有。

`MATERIAL_OPTIONS_WINDOW_SIZE` 统一采购物料远程候选的窗口大小为 50。

`procurement.ts` 维护供应商名称与远程选项边界、稳定业务错误码；`PERMISSIONS.procurement.suppliers` 定义查看、新增、修改权限。订单和到货的 `view` 常量仅用于已批准的选项消费授权，相关业务端点与权限目录由后续阶段实施。

## 验证

```text
corepack pnpm --filter @company/constants typecheck
corepack pnpm --filter @company/constants test
```

生产工序只通过报工数量达标自动完成，不定义员工单独完成工序权限。

Approval 的 `role/user/business` 分配类型、业务来源编码及中文映射统一在本包维护。待办属于节点，已移除个人任务状态及重新分派权限；`blocked` 仅作为当前无合格人的展示状态，旧重新分派动作编码仅用于读取历史记录。
