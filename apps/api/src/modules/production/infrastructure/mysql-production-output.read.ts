import type { InventoryInboundCommand } from '../../inventory/public.js';
import { createHash } from 'node:crypto';
import { APPROVAL_ASSIGNEE_SOURCES } from '@company/constants';
import { ProductionDomainError } from '../domain/production.errors.js';
import type {
  BatchCloseoutApprovalSnapshot,
  BatchCloseoutAction,
  ProductionOutputDetail,
  ProductionOutputQuantities,
} from '@company/contracts';
import type { MysqlProductionCloseoutRepository } from './mysql-production-closeout.repository.js';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { ProductionOutputInspection, ProductionOutputRevision } from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import {
  readCloseoutApprovalSnapshot,
  CLOSEOUT_APPROVAL_SNAPSHOT_SCHEMA_VERSION,
} from '../application/production-approval-snapshot.schema.js';
import {
  nullableOutputId,
  outputJson,
  draftOf,
  type CloseoutRow,
} from './mysql-production-output.persistence.js';

type InspectionRow = RowDataPacket & {
  id: number;
  closeout_id: number;
  production_batch_id: number;
  declared_version: number;
  declared_available_quantity: string;
  declared_extra_quantity: string;
  declared_scrap_quantity: string;
  available_quantity: string;
  extra_quantity: string;
  additional_scrap_quantity: string;
  inspected_at: Date;
  result_note: string;
  evidence_reference: string;
  previous_inspection_id: number | null;
  created_by: number;
  created_at: Date;
};
type RevisionRow = RowDataPacket & {
  id: number;
  closeout_id: number;
  production_batch_id: number;
  revision_no: number;
  previous_revision_id: number | null;
  approval_instance_id: number;
  inspection_record_id: number;
  planned_quantity: string;
  available_quantity: string;
  extra_quantity: string;
  additional_scrap_quantity: string;
  existing_scrap_quantity: string;
  correction_reason: string | null;
  review_snapshot: object | string;
  created_by: number;
  created_at: Date;
};
export async function readOutputInspections(
  db: PoolConnection,
  closeoutId: number,
  lock: boolean,
): Promise<ProductionOutputInspection[]> {
  const [rows] = await db.query<InspectionRow[]>(
    `SELECT * FROM production_output_inspection WHERE closeout_id=? ORDER BY id${lock ? ' FOR SHARE' : ''}`,
    [closeoutId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    closeoutId: String(row.closeout_id),
    batchId: String(row.production_batch_id),
    declaredVersion: row.declared_version,
    declared: {
      availableQuantity: Number(row.declared_available_quantity),
      extraQuantity: Number(row.declared_extra_quantity),
      additionalScrapQuantity: Number(row.declared_scrap_quantity),
    },
    inspected: {
      availableQuantity: Number(row.available_quantity),
      extraQuantity: Number(row.extra_quantity),
      additionalScrapQuantity: Number(row.additional_scrap_quantity),
    },
    inspectedAt: toBeijingISOString(row.inspected_at),
    resultNote: row.result_note,
    evidenceReference: row.evidence_reference,
    previousInspectionId: nullableOutputId(row.previous_inspection_id),
    createdBy: String(row.created_by),
    createdByName: String(row.created_by),
    createdAt: toBeijingISOString(row.created_at),
  }));
}
export async function readOutputRevisions(
  db: PoolConnection,
  closeoutId: number,
  lock: boolean,
): Promise<ProductionOutputRevision[]> {
  const [rows] = await db.query<RevisionRow[]>(
    `SELECT * FROM production_output_revision WHERE closeout_id=? ORDER BY revision_no${lock ? ' FOR SHARE' : ''}`,
    [closeoutId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    closeoutId: String(row.closeout_id),
    batchId: String(row.production_batch_id),
    revisionNo: row.revision_no,
    previousRevisionId: nullableOutputId(row.previous_revision_id),
    approvalInstanceId: String(row.approval_instance_id),
    inspectionRecordId: String(row.inspection_record_id),
    plannedQuantity: String(row.planned_quantity),
    availableQuantity: String(row.available_quantity),
    extraQuantity: String(row.extra_quantity),
    additionalScrapQuantity: String(row.additional_scrap_quantity),
    existingScrapQuantity: String(row.existing_scrap_quantity),
    correctionReason: row.correction_reason,
    approvedBy: String(row.created_by),
    approvedByName: String(row.created_by),
    approvedAt: toBeijingISOString(row.created_at),
    snapshot: readCloseoutApprovalSnapshot(
      outputJson(row.review_snapshot),
      CLOSEOUT_APPROVAL_SNAPSHOT_SCHEMA_VERSION,
    ),
  }));
}
export type OutputState = {
  detail: ProductionOutputDetail;
  base: ProductionOutputRevision | null;
  evidenceCheck: BatchCloseoutApprovalSnapshot['check'];
  actions: BatchCloseoutAction[];
  ownerEvidence: BatchCloseoutApprovalSnapshot['workOrderOwnerEvidence'];
};

