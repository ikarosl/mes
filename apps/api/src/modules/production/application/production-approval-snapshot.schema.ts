import { z } from 'zod';
import {
  DEMAND_TYPES,
  DEMAND_BUSINESS_STATUSES,
  DEMAND_CLOSE_CAUSES,
  DEMAND_CORRECTION_KINDS,
} from '@company/constants';

const id = z.string().regex(/^[1-9]\d*$/);
const quantity = z.string().regex(/^\d+(\.0+)?$/);
const version = z.number().int().nonnegative();
const amount = z.number().int().min(0).max(99_999_999);
export const DEMAND_CORRECTION_APPROVAL_SNAPSHOT_SCHEMA_VERSION = 3;
export const demandCorrectionCheckSchema = z.object({
  demandId: id,
  batchId: id,
  batchNo: z.string(),
  workOrderNo: z.string(),
  materialId: id,
  itemCode: z.string(),
  materialVariantCode: z.string(),
  unit: z.string(),
  demandType: z.enum(DEMAND_TYPES),
  manualAdditionId: id.nullable(),
  sourceReason: z.string().nullable(),
  version,
  currentTotalQuantity: quantity,
  issuedQuantity: quantity,
  oldRemainingQuantity: quantity,
  pendingCorrectionId: id.nullable(),
  chain: z.array(
    z.object({
      demandId: id,
      replacesDemandId: id.nullable(),
      demandQuantity: quantity,
      remainingQuantity: quantity,
      outboundQuantity: quantity,
      businessStatus: z.enum(DEMAND_BUSINESS_STATUSES),
      closeCause: z.enum(DEMAND_CLOSE_CAUSES).nullable(),
    }),
  ),
  reservations: z.array(
    z.object({ allocationId: id, inventoryBatchCode: z.string(), quantity, version }),
  ),
  pendingOutboundNos: z.array(z.string()),
  blockers: z.array(z.string()),
  canCorrect: z.boolean(),
  checkToken: z.string().regex(/^[a-f0-9]{64}$/),
});
export const demandCorrectionSnapshotSchema = z.object({
  kind: z.literal('demand_correction'),
  correctionId: id,
  check: demandCorrectionCheckSchema,
  correctionKind: z.enum(DEMAND_CORRECTION_KINDS),
  targetTotalQuantity: amount,
  newRemainingQuantity: amount,
  reason: z.string(),
});
