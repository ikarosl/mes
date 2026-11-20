import type {
  ProductionTrackingPersonnelSnapshot,
  SaveProductionTrackingItemMarkWorkspacePayload,
  SaveProductionTrackingItemMarkWorkspaceResult,
} from '@company/contracts';
import { TRACKING_ITEM_MARK_CODE_PATTERN } from '@company/utils';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import { writeProductionAudit } from '../shared/mysql-production-audit.js';
import { ensureNoDuplicate } from '../shared/mysql-production-db.js';
import { selectMarkIdentities } from './mysql-production-tracking-item-mark.js';

type Change = SaveProductionTrackingItemMarkWorkspacePayload['changes'][number];
type CardRow = RowDataPacket & {
  id: string;
  cardNo: string;
  version: number;
  quantity: number;
  editable: number;
};

function conflict(message: string): never {
  throw new ProductionDomainError('CONFLICT', message);
}

function validateChanges(changes: Change[], reason: string) {
  const oldCodes = new Set<string>();
  const newCodes = new Set<string>();
  const existingIds = new Set<string>();
  for (const change of changes) {
    if (change.markCode !== null && !TRACKING_ITEM_MARK_CODE_PATTERN.test(change.markCode))
      throw new ProductionDomainError('INVALID_INPUT', '请输入有效的单件刻码');
    if (change.markCode === change.previousMarkCode)
      throw new ProductionDomainError('INVALID_INPUT', '仅提交已改动的刻码行');
    if (change.markId === null) {
      if (change.previousMarkCode !== null || change.version !== null || change.markCode === null)
        throw new ProductionDomainError('INVALID_INPUT', '待绑行只能登记新号码');
    } else {
      if (
        existingIds.has(change.markId) ||
        change.previousMarkCode === null ||
        change.version === null
      )
        throw new ProductionDomainError('INVALID_INPUT', '原绑定标识、刻码或版本有误');
      if (!reason) throw new ProductionDomainError('INVALID_INPUT', '请填写更改原因');
      existingIds.add(change.markId);
      oldCodes.add(change.previousMarkCode);
    }
    if (change.markCode !== null) {
      if (newCodes.has(change.markCode)) conflict('同一刻码不能同时分配给两件实物');
      newCodes.add(change.markCode);
    }
  }
  return { oldCodes, newCodes, existingIds };
}

