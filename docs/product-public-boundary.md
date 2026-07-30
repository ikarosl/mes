# Product 公开入口

`apps/api/src/modules/product/public.ts` 导出 `ProductSnapshotQuery`，作为供未来生产编排使用的 Product 模块唯一读入口。

它仅返回稳定的产品、BOM、工艺路线、工序和 SOP 快照。BOM 行暴露 Product 模块拥有的 `productMaterialId`；工艺路线工序暴露 `routeStepId`、默认负责人和冻结的 SOP 对象键，使生产消费者无需直接查询 Product 模块的表。多查询的 BOM 与工艺路线快照在单个数据库事务中完成读取。

该契约不得暴露数据库行、连接、连接池、事务执行器或存储 SDK 类型。消费者不得查询 Product 模块拥有的表，也不得导入 Product 模块内部实现。工艺路线工序的 SOP 文件名、对象键和版本号均为独立快照；工序步骤生命周期的重新设计已推迟至 `docs/todo.md`。
