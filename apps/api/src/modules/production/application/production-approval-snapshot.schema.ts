import { z } from 'zod';
import {
  DEMAND_TYPES,
  DEMAND_BUSINESS_STATUSES,
  DEMAND_CLOSE_CAUSES,
  DEMAND_CORRECTION_KINDS,
  PRODUCTION_BATCH_STATUSES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
  BATCH_CLOSEOUT_ITEM_KINDS,
} from '@company/constants';

const id = z.string().regex(/^[1-9]\d*$/);
const quantity = z.string().regex(/^\d+(\.0+)?$/);
const version = z.number().int().nonnegative();
const amount = z.number().int().min(0).max(99_999_999);
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
  parentDemandId: id.nullable(),
  manualAdditionId: id.nullable(),
  supplementId: id.nullable(),
  supplementNo: z.string().nullable(),
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
  authorizations: z.array(z.object({ id, quantity, stepName: z.string() })),
  supplementRequirements: z.array(
    z.object({
      demandId: id,
      replacesDemandId: id.nullable(),
      demandQuantity: quantity,
      remainingQuantity: quantity,
      outboundQuantity: quantity,
      businessStatus: z.enum(DEMAND_BUSINESS_STATUSES),
      closeCause: z.enum(DEMAND_CLOSE_CAUSES).nullable(),
      itemCode: z.string(),
      materialVariantCode: z.string(),
      unit: z.string(),
      pendingCorrectionId: id.nullable(),
    }),
  ),
  originalPlan: z.array(z.object({ planId: id, originalDemandId: id, plannedQuantity: quantity })),
  zeroRemainderImpact: z
    .object({
      fulfillsSupplement: z.boolean(),
      blockingDemandIds: z.array(id),
      hasConfirmedIssue: z.boolean(),
      reopenedSteps: z.array(
        z.object({ stepId: id, stepName: z.string(), requiredNormalQuantity: quantity }),
      ),
    })
    .nullable(),
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
export const closeoutActionSchema = z.object({
  id,
  kind: z.enum(BATCH_CLOSEOUT_ITEM_KINDS),
  targetId: id,
  label: z.string(),
  previousStatus: z.string(),
  resultingStatus: z.string(),
  quantity: quantity.nullable(),
  unit: z.string().nullable(),
  reason: z.string(),
  actorId: id,
  createdAt: z.string(),
});
export const closeoutOutputSchema = z.object({
  availableQuantity: amount,
  additionalScrapQuantity: amount,
  reason: z.string(),
  materialReviewNote: z.string(),
});
export const terminationCheckSchema = z.object({
  batchId: id,
  batchNo: z.string(),
  batchStatus: z.enum(PRODUCTION_BATCH_STATUSES),
  workOrderId: id,
  workOrderNo: z.string(),
  orderType: z.enum(WORK_ORDER_TYPES),
  workOrderStatus: z.enum(WORK_ORDER_STATUSES),
  productCode: z.string(),
  productName: z.string(),
  unit: z.string(),
  plannedQuantity: quantity,
  reportedNormalQuantity: quantity,
  existingScrapQuantity: quantity,
  version,
  checkToken: z.string(),
  canTerminate: z.boolean(),
  blockers: z.array(z.string()),
  impacts: z.array(
    z.object({
      kind: z.enum([
        'step',
        'abnormal',
        'rework',
        'supplement',
        'outbound',
        'demand',
        'allocation',
      ]),
      id,
      label: z.string(),
      quantity: quantity.nullable(),
      unit: z.string().nullable(),
      status: z.string(),
      version,
    }),
  ),
  materials: z.array(
    z.object({
      allocationId: id,
      inventoryBatchCode: z.string(),
      itemCode: z.string(),
      materialVariantCode: z.string(),
      unit: z.string(),
      assignedQuantity: quantity,
      outboundQuantity: quantity,
      returnQuantity: quantity,
      lossQuantity: quantity,
      returnableQuantity: quantity,
    }),
  ),
  termination: z
    .object({
      id,
      availableQuantity: quantity,
      additionalScrapQuantity: quantity,
      existingScrapQuantity: quantity,
      reason: z.string(),
      materialReviewNote: z.string(),
      createdBy: id,
      createdAt: z.string(),
    })
    .nullable(),
});
export const closeoutSnapshotSchema = z.object({
  kind: z.literal('batch_closeout'),
  closeoutId: id,
  check: terminationCheckSchema,
  output: closeoutOutputSchema,
  actions: z.array(closeoutActionSchema),
});
