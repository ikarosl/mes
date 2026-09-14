# 当前产品范围

当前正式范围包括认证、RBAC、操作日志、管理端权限基础设施、产品主数据、技术文件、工序和工艺路线，以及 Production 的生产工单、生产批次、工序派工/开工/报工追溯、异常返工、报废补料、生产物料需求、分配、领料出库、外购物料窄入库、生产退料和现有库存批次盘点。

Approval 当前仅接入成品 BOM：管理端配置并发布顺序多级流程，每级选择一个角色或一个指定用户；BOM 送审、节点共享待办、决定、驳回与申请人撤回。角色成员变化实时影响尚未完成的当前节点，无需重新分派。最终批准同事务永久锁定 BOM，生产任务创建要求已批准；工单仍沿用现有下达方式，工单审批尚未接入。通用站内通知由 [Notification](../apps/api/src/modules/notification/README.md) 所有，首期只接审批节点激活、最终通过、驳回和撤回，提供本人通知及点击已读、30 秒未读角标拉取，不接外部渠道。

外购物料入库仅支持 `purchased` 来源；生产退料仅覆盖已确认领料退回公共可用库存；盘点仅覆盖现有 `item_batch × stock_status`。工序异常报废的人工补料属于 Production 最小闭环，不代表通用库存报废已迁移。

通用 Inventory 的其他出入库与库存报废、Quality 和全链路 Traceability 后端尚未进入当前范围，不得提前实现。详细业务不变量由 [Product](../apps/api/src/modules/product/README.md) 和 [Production](../apps/api/src/modules/production/README.md) 就近维护；跨模块数据库规则见[数据库公共约定](database-conventions.md)。
