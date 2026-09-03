import { z } from 'zod';
import {
  ALLOCATION_STATUSES,
  DEMAND_GENERATION_GROUP_TYPES,
  OUTBOUND_ORDER_STATUSES,
  PRODUCTION_BATCH_STATUSES,
} from '@company/constants';
import type {
  MaterialAllocationCommandResult,
  MaterialOutboundCommandResult,
  ProductionMaterialAllocationItem,
} from '@company/contracts';
import type {
  IdempotencyResultCodec,
  JsonValue,
} from '../../../../common/idempotency/idempotency-executor.js';
import { CREATE_MATERIAL_ALLOCATION_IDEMPOTENCY_SCOPE } from './production-idempotency-scopes.contract.js';
import { CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE } from './production-idempotency-scopes.contract.js';
import { CONFIRM_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE } from './production-idempotency-scopes.contract.js';

const nullableString = z.string().nullable();
const allocationSchema: z.ZodType<ProductionMaterialAllocationItem> = z
  .object({
    allocationId: z.string(),
    demandId: z.string(),
    productionBatchId: z.string(),
    itemId: z.string(),
    itemBatchId: z.string(),
    batchCode: z.string(),
    assignedQuantity: z.string(),
    outboundQuantity: z.string(),
    pendingOutboundQuantity: z.string(),
    availableToOrderQuantity: z.string(),
    remainingOutboundQuantity: z.string(),
    unit: z.string(),
    allocationStatus: z.enum(ALLOCATION_STATUSES),
    version: z.number().int().nonnegative(),
    remark: nullableString,
    createdAt: z.string(),
  })
  .strict();

const allocationResultSchema: z.ZodType<MaterialAllocationCommandResult> = z
  .object({
    productionBatchId: z.string(),
    batchStatus: z.enum(PRODUCTION_BATCH_STATUSES),
    batchVersion: z.number().int().nonnegative(),
    allocations: z.array(allocationSchema),
  })
  .strict();

const outboundDetailSchema = z
  .object({
    id: z.string(),
    allocationId: z.string(),
    demandId: z.string(),
    itemId: z.string(),
    itemBatchId: z.string(),
    batchCode: z.string(),
    itemCode: z.string(),
    itemName: z.string(),
    generationGroupKey: z.string(),
    generationGroupType: z.enum(DEMAND_GENERATION_GROUP_TYPES),
    supplementNo: nullableString,
    outboundQuantity: z.string(),
    unit: z.string(),
    inventoryTransactionId: nullableString,
  })
  .strict();
const outboundSchema = z
  .object({
    outboundId: z.string(),
    outboundNo: z.string(),
    productionBatchId: z.string(),
    batchNo: z.string(),
    workOrderId: z.string(),
    shortBatchAuthorizationId: nullableString.optional(),
    workOrderNo: z.string(),
    productId: z.string(),
    productCode: z.string(),
    productName: z.string(),
    status: z.enum(OUTBOUND_ORDER_STATUSES),
    outboundAt: nullableString,
    operatorId: nullableString,
    operatorName: nullableString,
    createdById: nullableString,
    createdByName: nullableString,
    createdAt: z.string(),
    version: z.number().int().nonnegative(),
    remark: nullableString,
    cancelSource: z.enum(['manual', 'production_batch']).nullable().optional(),
    cancelReason: nullableString.optional(),
    cancelledById: nullableString.optional(),
    cancelledByName: nullableString.optional(),
    cancelledAt: nullableString.optional(),
    quantitySummary: z.array(z.object({ unit: z.string(), quantity: z.string() }).strict()),
    details: z.array(outboundDetailSchema),
  })
  .strict();
const outboundResultSchema: z.ZodType<MaterialOutboundCommandResult> = z
  .object({
    productionBatchId: z.string(),
    batchStatus: z.enum(PRODUCTION_BATCH_STATUSES),
    batchVersion: z.number().int().nonnegative(),
    outbound: outboundSchema,
  })
  .strict();

const codec = <T>(schema: z.ZodType<T>): IdempotencyResultCodec<T> => ({
  encode: (result) => schema.parse(result) as unknown as JsonValue,
  decode: (stored) => schema.parse(stored),
});

export const materialAllocationResultCodec = {
  ...codec(allocationResultSchema),
  scope: CREATE_MATERIAL_ALLOCATION_IDEMPOTENCY_SCOPE,
} as const;
export const materialOutboundResultCodec = {
  ...codec(outboundResultSchema),
  scope: CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE,
} as const;
export const confirmMaterialOutboundResultCodec = {
  ...codec(outboundResultSchema),
  scope: CONFIRM_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE,
} as const;
