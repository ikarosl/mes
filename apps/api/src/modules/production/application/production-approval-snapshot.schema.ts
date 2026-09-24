import { z } from 'zod';
import type { BatchCloseoutApprovalSnapshot } from '@company/contracts';
import { ProductionDomainError } from '../domain/production.errors.js';
import { evaluateOutputInspection } from '../../quality/public.js';
import {
  APPROVAL_ASSIGNEE_SOURCES,
  DEMAND_TYPES,
  DEMAND_BUSINESS_STATUSES,
  DEMAND_CLOSE_CAUSES,
  DEMAND_CORRECTION_KINDS,
  PRODUCTION_BATCH_STATUSES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
  BATCH_CLOSEOUT_ITEM_KINDS,
  PRODUCTION_CLOSEOUT_MODES,
  PRODUCTION_OUTPUT_INSPECTION_METHODS,
  PRODUCTION_OUTPUT_RELEASE_DECISIONS,
  MATERIAL_LOSS_PURPOSES,
  SCRAP_STATUSES,
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
  extraQuantity: amount,
  inspectionRecordId: id.nullable(),
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
  lossRecords: z.array(
    z.object({
      id,
      scrapNo: z.string(),
      purpose: z.enum(MATERIAL_LOSS_PURPOSES),
      closeoutId: id.nullable(),
      allocationId: id,
      demandId: id,
      itemCode: z.string(),
      materialVariantCode: z.string(),
      inventoryBatchCode: z.string(),
      scrapQuantity: quantity,
      unit: z.string(),
      reason: z.string(),
      status: z.enum(SCRAP_STATUSES),
      createdBy: id,
      createdAt: z.string(),
      confirmedBy: id.nullable(),
      confirmedAt: z.string().nullable(),
    }),
  ),
  termination: z
    .object({
      id,
      revisionNo: z.number().int().positive(),
      approvalInstanceId: id,
      extraQuantity: quantity,
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
export const CLOSEOUT_APPROVAL_SNAPSHOT_SCHEMA_VERSION = 6;
const outputQuantitiesSchema = z.object({
  availableQuantity: amount,
  extraQuantity: amount,
  additionalScrapQuantity: amount,
});
const outputInspectionSchema = z
  .object({
    id,
    closeoutId: id,
    batchId: id,
    declaredVersion: version,
    declared: outputQuantitiesSchema,
    inspectionMethod: z.enum(PRODUCTION_OUTPUT_INSPECTION_METHODS),
    coveredQuantity: amount,
    inspectedQuantity: amount,
    unqualifiedQuantity: amount,
    releaseDecision: z.enum(PRODUCTION_OUTPUT_RELEASE_DECISIONS),
    qualifiedQuantity: amount,
    releasedQuantity: amount,
    inspectedAt: z.string(),
    resultNote: z.string(),
    evidenceReference: z.string(),
    previousInspectionId: id.nullable(),
    createdBy: id,
    createdByName: z.string(),
    createdAt: z.string(),
  })
  .strict()
  .superRefine((inspection, context) => {
    try {
      const quantities = evaluateOutputInspection(inspection);
      if (
        quantities.qualifiedQuantity !== inspection.qualifiedQuantity ||
        quantities.releasedQuantity !== inspection.releasedQuantity
      )
        context.addIssue({ code: 'custom', message: '检验合格数或放行量与事实不一致' });
    } catch {
      context.addIssue({ code: 'custom', message: '检验方式、实际送检总数或实检数量无效' });
    }
  });
const closeoutSnapshotBaseSchema = z.object({
  kind: z.literal('batch_closeout'),
  mode: z.enum(PRODUCTION_CLOSEOUT_MODES),
  previousRevisionId: id.nullable(),
  correctionReason: z.string().nullable(),
  inspection: outputInspectionSchema,
  closeoutId: id,
  check: terminationCheckSchema,
  output: closeoutOutputSchema,
  actions: z.array(closeoutActionSchema),
});
export const closeoutSnapshotSchema = closeoutSnapshotBaseSchema
  .extend({
    workOrderOwnerEvidence: z.object({
      sourceCode: z.literal(APPROVAL_ASSIGNEE_SOURCES.workOrderOwner),
      workOrderId: id,
      workOrderNo: z.string(),
      workOrderVersion: version,
      ownerId: id,
    }),
  })
  .refine(
    (snapshot) =>
      snapshot.workOrderOwnerEvidence.workOrderId === snapshot.check.workOrderId &&
      snapshot.workOrderOwnerEvidence.workOrderNo === snapshot.check.workOrderNo,
    { message: '工单负责人来源与收尾任务所属工单不一致' },
  )
  .refine(
    (snapshot) =>
      snapshot.inspection.closeoutId === snapshot.closeoutId &&
      snapshot.inspection.batchId === snapshot.check.batchId &&
      snapshot.inspection.id === snapshot.output.inspectionRecordId,
    { message: '检验记录与任务清单不一致' },
  )
  .refine(
    // 历史证据保持可读；新送审和最终批准由 loadOutputState 明确要求 released。
    // 检验派生数量仅供清单核对，不限制正式数量或历史已入数量。
    (snapshot) => snapshot.inspection.releaseDecision !== 'pending_reinspection',
    { message: '检验尚未完成' },
  )
  .refine(
    (snapshot) => snapshot.output.availableQuantity <= Number(snapshot.check.plannedQuantity),
    { message: '计划内产出超过计划量' },
  );

/** 只接受当前完整受审结构，不根据当前工单补造缺失的来源证据。 */
export function readCloseoutApprovalSnapshot(
  snapshot: unknown,
  schemaVersion: number,
): BatchCloseoutApprovalSnapshot {
  if (schemaVersion === CLOSEOUT_APPROVAL_SNAPSHOT_SCHEMA_VERSION) {
    const parsed = closeoutSnapshotSchema.safeParse(snapshot);
    if (parsed.success) return parsed.data;
  }
  throw new ProductionDomainError('INVALID_STATE', '批次收尾审批证据结构无法读取');
}
