import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  BindProductionTrackingItemMarkPayload,
  CancelProductionTrackingItemMarkPayload,
  CorrectProductionTrackingItemMarkPayload,
  ProductionTrackingAbnormalityScrapMode,
  ProductionTrackingAbnormalityScrappedItemMark,
  ProductionTrackingItemMarkingSummary,
  ProductionTrackingPersonnelSnapshot,
} from '@company/contracts';
import {
  TRACKING_ITEM_MARK_CODE_ERROR_MESSAGE,
  TRACKING_ITEM_MARK_CODE_PATTERN,
} from '@company/utils';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import { writeProductionAudit } from '../shared/mysql-production-audit.js';
import { ensureNoDuplicate, type Db } from '../shared/mysql-production-db.js';
import {
  TRACKING_EFFECTIVE_SCRAP_ABNORMALITY,
  trackingEffectiveScrapJoins,
} from './tracking-effective-scrap.sql.js';

type MarkIdentityRow = RowDataPacket & {
  itemMarkId: string;
  markCode: string;
  version: number;
  cancelled: number;
  scrapAbnormalityId: string | null;
};

/** A current locking read is required after waiting for the card root lock. */
export async function selectMarkIdentities(
  db: Db,
  cardId: string,
  lock: boolean,
): Promise<MarkIdentityRow[]> {
  const [rows] = await db.query<MarkIdentityRow[]>(
    `SELECT CAST(m.id AS CHAR) itemMarkId,m.mark_code markCode,m.version,m.occupied_mark_code IS NULL cancelled,
      CAST(${TRACKING_EFFECTIVE_SCRAP_ABNORMALITY} AS CHAR) scrapAbnormalityId
     FROM production_tracking_item_mark m
     ${trackingEffectiveScrapJoins(lock)}
     WHERE m.tracking_card_id=? ORDER BY m.id${lock ? ' FOR SHARE' : ''}`,
    [cardId],
  );
  return rows;
}

export async function selectTrackingItemMarkingSummary(
  db: Db,
  cardId: string,
  lock = false,
): Promise<ProductionTrackingItemMarkingSummary> {
  const [[card]] = await db.query<(RowDataPacket & { id: string })[]>(
    `SELECT CAST(id AS CHAR) id FROM production_tracking_card WHERE id=?${lock ? ' FOR SHARE' : ''}`,
    [cardId],
  );
  if (!card) throw new ProductionDomainError('NOT_FOUND', '追踪卡不存在');
  const rows = await selectMarkIdentities(db, cardId, lock);
  return {
    activeCount: rows.filter((row) => !row.cancelled && row.scrapAbnormalityId === null).length,
    scrappedCount: rows.filter((row) => row.scrapAbnormalityId !== null).length,
    cancelledCount: rows.filter((row) => Boolean(row.cancelled)).length,
    totalCount: rows.length,
  };
}

async function requireMarkingCard(
  db: PoolConnection,
  cardId: string,
  version: number,
): Promise<void> {
  const [[row]] = await db.query<
    (RowDataPacket & {
      version: number;
      cardStatus: string;
      batchStatus: string;
      orderType: string;
    })[]
  >(
    `SELECT c.version,c.status cardStatus,b.status batchStatus,wo.order_type orderType
     FROM production_tracking_card c JOIN production_batches b ON b.id=c.production_batch_id
     JOIN work_orders wo ON wo.id=b.work_order_id WHERE c.id=? FOR UPDATE`,
    [cardId],
  );
  if (!row) throw new ProductionDomainError('NOT_FOUND', '追踪卡不存在');
  if (row.version !== version)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', '追踪卡已经变化，请刷新后重试');
  if (row.orderType !== 'mass_production')
    throw new ProductionDomainError('INVALID_STATE', '只有批量任务的追踪卡可以办理单件刻码');
  if (row.batchStatus !== 'doing' || !['unused', 'in_progress'].includes(row.cardStatus))
    throw new ProductionDomainError(
      'INVALID_STATE',
      '只有执行中任务的未使用或流转中追踪卡可以办理刻码绑定或撤销',
    );
}

