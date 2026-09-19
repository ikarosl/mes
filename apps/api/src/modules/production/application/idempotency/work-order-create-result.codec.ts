import { z } from 'zod';
import { WORK_ORDER_TYPES, WORK_ORDER_STATUSES } from '@company/constants';
import type { WorkOrderDetail } from '@company/contracts';
import type {
  IdempotencyResultCodec,
  JsonValue,
} from '../../../../common/idempotency/idempotency-executor.js';
import { CREATE_WORK_ORDER_IDEMPOTENCY_SCOPE } from './production-idempotency-scopes.contract.js';

const nullableString = z.string().nullable();
const researchOrderReferenceSchema = z
  .object({
    id: z.string(),
    workOrderNo: z.string(),
    productId: z.string(),
    productCode: z.string(),
    productName: z.string(),
    status: z.enum(WORK_ORDER_STATUSES),
  })
  .strict();
/** 创建响应快照固定为草稿、无批次；重试不重新查询后续被编辑或下达的工单。 */
const createdWorkOrderSchema: z.ZodType<WorkOrderDetail> = z
  .object({
    id: z.string(),
    workOrderNo: z.string().regex(/^\d{4}-\d{2}-\d{2}-[1-9]\d*$/),
    orderType: z.enum(WORK_ORDER_TYPES),
    previousResearchOrderId: nullableString,
    productId: z.string(),
    productCode: z.string(),
    productName: z.string(),
    unit: z.string(),
    plannedQuantity: z.string(),
    customerName: nullableString,
    qualityLevel: nullableString,
    workOrderOwnerId: nullableString,
    planStartDate: z.string(),
    planEndDate: z.string(),
    assignedQuantity: z.string(),
    terminatedPlannedQuantity: z.string(),
    status: z.literal('draft'),
    releasedAt: z.null(),
    cancelReason: z.null(),
    cancelledBy: z.null(),
    cancelledByName: z.null(),
    cancelledAt: z.null(),
    closeType: z.null(),
    closeReason: z.null(),
    closedBy: z.null(),
    closedByName: z.null(),
    closedAt: z.null(),
    externalOrderNo: nullableString,
    remark: nullableString,
    version: z.literal(0),
    createdAt: z.string(),
    updatedAt: z.string(),
    batches: z.array(z.never()),
    previousResearchOrder: researchOrderReferenceSchema.nullable(),
    nextResearchOrders: z.array(z.never()),
    finalOutput: z
      .object({
        availableQuantity: z.string(),
        extraQuantity: z.string(),
        scrapQuantity: z.string(),
        totalQuantity: z.string(),
        plannedShortfallQuantity: z.string(),
        finalizedBatchCount: z.number().int().nonnegative(),
        closingBatchCount: z.number().int().nonnegative(),
        pendingAvailableQuantity: z.string(),
        pendingExtraQuantity: z.string(),
      })
      .strict(),
  })
  .strict();

export const workOrderCreateResultCodec: IdempotencyResultCodec<WorkOrderDetail> & {
  readonly scope: typeof CREATE_WORK_ORDER_IDEMPOTENCY_SCOPE;
} = {
  scope: CREATE_WORK_ORDER_IDEMPOTENCY_SCOPE,
  encode: (result) => createdWorkOrderSchema.parse(result) as unknown as JsonValue,
  decode: (stored) => createdWorkOrderSchema.parse(stored),
};
