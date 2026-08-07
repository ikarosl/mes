import { z } from 'zod';
import { BATCH_STEP_STATUSES, PRODUCTION_BATCH_STATUSES } from '@company/constants';
import type { BatchStepRecordItem, ProductionBatchDetail } from '@company/contracts';
import type {
  IdempotencyResultCodec,
  JsonValue,
} from '../../../../common/idempotency/idempotency-executor.js';
import { CREATE_BATCH_IDEMPOTENCY_SCOPE } from './create-batch-idempotency.contract.js';

/**
 * createBatch 幂等试点结果 codec（scope `production.batch.create.v1`）。
 *
 * v1 契约冻结：请求指纹规则、成功结果结构、本 Zod schema 三者在 scope v1 上线后不再演进；结果形状一旦
 * 变更必须 bump scope（`production.batch.create.v2`）并引入新 codec，v1 记录永远只由本 schema 解析，
 * 形状不符即走 corrupt，不允许用新 schema 去猜旧记录。
 *
 * encode 与 decode 都做完整嵌套运行时校验，不使用 `coerce`/`preprocess`、不做隐式类型转换，结构错误一律
 * 拒绝：
 *  - 首次执行返回结果结构错误 → 保存前抛错，整个事务回滚，不落 completed 记录；
 *  - 重放记录结构损坏 → decode 抛错，executor 走 corrupt 路径（500 + 告警），绝不伪造 200 或重跑 handler。
 */
const nullableString = z.string().nullable();

const batchStepRecordSchema: z.ZodType<BatchStepRecordItem> = z
  .object({
    id: z.string(),
    productionBatchId: z.string(),
    routeStepId: z.string(),
    stepOrder: z.number().int(),
    stepCode: z.string(),
    stepName: z.string(),

    defaultSopFileId: nullableString,
    defaultSopFileName: nullableString,
    defaultSopVersionNo: nullableString,

    actualSopFileId: nullableString,
    actualSopFileName: nullableString,
    actualSopVersionNo: nullableString,

    defaultResponsibleUserId: nullableString,
    defaultResponsibleUserName: nullableString,
    responsibleUserId: nullableString,
    responsibleUserName: nullableString,

    needRecord: z.boolean(),
    needInspection: z.boolean(),
    status: z.enum(BATCH_STEP_STATUSES),

    startedAt: nullableString,
    completedAt: nullableString,

    outputQuantity: z.string(),
    qualifiedQuantity: z.string(),
    abnormalQuantity: z.string(),
    reworkQuantity: z.string(),

    unit: z.string(),
    remark: nullableString,
    version: z.number().int().nonnegative(),
  })
  .strict();

export const productionBatchDetailSchema: z.ZodType<ProductionBatchDetail> = z
  .object({
    id: z.string(),
    workOrderId: z.string(),
    workOrderNo: z.string(),
    productId: z.string(),
    productCode: z.string(),
    productName: z.string(),
    batchNo: z.string(),

    routeId: nullableString,
    routeCode: nullableString,
    routeVersion: nullableString,

    plannedQuantity: z.string(),
    completedQuantity: z.string(),
    qualifiedQuantity: z.string(),

    planStartDate: nullableString,
    planEndDate: nullableString,
    startedAt: nullableString,

    status: z.enum(PRODUCTION_BATCH_STATUSES),

    ownerId: nullableString,
    ownerName: nullableString,
    completedAt: nullableString,
    completedBy: nullableString,
    remark: nullableString,

    version: z.number().int().nonnegative(),
    createdAt: z.string(),
    updatedAt: z.string(),

    stepRecords: z.array(batchStepRecordSchema),
  })
  .strict();

/**
 * 幂等结果 codec：encode/decode 都经 `productionBatchDetailSchema` 完整校验。
 * 校验失败抛 ZodError，由 executor 统一映射为 corrupt（见 http-idempotency-implementation-plan.md §5/§8）。
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
    return productionBatchDetailSchema.parse(stored);
  },
};
