import { z } from 'zod';
import type { MaterialLossItem } from '@company/contracts';
import type {
  IdempotencyResultCodec,
  JsonValue,
} from '../../../../common/idempotency/idempotency-executor.js';
import { CONFIRM_MATERIAL_LOSS_IDEMPOTENCY_SCOPE } from './production-idempotency-scopes.contract.js';
import { CREATE_MATERIAL_LOSS_IDEMPOTENCY_SCOPE } from './production-idempotency-scopes.contract.js';

const schema: z.ZodType<MaterialLossItem> = z
  .object({
    id: z.string(),
    scrapNo: z.string(),
    productionBatchId: z.string(),
    batchNo: z.string(),
    workOrderId: z.string(),
    workOrderNo: z.string(),
    productCode: z.string(),
    productName: z.string(),
    allocationId: z.string(),
    demandId: z.string(),
    itemId: z.string(),
    materialVariantId: z.string(),
    materialVariantCode: z.string(),
    itemCode: z.string(),
    itemName: z.string(),
    itemBatchId: z.string(),
    batchCode: z.string(),
    scrapScene: z.literal('production_consumed'),
    scrapQuantity: z.string(),
    unit: z.string(),
    reasonType: z.string(),
    status: z.enum(['pending', 'confirmed', 'cancelled']),
    confirmedById: z.string().nullable(),
    confirmedByName: z.string().nullable(),
    confirmedAt: z.string().nullable(),
    createdById: z.string(),
    createdByName: z.string().nullable(),
    createdAt: z.string(),
    version: z.number().int().nonnegative(),
    remark: z.string().nullable(),
    cancelReason: z.string().nullable().optional(),
    cancelledById: z.string().nullable().optional(),
    cancelledByName: z.string().nullable().optional(),
    cancelledAt: z.string().nullable().optional(),
    supplement: z
      .object({
        supplementId: z.string(),
        supplementNo: z.string(),
        status: z.enum(['approved', 'fulfilled']),
        demandId: z.string(),
        demandQuantity: z.string(),
      })
      .strict()
      .nullable(),
  })
  .strict();

const codec: IdempotencyResultCodec<MaterialLossItem> = {
  encode: (value) => schema.parse(value) as unknown as JsonValue,
  decode: (value) => schema.parse(value),
};

export const createMaterialLossResultCodec = {
  ...codec,
  scope: CREATE_MATERIAL_LOSS_IDEMPOTENCY_SCOPE,
} as const;

export const confirmMaterialLossResultCodec = {
  ...codec,
  scope: CONFIRM_MATERIAL_LOSS_IDEMPOTENCY_SCOPE,
} as const;
