import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  CorrectProductionTrackingAbnormalityScrapPayload,
  ProductionTrackingAbnormalityScrapMode,
  ProductionTrackingAbnormalityScrappedItemMark,
  VoidProductionTrackingAbnormalityPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { MAX_PERSISTED_INTEGER_QUANTITY } from '../../domain/integer-quantity.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import { writeProductionAudit } from '../shared/mysql-production-audit.js';
import { requireTrackingItemMarkScrap } from './mysql-production-tracking-item-mark.js';

export type TrackingAbnormalityAdjustment =
  | ({ kind: 'correct' } & CorrectProductionTrackingAbnormalityScrapPayload)
  | ({ kind: 'void' } & VoidProductionTrackingAbnormalityPayload);

type Card = {
  id: string;
  quantity: number;
  status: string;
  current_step_record_id: string | null;
  version: number;
};

export function trackingAdjustmentCardBlockedReason(
  batchStatus: string,
  cardStatus: string,
  hasOutput: boolean,
): string | null {
  if (cardStatus === 'voided') return '已作废追踪卡不能更正或作废异常';
  if (cardStatus === 'completed' || hasOutput) return '请先撤销本卡未入库产出，再办理异常纠错';
  if (batchStatus !== 'doing') return '请先开始或恢复生产任务，再办理异常纠错';
  return null;
}

export function trackingAdjustmentBlockedReason(
  repairedQuantity: number,
  originalScrappedQuantity: number,
  hasScrapReference: boolean,
  voided: boolean,
): string | null {
  if (voided) return '该异常已作废';
  if (hasScrapReference) return '该异常涉及历史关联报废，暂不能更正或作废';
  if (repairedQuantity > 0 && originalScrappedQuantity > 0)
    return '历史混合处置的异常暂不能更正或作废';
  if (repairedQuantity === 0 && originalScrappedQuantity === 0)
    return '该异常缺少可用于纠错的原处理事实';
  return null;
}

export const UNKNOWN_TRACKING_SCRAP_MODE_REASON = '历史报废未记录执行站点规则，不能更正报废';

export async function selectLatestTrackingAbnormalityAdjustment(
  db: PoolConnection,
  abnormalityId: string,
): Promise<
  | { version: number; scrappedQuantity: number; kind: TrackingAbnormalityAdjustment['kind'] }
  | undefined
> {
  const [[latest]] = await db.query<
    (RowDataPacket & {
      version: number;
      scrappedQuantity: number;
      kind: TrackingAbnormalityAdjustment['kind'];
    })[]
  >(
    `SELECT version,scrapped_quantity scrappedQuantity,kind
     FROM production_tracking_abnormality_adjustment
     WHERE abnormality_id=? ORDER BY version DESC LIMIT 1 FOR SHARE`,
    [abnormalityId],
  );
  return latest;
}

async function insertAdjustmentMarks(
  db: PoolConnection,
  adjustmentId: string,
  setKind: 'before' | 'after',
  marks: readonly ProductionTrackingAbnormalityScrappedItemMark[],
): Promise<void> {
  for (let offset = 0; offset < marks.length; offset += 500) {
    const chunk = marks.slice(offset, offset + 500);
    await db.execute(
      `INSERT INTO production_tracking_abnormality_adjustment_item_mark
       (adjustment_id,set_kind,item_mark_id,mark_code_snapshot) VALUES ${chunk.map(() => '(?,?,?,?)').join(',')}`,
      chunk.flatMap(({ itemMarkId, markCode }) => [adjustmentId, setKind, itemMarkId, markCode]),
    );
  }
}

