import { z } from 'zod';
import {
  ALLOCATION_STATUSES,
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
import { CREATE_MATERIAL_ALLOCATION_IDEMPOTENCY_SCOPE } from './create-material-allocation-idempotency.contract.js';
import { CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE } from './create-material-outbound-idempotency.contract.js';

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
    outboundQuantity: z.string(),
    unit: z.string(),
  })
  .strict();
const outboundSchema = z
  .object({
    outboundId: z.string(),
    outboundNo: z.string(),
    productionBatchId: z.string(),
    status: z.enum(OUTBOUND_ORDER_STATUSES),
    outboundAt: z.string(),
    operatorId: z.string(),
    operatorName: nullableString,
    remark: nullableString,
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
