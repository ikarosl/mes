import { z } from 'zod';
import { WORK_ORDER_TYPES, PRODUCTION_BATCH_STATUSES } from '@company/constants';
import type { ProductionBatchDetail } from '@company/contracts';
import type {
  IdempotencyResultCodec,
  JsonValue,
} from '../../../../common/idempotency/idempotency-executor.js';
import {
  CREATE_BATCH_IDEMPOTENCY_SCOPE,
  RELEASE_BATCH_IDEMPOTENCY_SCOPE,
} from './production-idempotency-scopes.contract.js';

/**
 * createBatch 幂等结果 codec，scope 与当前请求及结果结构绑定。
 *
 * decode 分别严格识别当前结构和带历史刻码开关的完整旧结构，只剔除退出的响应字段，
 * 不读取当前任务或猜造历史刻码；其他形状不符仍走 corrupt。
 *
 * encode 与 decode 都做完整嵌套运行时校验，不使用 `coerce`/`preprocess`、不做隐式类型转换，结构错误一律
 * 拒绝：
 *  - 首次执行返回结果结构错误 → 保存前抛错，整个事务回滚，不落 completed 记录；
 *  - 重放记录结构损坏 → decode 抛错，executor 走 corrupt 路径（500 + 告警），绝不伪造 200 或重跑 handler。
 */
const nullableString = z.string().nullable();

export const productionBatchDetailSchema = z
  .object({
    id: z.string(),
    workOrderId: z.string(),
    workOrderNo: z.string(),
    orderType: z.enum(WORK_ORDER_TYPES),
    productId: z.string(),
    productCode: z.string(),
    productName: z.string(),
    batchNo: z.string(),

    routeId: nullableString,
    routeCode: nullableString,
    routeVersion: nullableString,

    plannedQuantity: z.string(),

    planStartDate: nullableString,
    planEndDate: nullableString,
    startedAt: nullableString,
    startedById: nullableString,
    startedByName: nullableString,

    status: z.enum(PRODUCTION_BATCH_STATUSES),
    finalOutput: z
      .object({
        availableQuantity: z.string(),
        confirmedOutputCount: z.number().int().nonnegative(),
        inboundQuantity: z.string(),
        pendingInboundQuantity: z.string(),
      })
      .strict(),
    finishReason: nullableString,
    finishMode: z.enum(['normal', 'early']).nullable(),
    ownerId: nullableString,
    ownerName: nullableString,
    completedAt: nullableString,
    completedBy: nullableString,
    cancelReason: nullableString,
    cancelledBy: nullableString,
    cancelledByName: nullableString,
    cancelledAt: nullableString,
    remark: nullableString,

    version: z.number().int().nonnegative(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

const compatibleProductionBatchDetailSchema = z.union([
  productionBatchDetailSchema,
  productionBatchDetailSchema
    .extend({ requiresItemMarking: z.boolean() })
    .transform(({ requiresItemMarking: _legacyRequiresItemMarking, ...value }) => value),
]);

/**
 * 幂等结果 codec：encode 严格校验新结构，decode 完整校验新／旧明确结构。
 * 校验失败抛 ZodError，由 executor 统一映射为 corrupt（见 idempotency.md §5/§8）。
 * `scope` 字段与执行契约共用同一常量：结果结构与 scope 冻结在同一契约版本，形状变更必须 bump scope。
 */
export const productionBatchResultCodec: IdempotencyResultCodec<ProductionBatchDetail> & {
  readonly scope: typeof CREATE_BATCH_IDEMPOTENCY_SCOPE;
} = {
  scope: CREATE_BATCH_IDEMPOTENCY_SCOPE,
  encode(result) {
    const parsed = productionBatchDetailSchema.parse(result);
    // 结构已由 schema 校验且全部字段为 JSON-safe；断言为 JsonValue 后仍由 executor 的
    // assertJsonValue 做写入前运行时兜底。
    return parsed as unknown as JsonValue;
  },
  decode(stored) {
    return compatibleProductionBatchDetailSchema.parse(stored);
  },
};

export const productionBatchReleaseResultCodec: IdempotencyResultCodec<ProductionBatchDetail> & {
  readonly scope: typeof RELEASE_BATCH_IDEMPOTENCY_SCOPE;
} = {
  scope: RELEASE_BATCH_IDEMPOTENCY_SCOPE,
  encode: productionBatchResultCodec.encode,
  decode: productionBatchResultCodec.decode,
};