export async function bindTrackingItemMark(
  db: PoolConnection,
  cardId: string,
  payload: BindProductionTrackingItemMarkPayload,
  person: ProductionTrackingPersonnelSnapshot,
  context: CommandContext,
): Promise<void> {
  await requireMarkingCard(db, cardId, payload.version);
  if (!TRACKING_ITEM_MARK_CODE_PATTERN.test(payload.markCode))
    throw new ProductionDomainError('INVALID_INPUT', TRACKING_ITEM_MARK_CODE_ERROR_MESSAGE);
  const [open] = await db.query<RowDataPacket[]>(
    `SELECT id FROM production_tracking_abnormality WHERE tracking_card_id=? AND status='open' FOR SHARE`,
    [cardId],
  );
  if (open.length)
    throw new ProductionDomainError(
      'CONFLICT',
      '该盘存在未处理异常，请先完成异常处理再绑定单件刻码',
    );
  const [[card]] = await db.query<(RowDataPacket & { quantity: number })[]>(
    'SELECT quantity FROM production_tracking_card WHERE id=? FOR SHARE',
    [cardId],
  );
  const summary = await selectTrackingItemMarkingSummary(db, cardId, true);
  if (!card || summary.activeCount >= Number(card.quantity))
    throw new ProductionDomainError('CONFLICT', '有效单件刻码已达到当前盘量，不能继续绑定');
  const [existing] = await db.query<RowDataPacket[]>(
    'SELECT id FROM production_tracking_item_mark WHERE occupied_mark_code=? FOR SHARE',
    [payload.markCode],
  );
  if (existing.length) throw new ProductionDomainError('CONFLICT', '该单件刻码已被占用');
  let markId: string;
  try {
    const [created] = await db.execute<ResultSetHeader>(
      `INSERT INTO production_tracking_item_mark
       (tracking_card_id,mark_code,occupied_mark_code,personnel_id,personnel_code_snapshot,personnel_name_snapshot,created_by) VALUES (?,?,?,?,?,?,?)`,
      [
        cardId,
        payload.markCode,
        payload.markCode,
        person.personnelId,
        person.personnelCode,
        person.personnelName,
        context.actorId,
      ],
    );
    markId = String(created.insertId);
  } catch (error) {
    return ensureNoDuplicate(error, '该单件刻码已被登记，不能重复使用');
  }
  await db.execute(
    'UPDATE production_tracking_card SET version=version+1,updated_by=? WHERE id=? AND version=?',
    [context.actorId, cardId, payload.version],
  );
  await writeProductionAudit(
    db,
    context,
    'production-tracking-item-mark.bind',
    'production_tracking_item_mark',
    markId,
    null,
    { trackingCardId: cardId, markCode: payload.markCode, ...person },
  );
}

