# @company/contracts

前后端共享的 TypeScript 传输契约与 API 路径常量，导出入口见 [src/index.ts](src/index.ts)。本包不拥有业务事实或状态转换。

## 契约边界

- 当前只提供编译期 interface、type 和常量，不提供运行时 schema、OpenAPI 生成或兼容性检查。HTTP 校验由 API class DTO 与 ValidationPipe 承担；引入生成方案须先明确唯一维护位置并迁移现有 DTO。
- 类型边界遵守[架构规范](../../docs/architecture.md#4-模块公开边界与数据所有权)，稳定代码来自 [constants](../constants/README.md)，值的表示遵守[HTTP 规范](../../docs/api-conventions.md)。
- JWT 载荷由 [Identity 的令牌适配器](../../apps/api/src/modules/identity/infrastructure/jwt-token.service.ts)维护；共享认证契约提供登录输入、会话资料、令牌响应及令牌种类。
- 不另存业务规则副本；变更字段时同步所属模块的语义说明、API DTO 与实际消费方。展示投影、受审快照、业务事实分别建模，不因字段相似而互换。

## 业务语义入口

| 契约 | 当前规则 |
| --- | --- |
| 认证、用户、角色与权限 | [Identity](../../apps/api/src/modules/identity/README.md)；系统管理使用 `system.ts` 的 `System*` 契约 |
| 通知查询与首次已读 | [Notification](../../apps/api/src/modules/notification/README.md#接口及权限登记) |
| 产品、BOM 与候选 | [Product](../../apps/api/src/modules/product/README.md) |
| 系统表格模板与共享 JSON 表格 | [Template](../../apps/api/src/modules/template/README.md)；`JsonTableData` 的结构规范化由 [utils](../utils/README.md#json-表格) 所有，业务资料保存规则由各模块维护 |
| 工单、任务与产出汇总 | [工单与任务](../../apps/api/src/modules/production/docs/database/work-orders-and-batches.md) |
| 需求、替代与补料 | [需求设计](../../apps/api/src/modules/production/docs/database/demand-allocation-and-outbound.md) |
| 收尾投影与审批证据 | [结案设计](../../apps/api/src/modules/production/docs/database/production-termination.md) |
| 采购、到货与分配 | [Procurement](../../apps/api/src/modules/procurement/README.md)、[查询语义](../../apps/api/src/modules/procurement/docs/receipt-queries.md) |
| 检验事实与数量建议 | [Quality](../../apps/api/src/modules/quality/README.md) |
| 库存的物料／成品身份及入库来源 | [Inventory](../../apps/api/src/modules/inventory/docs/database.md)；外购历史来源投影见[公开能力](../../apps/api/src/modules/inventory/docs/public-contracts.md) |
| 审批人员与证据 | [Approval](../../apps/api/src/modules/approval/README.md) |

## 验证

测试类型入口为 `corepack pnpm --filter @company/contracts typecheck:test`，适用阶段见[测试策略](../../docs/testing-strategy.md)。

```text
corepack pnpm --filter @company/contracts typecheck
corepack pnpm --filter @company/contracts test
```