// The caller holds the work order and batch roots. Re-read every touched
// card and mark under lock before releasing any unique index entries.
export async function saveTrackingItemMarkWorkspace(
  db: PoolConnection,
  batchId: string,
  payload: SaveProductionTrackingItemMarkWorkspacePayload,
  person: ProductionTrackingPersonnelSnapshot,
  context: CommandContext,
): Promise<SaveProductionTrackingItemMarkWorkspaceResult> {
  const { changes } = payload;
  const reason = payload.reason?.trim() ?? '';
  if (!changes.length) throw new ProductionDomainError('INVALID_INPUT', '没有需要保存的更改');
  const { oldCodes, newCodes, existingIds } = validateChanges(changes, reason);
  const isReassignment = (row: Change) =>
    (row.previousMarkCode !== null && newCodes.has(row.previousMarkCode)) ||
    (row.markCode !== null && oldCodes.has(row.markCode));
  const byCard = new Map<string, Change[]>();
  for (const change of changes) {
    const group = byCard.get(change.cardId) ?? [];
    group.push(change);
    byCard.set(change.cardId, group);
  }
  const [cards] = await db.query<CardRow[]>(
    `SELECT CAST(c.id AS CHAR) id,c.card_no cardNo,c.version,c.quantity,
       (b.status='doing' AND c.status IN ('unused','in_progress') AND NOT EXISTS (
          SELECT 1 FROM production_tracking_output o LEFT JOIN production_tracking_output_cancellation x ON x.production_output_id=o.id
          WHERE o.tracking_card_id=c.id AND x.id IS NULL FOR SHARE
       )) editable
     FROM production_tracking_card c JOIN production_batches b ON b.id=c.production_batch_id
     JOIN work_orders wo ON wo.id=b.work_order_id
     WHERE c.production_batch_id=? AND wo.order_type='mass_production' AND c.id IN (?)
     ORDER BY c.id FOR UPDATE`,
    [batchId, [...byCard.keys()]],
  );
  if (cards.length !== byCard.size) conflict('更改中的追踪卡必须属于同一批量任务');
  for (const card of cards) {
    const group = byCard.get(card.id)!;
    const identities = await selectMarkIdentities(db, card.id, true);
    const byId = new Map(identities.map((item) => [item.itemMarkId, item]));
    let active = identities.filter((m) => !m.cancelled && m.scrapAbnormalityId === null).length;
    let needsBind = false;
    for (const change of group) {
      if (change.cardVersion !== card.version)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          `追踪卡 ${card.cardNo} 已变化，请核对草稿`,
        );
      if (change.markId === null) {
        if (!card.editable) conflict('只能在执行中任务的可办理卡上绑定刻码');
        needsBind = true;
        active++;
        continue;
      }
      const original = byId.get(change.markId);
      if (
        !original ||
        original.cancelled ||
        original.markCode !== change.previousMarkCode ||
        original.version !== change.version
      )
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          `追踪卡 ${card.cardNo} 的原绑定已变化，请核对草稿`,
        );
      if (!change.markCode || isReassignment(change)) {
        if (!card.editable || original.scrapAbnormalityId !== null)
          conflict(`刻码 ${original.markCode} 只能修正录入号码，不能清空或调换`);
        if (change.markCode) needsBind = true;
      }
      if (change.markCode === null) active--;
    }
    if (needsBind) {
      const [open] = await db.query<RowDataPacket[]>(
        "SELECT id FROM production_tracking_abnormality WHERE tracking_card_id=? AND status='open' LIMIT 1 FOR SHARE",
        [card.id],
      );
      if (open.length) conflict(`追踪卡 ${card.cardNo} 有未处理异常，请先完成处理`);
      if (active > Number(card.quantity))
        conflict(`追踪卡 ${card.cardNo} 的正常绑定数超过当前盘量`);
    }
  }
  if (newCodes.size) {
    const [occupied] = await db.query<(RowDataPacket & { id: string; code: string })[]>(
      'SELECT CAST(id AS CHAR) id,occupied_mark_code code FROM production_tracking_item_mark WHERE occupied_mark_code IN (?) ORDER BY occupied_mark_code FOR UPDATE',
      [[...newCodes]],
    );
    for (const owner of occupied)
      if (!existingIds.has(owner.id)) conflict(`刻码 ${owner.code} 已被占用`);
  }
  if (existingIds.size)
    await db.query(
      'UPDATE production_tracking_item_mark SET occupied_mark_code=NULL WHERE id IN (?)',
      [[...existingIds]],
    );

  const cardNumbers = new Map(cards.map((card) => [card.id, card.cardNo]));
  for (const change of changes) {
    let markId = change.markId;
    try {
      if (markId === null) {
        const [inserted] = await db.execute<ResultSetHeader>(
          `INSERT INTO production_tracking_item_mark
           (tracking_card_id,mark_code,occupied_mark_code,personnel_id,personnel_code_snapshot,personnel_name_snapshot,created_by)
           VALUES (?,?,?,?,?,?,?)`,
          [
            change.cardId,
            change.markCode,
            change.markCode,
            person.personnelId,
            person.personnelCode,
            person.personnelName,
            context.actorId,
          ],
        );
        markId = String(inserted.insertId);
      } else if (change.markCode === null) {
        if (!isReassignment(change))
          await db.execute(
            'INSERT INTO production_tracking_item_mark_cancellation(item_mark_id,reason,created_by) VALUES (?,?,?)',
            [markId, reason, context.actorId],
          );
      } else {
        await db.execute(
          'UPDATE production_tracking_item_mark SET mark_code=?,occupied_mark_code=?,version=version+1 WHERE id=?',
          [change.markCode, change.markCode, markId],
        );
        if (!isReassignment(change))
          await db.execute(
            'INSERT INTO production_tracking_item_mark_correction(item_mark_id,previous_mark_code,corrected_mark_code,reason,created_by) VALUES (?,?,?,?,?)',
            [markId, change.previousMarkCode, change.markCode, reason, context.actorId],
          );
      }
    } catch (error) {
      return ensureNoDuplicate(error, '编码占用已变化，请核对草稿后重新保存');
    }
    const identity = { cardId: change.cardId, cardNo: cardNumbers.get(change.cardId) };
    await writeProductionAudit(
      db,
      context,
      'production-tracking-item-mark.workspace-save',
      'production_tracking_item_mark',
      markId,
      { ...identity, markCode: change.previousMarkCode },
      { ...identity, markCode: change.markCode, reason, personnelId: person.personnelId },
    );
  }
  const changedCardIds = [...byCard]
    .filter(([, group]) =>
      group.some((row) => row.markId === null || row.markCode === null || isReassignment(row)),
    )
    .map(([cardId]) => cardId);
  if (changedCardIds.length)
    await db.query(
      'UPDATE production_tracking_card SET version=version+1,updated_by=? WHERE id IN (?)',
      [context.actorId, changedCardIds],
    );
  return { changedCount: changes.length };
}
