# 未解决冲突索引

本索引只维护当前仍存在的业务定义冲突、文档与代码或 migration 差异。已明确取代的生产模型见 [ADR-0027](adr/0027-tracking-card-workbench-and-terminal-output.md)；未批准设想、待验收和正式测试缺口见[路线图](roadmap.md)。实现存在不代表用户验收通过。

## Product 人员候选入口

[Product 候选权限规则](../apps/api/src/modules/product/docs/product-rules.md)仍声明 `/api/product/users/options` 供工艺路线和生产任务选择负责人，[权限测试](../apps/api/src/modules/product/presentation/http/__tests__/product.controller.test.ts)也保留 `userOptions`；当前 [ProductController](../apps/api/src/modules/product/presentation/http/product.controller.ts)没有该方法。双方不一致导致对应测试类型检查失败。待明确该入口的退役边界及人员候选归属后，由 Product 同步所有者文档与权限测试；不据此恢复旧接口或删除权限覆盖。
