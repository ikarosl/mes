import type { InventoryInboundCommand } from '../../inventory/public.js';
import { createHash } from 'node:crypto';
import { APPROVAL_ASSIGNEE_SOURCES } from '@company/constants';
import { ProductionDomainError } from '../domain/production.errors.js';
import type { QualityFinishedInspectionQuery } from '../../quality/public.js';
import type {
  BatchCloseoutApprovalSnapshot,
  BatchCloseoutAction,
  ProductionOutputDetail,
} from '@company/contracts';
import type { MysqlProductionCloseoutRepository } from './mysql-production-closeout.repository.js';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { ProductionOutputRevision } from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { readOutputRounds } from './mysql-production-output-round.js';
import { readProductionOutputReceipts } from './mysql-production-output-receipts.js';
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

type RevisionRow = RowDataPacket & {
  id: number;
  closeout_id: number;
  round_id: number;
  production_batch_id: number;
  revision_no: number;
  previous_revision_id: number | null;
  approval_instance_id: number;
  inspection_record_id: number;
  planned_quantity: string;
  baseline_planned_received: string;
  baseline_extra_received: string;
  planned_allocation: string;
  extra_allocation: string;
  additional_scrap_quantity: string;
  existing_scrap_quantity: string;
  correction_reason: string | null;
  review_snapshot: object | string;
  created_by: number;
  created_at: Date;
};
export async function readOutputRevisions(
  db: PoolConnection,
  closeoutId: number,
  lock: boolean,
  inventory: InventoryInboundCommand,
): Promise<ProductionOutputRevision[]> {
  const [rows] = await db.query<RevisionRow[]>(
    `SELECT r.id,r.closeout_id,r.round_id,r.production_batch_id,r.revision_no,r.previous_revision_id,
      r.approval_instance_id,r.inspection_record_id,r.planned_quantity,r.additional_scrap_quantity,
      r.existing_scrap_quantity,r.correction_reason,r.review_snapshot,r.created_by,r.created_at,
      round.baseline_planned_received,round.baseline_extra_received,
      COALESCE((SELECT a.quantity FROM production_output_allocation a WHERE a.revision_id=r.id AND a.category='self_made'),0) planned_allocation,
      COALESCE((SELECT a.quantity FROM production_output_allocation a WHERE a.revision_id=r.id AND a.category='production_extra'),0) extra_allocation
      FROM production_output_revision r JOIN production_output_round round ON round.id=r.round_id
      WHERE r.closeout_id=? ORDER BY r.revision_no${lock ? ' FOR SHARE' : ''}`,
    [closeoutId],
  );
  const revisions = rows.map((row) => ({
    id: String(row.id),
    roundId: String(row.round_id),
    allocations: [],
    closeoutId: String(row.closeout_id),
    batchId: String(row.production_batch_id),
    revisionNo: row.revision_no,
    previousRevisionId: nullableOutputId(row.previous_revision_id),
    approvalInstanceId: String(row.approval_instance_id),
    inspectionRecordId: String(row.inspection_record_id),
    plannedQuantity: String(row.planned_quantity),
    availableQuantity: String(
      Number(row.baseline_planned_received) + Number(row.planned_allocation),
    ),
    extraQuantity: String(Number(row.baseline_extra_received) + Number(row.extra_allocation)),
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
  const [allocationRows] = await db.query<
    (RowDataPacket & {
      id: number;
      revision_id: number;
      round_id: number;
      category: 'self_made' | 'production_extra';
      quantity: string;
    })[]
  >(
    `SELECT id,revision_id,round_id,category,quantity FROM production_output_allocation WHERE closeout_id=? ORDER BY id${lock ? ' FOR SHARE' : ''}`,
    [closeoutId],
  );
  const received: Record<string, string> = {};
  for (let index = 0; index < allocationRows.length; index += 100)
    Object.assign(
      received,
      await inventory.readFinishedAllocationReceipts(
        allocationRows.slice(index, index + 100).map((item) => String(item.id)),
        lock,
      ),
    );
  return revisions.map((revision) => ({
    ...revision,
    allocations: allocationRows
      .filter((item) => String(item.revision_id) === revision.id)
      .map((item) => ({
        id: String(item.id),
        revisionId: revision.id,
        roundId: String(item.round_id),
        category: item.category,
        quantity: String(item.quantity),
        receivedQuantity: received[String(item.id)] ?? '0',
        remainingQuantity: String(
          Math.max(0, Number(item.quantity) - Number(received[String(item.id)] ?? '0')),
        ),
      })),
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
  quality: QualityFinishedInspectionQuery,
): Promise<OutputState> {
  const closeout = await closeoutRepository.loadDetail(db, row, lock);
  const inspections = await quality.readForCloseout(
    String(row.id),
    String(row.production_batch_id),
    lock,
  );
  const revisions = await readOutputRevisions(db, row.id, lock, inventory);
  const rounds = await readOutputRounds(db, row.id, lock);
  const receipts = await readProductionOutputReceipts(
    db,
    inventory,
    String(row.production_batch_id),
    lock,
  );
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
    if (selectedInspection.releaseDecision === 'pending_reinspection')
      blockers.push('当前检验待全检或复检，须完成检验后再结案');
    else if (selectedInspection.releaseDecision !== 'released')
      blockers.push('当前检验未放行，须取得明确放行结论后再结案');
  }
  if (!ownerEvidence.ownerId) blockers.push('工单未配置负责人');
  if (
    draft &&
    (draft.availableQuantity < Number(receipts.productionReceivedQuantity) ||
      draft.extraQuantity < Number(receipts.extraReceivedQuantity))
  )
    blockers.push('累计产出不能低于各类别历史已入数量');
  const currentRound = rounds.find((round) => round.id === nullableOutputId(row.current_round_id));
  if (row.current_round_id !== null && !currentRound) blockers.push('当前办理轮次无效');
  if (currentRound?.status === 'inspecting') blockers.push('本轮检验已开始，须先完成检验记录');
  const selectedInspectionRoundNo =
    rounds.find((round) => round.id === selectedInspection?.roundId)?.roundNo ?? 0;
  if (
    rounds.some(
      (round) => round.roundNo > selectedInspectionRoundNo && round.triggerType === 'reinspection',
    ) &&
    selectedInspection?.roundId !== currentRound?.id
  )
    blockers.push('已发起剩余实物复检，须引用新轮检验记录');
  if (
    currentRound?.triggerType === 'reinspection' &&
    selectedInspection?.roundId !== currentRound.id
  )
    blockers.push('本轮复检须重新登记检验记录');
  const submissionToken = createHash('sha256')
    .update(
      JSON.stringify({
        mode: row.closeout_mode,
        draft,
        inspection: selectedInspection,
        currentRevisionId,
        currentRoundId: nullableOutputId(row.current_round_id),
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
      currentRoundId: nullableOutputId(row.current_round_id),
      rounds,
      latestInspectionId,
      inspections,
      revisions,
      receipts,
      canEdit,
      canRecordInspection: canEdit && draft !== null && currentRound?.status === 'inspecting',
      canSubmit: blockers.length === 0,
      canBeginReinspection:
        row.pending_approval_id === null &&
        ((base !== null && row.correction_reason === null) ||
          (base === null &&
            currentRound !== undefined &&
            inspections.some((record) => record.roundId === currentRound.id))),
      canBeginCorrection:
        base !== null && row.pending_approval_id === null && row.correction_reason === null,
      canCancelCorrection:
        base !== null &&
        row.pending_approval_id === null &&
        row.correction_reason !== null &&
        currentRound?.status !== 'inspecting',
      blockers,
      submissionToken,
    },
  };
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
