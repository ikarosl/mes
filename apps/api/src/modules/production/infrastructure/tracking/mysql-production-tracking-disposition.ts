import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  HandleProductionTrackingAbnormalityPayload,
  ProductionTrackingPersonnelSnapshot,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { requireTrackingDispositionQuantities } from '../../domain/production-tracking-disposition.policy.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import { writeProductionAudit } from '../shared/mysql-production-audit.js';

export async function settleTrackingAbnormality(
  db: PoolConnection,
  card: { id: string; quantity: number; status: string; version: number },
  abnormalityId: string,
  payload: HandleProductionTrackingAbnormalityPayload,
  person: ProductionTrackingPersonnelSnapshot,
  context: CommandContext,
): Promise<void> {
  const [[abnormality]] = await db.query<
    (RowDataPacket & { version: number; status: string; affected_quantity: number })[]
  >(
    'SELECT version,status,affected_quantity FROM production_tracking_abnormality WHERE id=? AND tracking_card_id=? FOR UPDATE',
    [abnormalityId, card.id],
  );
  if (!abnormality) throw new ProductionDomainError('NOT_FOUND', '随盘异常不存在');
  if (abnormality.version !== payload.version)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', '异常已经变化，请刷新后重试');
  if (abnormality.status !== 'open')
    throw new ProductionDomainError('INVALID_STATE', '该异常已经完成最终结算，不能重复处理');
  requireTrackingDispositionQuantities(
    Number(abnormality.affected_quantity),
    Number(card.quantity),
    payload,
  );
  // The card root lock serializes all its settlements. Reference facts are immutable;
  // their quantities explain overlap and are deliberately not globally consumed.
  for (const reference of payload.scrapReferences) {
    const [[identity]] = await db.query<(RowDataPacket & { trackingCardId: string })[]>(
      `SELECT CAST(a.tracking_card_id AS CHAR) trackingCardId FROM production_tracking_abnormality_handling h
       JOIN production_tracking_abnormality a ON a.id=h.abnormality_id WHERE h.id=?`,
      [reference.handlingId],
    );
    if (!identity || identity.trackingCardId !== card.id)
      throw new ProductionDomainError(
        'INVALID_INPUT',
        '只能关联同一卡其他已处理异常中的本次新增报废记录',
      );
    const [[source]] = await db.query<
      (RowDataPacket & {
        abnormality_id: string;
        tracking_card_id: string;
        status: string;
        scrapped_quantity: number;
      })[]
    >(
      `SELECT CAST(h.abnormality_id AS CHAR) abnormality_id,CAST(a.tracking_card_id AS CHAR) tracking_card_id,a.status,h.scrapped_quantity
       FROM production_tracking_abnormality_handling h JOIN production_tracking_abnormality a ON a.id=h.abnormality_id
       WHERE h.id=? AND a.tracking_card_id=? FOR UPDATE`,
      [reference.handlingId, card.id],
    );
    if (
      !source ||
      source.tracking_card_id !== card.id ||
      source.abnormality_id === abnormalityId ||
      source.status !== 'resolved' ||
      source.scrapped_quantity <= 0
    )
      throw new ProductionDomainError(
        'INVALID_INPUT',
        '只能关联同一卡其他已处理异常中的本次新增报废记录',
      );
    if (reference.quantity > source.scrapped_quantity)
      throw new ProductionDomainError('INVALID_INPUT', '关联数量不能超过该来源实际新增报废数量');
  }
  const remainingQuantity = Number(card.quantity) - payload.scrappedQuantity;
  const [created] = await db.execute<ResultSetHeader>(
    `INSERT INTO production_tracking_abnormality_handling
     (abnormality_id,content,repaired_quantity,scrapped_quantity,previous_card_quantity,remaining_card_quantity,personnel_id,personnel_code_snapshot,personnel_name_snapshot,created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      abnormalityId,
      payload.content,
      payload.repairedQuantity,
      payload.scrappedQuantity,
      card.quantity,
      remainingQuantity,
      person.personnelId,
      person.personnelCode,
      person.personnelName,
      context.actorId,
    ],
  );
  const handlingId = String(created.insertId);
  for (const reference of payload.scrapReferences)
    await db.execute(
      'INSERT INTO production_tracking_scrap_reference (handling_id,referenced_handling_id,quantity) VALUES (?,?,?)',
      [handlingId, reference.handlingId, reference.quantity],
    );
  const [closed] = await db.execute<ResultSetHeader>(
    `UPDATE production_tracking_abnormality SET status='resolved',resolved_at=NOW(),version=version+1,updated_by=? WHERE id=? AND version=? AND status='open'`,
    [context.actorId, abnormalityId, payload.version],
  );
  if (closed.affectedRows !== 1)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', '异常已经变化，请刷新后重试');
  const [open] = await db.query<RowDataPacket[]>(
    "SELECT id FROM production_tracking_abnormality WHERE tracking_card_id=? AND status='open' FOR UPDATE",
    [card.id],
  );
  const status = remainingQuantity === 0 && open.length === 0 ? 'scrapped' : card.status;
  const [changed] = await db.execute<ResultSetHeader>(
    'UPDATE production_tracking_card SET quantity=?,status=?,version=version+1,updated_by=? WHERE id=? AND version=?',
    [remainingQuantity, status, context.actorId, card.id, card.version],
  );
  if (changed.affectedRows !== 1)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', '追踪卡已经变化，请刷新后重试');
  await writeProductionAudit(
    db,
    context,
    'production-tracking-abnormality.handle',
    'production_tracking_abnormality',
    abnormalityId,
    { status: abnormality.status, cardQuantity: String(card.quantity), cardStatus: card.status },
    {
      ...payload,
      ...person,
      handlingId,
      trackingCardId: card.id,
      affectedQuantity: String(abnormality.affected_quantity),
      cardQuantity: String(remainingQuantity),
      cardStatus: status,
      status: 'resolved',
    },
  );
}
