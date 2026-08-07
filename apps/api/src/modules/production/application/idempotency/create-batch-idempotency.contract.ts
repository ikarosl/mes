/**
 * createBatch 幂等契约（scope `production.batch.create.v1`）。
 *
 * scope 由服务端唯一控制：客户端只发送 `Idempotency-Key`，不传输、不协商 scope，也不能决定服务端
 * 的存储命名空间。该常量是 Production 模块内 scope 的唯一事实来源，被以下位置共同引用：
 *  - `ProductionService.createBatch`（application 接线）；
 *  - `production-batch-result.codec.ts`（结果结构与 scope 冻结在同一契约版本）；
 *  - 后端单元测试与 MySQL 集成测试。
 *
 * 不放入前后端共享的 `packages/constants`：前端只使用本地意图名（`intentType`，见
 * `useIdempotentIntent.ts`），该值若进入共享包会被误认为需要传输的协议字段。
 *
 * 未来发生不兼容变更时，必须 bump 为新 scope（`production.batch.create.v2`）并引入新 codec，
 * 通过临时服务端兼容窗口过渡（见 docs/http-idempotency-implementation-plan.md §13），
 * 不允许用新 schema 去猜旧记录。
 */
export const CREATE_BATCH_IDEMPOTENCY_SCOPE = 'production.batch.create.v1' as const;