export async function adjustTrackingAbnormality(
  db: PoolConnection,
  card: Card,
  abnormalityId: string,
  adjustment: TrackingAbnormalityAdjustment,
  openAffectedQuantity: number,
  context: CommandContext,
): Promise<void> {
  const [[original]] = await db.query<
    (RowDataPacket & {
      version: number;
      status: string;
      handlingId: string | null;
      repairedQuantity: number | null;
      scrappedQuantity: number | null;
      scrapMode: Exclude<ProductionTrackingAbnormalityScrapMode, 'unknown'> | null;
    })[]
  >(
    `SELECT a.version,a.status,CAST(h.id AS CHAR) handlingId,h.repaired_quantity repairedQuantity,
     h.scrapped_quantity scrappedQuantity,h.scrap_mode scrapMode
     FROM production_tracking_abnormality a
     LEFT JOIN production_tracking_abnormality_handling h ON h.abnormality_id=a.id
     WHERE a.id=? AND a.tracking_card_id=? FOR UPDATE`,
    [abnormalityId, card.id],
  );
  if (!original) throw new ProductionDomainError('NOT_FOUND', '本卡不存在该随盘异常');
  if (original.status !== 'resolved' || original.handlingId === null)
    throw new ProductionDomainError('INVALID_STATE', '请先处理该随盘异常，再办理纠错');

  const latest = await selectLatestTrackingAbnormalityAdjustment(db, abnormalityId);
  const version = latest?.version ?? original.version;
  if (version !== adjustment.version)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', '异常已经变化，请刷新后重试');
  const [[reference]] = await db.query<RowDataPacket[]>(
    `SELECT handling_id FROM production_tracking_scrap_reference
     WHERE handling_id=? OR referenced_handling_id=? LIMIT 1 FOR SHARE`,
    [original.handlingId, original.handlingId],
  );
  const oldQuantity = Number(original.scrappedQuantity);
  const blocked = trackingAdjustmentBlockedReason(
    Number(original.repairedQuantity),
    oldQuantity,
    Boolean(reference),
    latest?.kind === 'void',
  );
  if (blocked) throw new ProductionDomainError('INVALID_STATE', blocked);

  const previousScrappedQuantity = Number(latest?.scrappedQuantity ?? oldQuantity);
  const scrapMode = original.scrapMode ?? 'unknown';
  let scrappedQuantity = 0;
  let itemMarkIds: readonly string[] = [];
  if (adjustment.kind === 'correct') {
    if (previousScrappedQuantity === 0)
      throw new ProductionDomainError('INVALID_STATE', '只有有效报废记录可以更正报废');
    if (scrapMode === 'unknown')
      throw new ProductionDomainError('INVALID_STATE', UNKNOWN_TRACKING_SCRAP_MODE_REASON);
    scrappedQuantity = adjustment.scrappedQuantity;
    itemMarkIds = adjustment.scrappedItemMarkIds;
    if (
      !Number.isSafeInteger(scrappedQuantity) ||
      scrappedQuantity < 1 ||
      scrappedQuantity > MAX_PERSISTED_INTEGER_QUANTITY
    )
      throw new ProductionDomainError('INVALID_INPUT', '更正后的报废数量须为允许范围内的正整数');
  }

  const previousCardQuantity = Number(card.quantity);
  const cardQuantity = previousCardQuantity + previousScrappedQuantity - scrappedQuantity;
  if (cardQuantity < 0 || cardQuantity > MAX_PERSISTED_INTEGER_QUANTITY)
    throw new ProductionDomainError('INVALID_INPUT', '纠错后的盘量超出允许范围');
  if (previousScrappedQuantity > 0 && cardQuantity < openAffectedQuantity)
    throw new ProductionDomainError('INVALID_INPUT', '纠错后的盘量不能少于未处理异常占用数量');

  const { previous, selected } = await requireTrackingItemMarkScrap(
    db,
    card.id,
    cardQuantity,
    scrappedQuantity,
    itemMarkIds,
    scrapMode,
    abnormalityId,
  );
  if (
    previous.length > previousScrappedQuantity ||
    (scrapMode === 'quantity_only' && previous.length !== 0) ||
    (scrapMode === 'item_marked' && previous.length !== previousScrappedQuantity)
  )
    throw new ProductionDomainError('CONFLICT', '原报废数量和有效刻码关系不一致，请核查后重试');
  if (adjustment.kind === 'correct' && scrappedQuantity === previousScrappedQuantity) {
    const previousIds = new Set(previous.map((mark) => mark.itemMarkId));
    if (
      selected.length === previousIds.size &&
      selected.every((mark) => previousIds.has(mark.itemMarkId))
    )
      throw new ProductionDomainError('INVALID_INPUT', '更正后的报废数量和刻码应有变化');
  }

  const nextVersion = version + 1;
  const [inserted] = await db.execute<ResultSetHeader>(
    `INSERT INTO production_tracking_abnormality_adjustment
     (abnormality_id,version,kind,previous_scrapped_quantity,scrapped_quantity,
      previous_card_version,previous_card_quantity,card_quantity,reason,created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      abnormalityId,
      nextVersion,
      adjustment.kind,
      previousScrappedQuantity,
      scrappedQuantity,
      card.version,
      previousCardQuantity,
      cardQuantity,
      adjustment.reason,
      context.actorId,
    ],
  );
  const adjustmentId = String(inserted.insertId);
  await insertAdjustmentMarks(db, adjustmentId, 'before', previous);
  await insertAdjustmentMarks(db, adjustmentId, 'after', selected);

  let status = card.status;
  if (cardQuantity === 0 && openAffectedQuantity === 0) status = 'scrapped';
  if (card.status === 'scrapped' && cardQuantity > 0)
    status = card.current_step_record_id === null ? 'unused' : 'in_progress';
  const [changed] = await db.execute<ResultSetHeader>(
    'UPDATE production_tracking_card SET quantity=?,status=?,version=version+1,updated_by=? WHERE id=? AND version=?',
    [cardQuantity, status, context.actorId, card.id, card.version],
  );
  if (changed.affectedRows !== 1)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', '追踪卡已经变化，请刷新后重试');
  await writeProductionAudit(
    db,
    context,
    adjustment.kind === 'correct'
      ? 'production-tracking-abnormality.scrap-correction'
      : 'production-tracking-abnormality.void',
    'production_tracking_abnormality',
    abnormalityId,
    {
      version,
      cardVersion: card.version,
      cardQuantity: String(previousCardQuantity),
      cardStatus: card.status,
      scrappedQuantity: String(previousScrappedQuantity),
      scrappedItemMarks: previous,
    },
    {
      trackingCardId: card.id,
      handlingId: original.handlingId,
      adjustmentId,
      version: nextVersion,
      cardVersion: card.version + 1,
      cardQuantity: String(cardQuantity),
      cardStatus: status,
      scrappedQuantity: String(scrappedQuantity),
      scrappedItemMarks: selected,
      reason: adjustment.reason,
    },
  );
}