export async function loadOutputState(
  db: PoolConnection,
  row: CloseoutRow,
  closeoutRepository: MysqlProductionCloseoutRepository,
  lock: boolean,
  forFinalApproval = false,
  inventory: InventoryInboundCommand,
): Promise<OutputState> {
  const closeout = await closeoutRepository.loadDetail(db, row, lock);
  const inspections = await readOutputInspections(db, row.id, lock);
  const revisions = await readOutputRevisions(db, row.id, lock);
  const receipts = await inventory.readFinishedReceipts(String(row.production_batch_id), lock);
  const currentRevisionId = nullableOutputId(row.current_revision_id);
  const base = revisions.find((revision) => revision.id === currentRevisionId) ?? null;
  if (currentRevisionId && !base)
    throw new ProductionDomainError('INVALID_STATE', '当前批准清单引用无效');
  const evidenceCheck = base?.snapshot.check ?? closeout.check;
  const actions = base?.snapshot.actions ?? closeout.actions;
  const draft = draftOf(row);
  const selectedInspection =
    inspections.find((record) => record.id === draft?.inspectionRecordId) ?? null;
  const latestInspectionId = inspections.at(-1)?.id ?? null;
  const [[owner]] = await db.query<
    (RowDataPacket & {
      id: number;
      work_order_no: string;
      work_order_owner_id: number | null;
      version: number;
    })[]
  >(
    `SELECT id,work_order_no,work_order_owner_id,version FROM work_orders WHERE id=?${lock ? ' FOR SHARE' : ''}`,
    [evidenceCheck.workOrderId],
  );
  if (!owner) throw new ProductionDomainError('NOT_FOUND', '工单不存在');
  const ownerEvidence: BatchCloseoutApprovalSnapshot['workOrderOwnerEvidence'] = {
    sourceCode: APPROVAL_ASSIGNEE_SOURCES.workOrderOwner,
    workOrderId: String(owner.id),
    workOrderNo: owner.work_order_no,
    workOrderVersion: owner.version,
    ownerId: nullableOutputId(owner.work_order_owner_id) ?? '',
  };
  const canEdit = row.pending_approval_id === null && (!base || row.correction_reason !== null);
  const blockers: string[] = [];
  if (!base) {
    blockers.push(...closeout.check.blockers);
    if (closeout.pendingItems.length) blockers.push('先完成所有收尾事项');
    if (closeout.materialReviews.some((review) => review.status !== 'reviewed'))
      blockers.push('逐项核对物料安排，事实变化后须重新核对');
  } else if (!row.correction_reason) blockers.push('清单已批准，修改须先开始清单更正');
  if (row.pending_approval_id !== null && !forFinalApproval) blockers.push('清单正在审批中');
  if (!draft) blockers.push('产线管理员须先保存产出草稿');
  if (!selectedInspection) blockers.push('请引用当前任务的检验记录');
  else {
    if (selectedInspection.id !== latestInspectionId)
      blockers.push('已有更新的检验记录，请核对并引用最新记录');
    if (draft && !sameQuantities(draft, selectedInspection.inspected))
      blockers.push('申报数量须与所引用检验记录的实际数量一致');
  }
  if (!ownerEvidence.ownerId) blockers.push('工单未配置负责人');
  if (draft && base) {
    if (receipts.productionInboundId && draft.availableQuantity !== Number(base.availableQuantity))
      blockers.push('生产流转入库已确认，计划内批准数量不能更改');
    if (receipts.extraInboundId && draft.extraQuantity !== Number(base.extraQuantity))
      blockers.push('额外产出入库已确认，计划外批准数量不能更改');
  }
  const submissionToken = createHash('sha256')
    .update(
      JSON.stringify({
        mode: row.closeout_mode,
        draft,
        inspection: selectedInspection,
        currentRevisionId,
        correctionReason: row.correction_reason,
        check: evidenceCheck,
        actions,
      }),
    )
    .digest('hex');
  return {
    base,
    evidenceCheck,
    actions,
    ownerEvidence,
    detail: {
      id: String(row.id),
      batchId: String(row.production_batch_id),
      version: row.version,
      mode: row.closeout_mode,
      status:
        row.pending_approval_id !== null
          ? 'reviewing'
          : row.correction_reason !== null
            ? 'correcting'
            : base
              ? 'approved'
              : 'draft',
      check: closeout.check,
      workOrderOwnerId: ownerEvidence.ownerId,
      workOrderOwnerName: ownerEvidence.ownerId,
      draft,
      correctionReason: row.correction_reason,
      approvalInstanceId: nullableOutputId(row.approval_instance_id),
      pendingApprovalId: nullableOutputId(row.pending_approval_id),
      currentRevisionId,
      latestInspectionId,
      inspections,
      revisions,
      receipts,
      canEdit,
      canRecordInspection: canEdit && draft !== null,
      canSubmit: blockers.length === 0,
      canBeginCorrection:
        base !== null && row.pending_approval_id === null && row.correction_reason === null,
      canCancelCorrection:
        base !== null && row.pending_approval_id === null && row.correction_reason !== null,
      blockers,
      submissionToken,
    },
  };
}
function sameQuantities(
  left: ProductionOutputQuantities,
  right: ProductionOutputQuantities,
): boolean {
  return (
    left.availableQuantity === right.availableQuantity &&
    left.extraQuantity === right.extraQuantity &&
    left.additionalScrapQuantity === right.additionalScrapQuantity
  );
}

export function snapshotOf(row: CloseoutRow, state: OutputState): BatchCloseoutApprovalSnapshot {
  const output = state.detail.draft;
  const inspection = state.detail.inspections.find(
    (record) => record.id === output?.inspectionRecordId,
  );
  if (!output || !inspection)
    throw new ProductionDomainError('INVALID_STATE', '产出或检验依据不完整');
  return {
    kind: 'batch_closeout',
    mode: row.closeout_mode,
    closeoutId: String(row.id),
    previousRevisionId: nullableOutputId(row.current_revision_id),
    correctionReason: row.correction_reason,
    workOrderOwnerEvidence: state.ownerEvidence,
    check: state.evidenceCheck,
    output,
    inspection,
    actions: state.actions,
  };
}