export async function correctTrackingItemMark(
  db: PoolConnection,
  cardId: string,
  markId: string,
  payload: CorrectProductionTrackingItemMarkPayload,
  context: CommandContext,
): Promise<void> {
  if (!TRACKING_ITEM_MARK_CODE_PATTERN.test(payload.markCode))
    throw new ProductionDomainError('INVALID_INPUT', TRACKING_ITEM_MARK_CODE_ERROR_MESSAGE);
  const [[mark]] = await db.query<
    (RowDataPacket & { markCode: string; occupied: string | null; version: number })[]
  >(
    'SELECT mark_code markCode,occupied_mark_code occupied,version FROM production_tracking_item_mark WHERE id=? AND tracking_card_id=? FOR UPDATE',
    [markId, cardId],
  );
  if (!mark) throw new ProductionDomainError('NOT_FOUND', '本卡不存在该单件刻码绑定');
  if (mark.occupied === null)
    throw new ProductionDomainError('INVALID_STATE', '已撤销的绑定仅供历史查询');
  if (mark.version !== payload.version)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', '该单件刻码已经变化，请刷新后重试');
  if (mark.markCode === payload.markCode)
    throw new ProductionDomainError('INVALID_INPUT', '更正后的单件刻码须与当前刻码不同');
  const [existing] = await db.query<RowDataPacket[]>(
    'SELECT id FROM production_tracking_item_mark WHERE occupied_mark_code=? AND id<>? FOR SHARE',
    [payload.markCode, markId],
  );
  if (existing.length)
    throw new ProductionDomainError('CONFLICT', '更正后的单件刻码已被登记，不能重复使用');
  try {
    await db.execute(
      'UPDATE production_tracking_item_mark SET mark_code=?,occupied_mark_code=?,version=version+1 WHERE id=?',
      [payload.markCode, payload.markCode, markId],
    );
  } catch (error) {
    return ensureNoDuplicate(error, '更正后的单件刻码已被登记，不能重复使用');
  }
  await db.execute(
    `INSERT INTO production_tracking_item_mark_correction
     (item_mark_id,previous_mark_code,corrected_mark_code,reason,created_by) VALUES (?,?,?,?,?)`,
    [markId, mark.markCode, payload.markCode, payload.reason, context.actorId],
  );
  await writeProductionAudit(
    db,
    context,
    'production-tracking-item-mark.correct',
    'production_tracking_item_mark',
    markId,
    { trackingCardId: cardId, markCode: mark.markCode },
    { trackingCardId: cardId, markCode: payload.markCode, reason: payload.reason },
  );
}

export async function cancelTrackingItemMark(
  db: PoolConnection,
  cardId: string,
  markId: string,
  payload: CancelProductionTrackingItemMarkPayload,
  context: CommandContext,
): Promise<void> {
  await requireMarkingCard(db, cardId, payload.version);
  const row = (await selectMarkIdentities(db, cardId, true)).find(
    (mark) => mark.itemMarkId === markId,
  );
  if (!row) throw new ProductionDomainError('NOT_FOUND', '本卡不存在该单件刻码绑定');
  if (row.cancelled || row.scrapAbnormalityId !== null)
    throw new ProductionDomainError('INVALID_STATE', '已报废或已撤销的单件刻码不能再次撤销');
  const [output] = await db.query<RowDataPacket[]>(
    `SELECT o.id FROM production_tracking_output o LEFT JOIN production_tracking_output_cancellation x ON x.production_output_id=o.id
     WHERE o.tracking_card_id=? AND x.id IS NULL FOR SHARE`,
    [cardId],
  );
  if (output.length)
    throw new ProductionDomainError('CONFLICT', '本卡存在有效产出，请先按产出撤销边界办理');
  await db.execute('UPDATE production_tracking_item_mark SET occupied_mark_code=NULL WHERE id=?', [
    markId,
  ]);
  await db.execute(
    'INSERT INTO production_tracking_item_mark_cancellation (item_mark_id,reason,created_by) VALUES (?,?,?)',
    [markId, payload.reason, context.actorId],
  );
  await db.execute(
    'UPDATE production_tracking_card SET version=version+1,updated_by=? WHERE id=? AND version=?',
    [context.actorId, cardId, payload.version],
  );
  await writeProductionAudit(
    db,
    context,
    'production-tracking-item-mark.cancel',
    'production_tracking_item_mark',
    markId,
    null,
    { trackingCardId: cardId, reason: payload.reason },
  );
}

