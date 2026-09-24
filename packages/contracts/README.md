# @company/contracts

前后端共享的 TypeScript 传输契约与 API 路径常量，导出入口见 [src/index.ts](src/index.ts)。本包不拥有业务事实或状态转换。

## 契约边界

- 当前只提供编译期 interface、type 和常量，不提供运行时 schema、OpenAPI 生成或兼容性检查。HTTP 校验由 API class DTO 与 ValidationPipe 承担；引入生成方案须先明确唯一维护位置并迁移现有 DTO。
- 不暴露数据库行、连接、SDK 或内部领域对象。稳定代码来自 [constants](../constants/README.md)，ID、数量、时间、分页及空值遵守[HTTP 规范](../../docs/api-conventions.md)。可空身份保留真正的 `null`，不能序列化为字符串 `"null"`。
- 不另存业务规则副本；变更字段时同步所属模块的语义说明、API DTO 与实际消费方。展示投影、受审快照、业务事实分别建模，不因字段相似而互换。

## 业务语义入口

| 契约 | 当前规则 |
| --- | --- |
| 产品、BOM 与候选 | [Product](../../apps/api/src/modules/product/README.md) |
| 工单、任务与产出汇总 | [工单与任务](../../apps/api/src/modules/production/docs/database/work-orders-and-batches.md) |
| 需求、替代与补料 | [需求设计](../../apps/api/src/modules/production/docs/database/demand-allocation-and-outbound.md) |
| 收尾投影与审批证据 | [结案设计](../../apps/api/src/modules/production/docs/database/production-termination.md) |
| 采购、到货与分配 | [Procurement](../../apps/api/src/modules/procurement/README.md) |
| 检验事实与数量建议 | [Quality](../../apps/api/src/modules/quality/README.md) |
| 库存的物料／成品身份 | [Inventory](../../apps/api/src/modules/inventory/docs/database.md) |
| 审批人员与证据 | [Approval](../../apps/api/src/modules/approval/README.md) |

## 验证

```text
corepack pnpm --filter @company/contracts typecheck
corepack pnpm --filter @company/contracts test
```
