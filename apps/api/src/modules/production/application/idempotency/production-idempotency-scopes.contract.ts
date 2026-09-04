/**
 * Production 模块 HTTP 幂等 scope 统一契约。
 *
 * scope 由服务端唯一控制：客户端只发送 `Idempotency-Key`，不传输、不协商 scope，也不能决定服务端
 * 的存储命名空间。这些常量是 Production 模块内 scope 的唯一事实来源，被以下位置共同引用：
 *  - application service（executor 接线）；
 *  - presentation controller（@IdempotentEndpoint 声明）；
 *  - 各结果 codec（结果结构与 scope 冻结在同一契约版本）；
 *  - 后端单元测试与 MySQL 集成测试。
 *
 * 不放入前后端共享的 `packages/constants`：前端只使用本地意图名（`intentType`，见
 * `useIdempotentIntent.ts`），该值若进入共享包会被误认为需要传输的协议字段。
 *
 * 未来发生不兼容变更时必须继续 bump scope 并引入新 codec，通过临时服务端兼容窗口过渡
 * （见 apps/api/docs/idempotency.md §13），不允许用新 schema 去猜旧记录。
 */

/** createBatch 创建生产批次；scope 与当前请求及结果 codec 绑定。 */
export const CREATE_BATCH_IDEMPOTENCY_SCOPE = 'production.batch.create.v4' as const;
/** 创建物料分配。 */
export const CREATE_MATERIAL_ALLOCATION_IDEMPOTENCY_SCOPE =
  'production.material-allocation.create.v1' as const;
/** 创建生产领料出库单。 */
export const CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE =
  'production.material-outbound.create.v3' as const;
/** 确认生产领料出库单。 */
export const CONFIRM_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE =
  'production.material-outbound.confirm.v2' as const;
/** 管理员确认基础 BOM 明细的精确版本需求。 */
export const CONFIGURE_MATERIAL_DEMANDS_IDEMPOTENCY_SCOPE =
  'production.material-demands.configure.v1' as const;
/** 创建人工追加物料需求。 */
export const ADD_MANUAL_MATERIAL_DEMAND_IDEMPOTENCY_SCOPE =
  'production.material-demands.add-manual.v1' as const;
/** 创建外购物料入库单。 */
export const CREATE_PURCHASE_INBOUND_IDEMPOTENCY_SCOPE =
  'production.purchase-inbound.create.v1' as const;
/** 确认外购物料入库单。 */
export const CONFIRM_PURCHASE_INBOUND_IDEMPOTENCY_SCOPE =
  'production.purchase-inbound.confirm.v1' as const;
/** 创建工序报工。 */
export const CREATE_STEP_REPORT_IDEMPOTENCY_SCOPE = 'production.step-report.create.v3' as const;
/** 管理员更正工序报工。 */
export const CORRECT_STEP_REPORT_IDEMPOTENCY_SCOPE = 'production.step-report.correct.v3' as const;
/** 返工整单完成。 */
export const COMPLETE_REWORK_IDEMPOTENCY_SCOPE = 'production.rework.complete.v1' as const;
/** 异常报废补料方案确认并生成正式闭环事实。 */
export const CONFIRM_SCRAP_SUPPLEMENT_PLAN_IDEMPOTENCY_SCOPE =
  'production.abnormal.scrap-supplement-plan.confirm.v1' as const;
/** 创建生产领料损耗补料。 */
export const CREATE_MATERIAL_LOSS_IDEMPOTENCY_SCOPE = 'production.material-loss.create.v1' as const;
/** 确认生产领料损耗补料。 */
export const CONFIRM_MATERIAL_LOSS_IDEMPOTENCY_SCOPE =
  'production.material-loss.confirm.v1' as const;