/** Return the complete before and after selections at the current card version. */
export async function requireTrackingItemMarkScrap(
  db: PoolConnection,
  cardId: string,
  remainingQuantity: number,
  scrappedQuantity: number,
  itemMarkIds: readonly string[],
  scrapMode: ProductionTrackingAbnormalityScrapMode,
  restoredAbnormalityId?: string,
): Promise<{
  previous: ProductionTrackingAbnormalityScrappedItemMark[];
  selected: ProductionTrackingAbnormalityScrappedItemMark[];
}> {
  if (new Set(itemMarkIds).size !== itemMarkIds.length || itemMarkIds.length > scrappedQuantity)
    throw new ProductionDomainError(
      'INVALID_INPUT',
      '报废刻码不能重复，选中数量不能超过本次新增报废数量',
    );
  if (scrapMode === 'item_marked' && itemMarkIds.length !== scrappedQuantity)
    throw new ProductionDomainError('INVALID_INPUT', '末站报废数量必须与所选有效单件刻码数量一致');
  if (scrapMode === 'quantity_only' && itemMarkIds.length > 0)
    throw new ProductionDomainError('INVALID_INPUT', '原结算按数量办理，不能选择单件刻码');
  const rows = await selectMarkIdentities(db, cardId, true);
  const previous = rows.filter((row) => row.scrapAbnormalityId === restoredAbnormalityId);
  if (previous.some((row) => row.cancelled))
    throw new ProductionDomainError('CONFLICT', '异常的有效报废刻码状态不一致，请核查后重试');
  const available = new Map(
    rows
      .filter(
        (row) =>
          !row.cancelled &&
          (row.scrapAbnormalityId === null || row.scrapAbnormalityId === restoredAbnormalityId),
      )
      .map(({ itemMarkId, markCode }) => [itemMarkId, { itemMarkId, markCode }]),
  );
  const selected = itemMarkIds.map((id) => {
    const mark = available.get(id);
    if (!mark)
      throw new ProductionDomainError(
        'INVALID_INPUT',
        '只能选择本卡有效刻码或本异常当前报废的刻码',
      );
    return mark;
  });
  // Keeping room for every remaining mark limits unmarked scrap to the unbound quantity.
  const minimumSelected = available.size - remainingQuantity;
  if (selected.length < minimumSelected)
    throw new ProductionDomainError(
      'INVALID_INPUT',
      scrapMode === 'quantity_only'
        ? '前道报废后的盘量不能少于有效单件刻码数'
        : `本次报废至少须选择 ${minimumSelected} 个实际报废编码`,
    );
  return {
    previous: previous.map(({ itemMarkId, markCode }) => ({ itemMarkId, markCode })),
    selected,
  };
}

export async function insertTrackingItemMarkScrap(
  db: PoolConnection,
  handlingId: string,
  itemMarks: readonly ProductionTrackingAbnormalityScrappedItemMark[],
): Promise<void> {
  for (let offset = 0; offset < itemMarks.length; offset += 500) {
    const chunk = itemMarks.slice(offset, offset + 500);
    await db.execute(
      `INSERT INTO production_tracking_item_mark_scrap (item_mark_id,handling_id,mark_code_snapshot) VALUES ${chunk.map(() => '(?,?,?)').join(',')}`,
      chunk.flatMap(({ itemMarkId, markCode }) => [itemMarkId, handlingId, markCode]),
    );
  }
}

export async function snapshotTrackingOutputItemMarks(
  db: PoolConnection,
  outputId: string,
  cardId: string,
  quantity: number,
): Promise<void> {
  const rows = await selectMarkIdentities(db, cardId, true);
  const active = rows.filter((row) => !row.cancelled && row.scrapAbnormalityId === null);
  if (active.length !== quantity)
    throw new ProductionDomainError(
      'CONFLICT',
      '有效单件刻码数量必须等于当前剩余盘量，才能确认最终产出',
    );
  for (let offset = 0; offset < active.length; offset += 500) {
    const chunk = active.slice(offset, offset + 500);
    await db.execute(
      `INSERT INTO production_tracking_output_item_mark (production_output_id,item_mark_id) VALUES ${chunk.map(() => '(?,?)').join(',')}`,
      chunk.flatMap((row) => [outputId, row.itemMarkId]),
    );
  }
}
