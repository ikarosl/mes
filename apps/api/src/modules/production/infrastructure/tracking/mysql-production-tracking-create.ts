import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  CreateProductionTrackingCardPayload,
  CreateProductionTrackingCardsPayload,
  ProductionTrackingCardDetail,
  ProductionTrackingCardsCreatedResult,
  ProductionTrackingPersonnelSnapshot,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import {
  requireTrackingCardQuantity,
  splitTrackingCardQuantities,
} from '../../domain/production-tracking-card.policy.js';
import { writeProductionAudit } from '../shared/mysql-production-audit.js';
import { findBatch } from '../tasks/mysql-production-batch.persistence.js';
import { allocateTrackingCardNumbers } from './mysql-production-tracking-number.js';
import {
  selectCreatedUnusedTrackingCards,
  selectTrackingCard,
} from './mysql-production-tracking.read.js';

async function requireCreationBatch(
  db: PoolConnection,
  batchId: string,
): Promise<{ batchNo: string; firstStepRecordId: string }> {
  const batch = await findBatch(db, batchId, true);
  if (batch.status !== 'doing')
    throw new ProductionDomainError('INVALID_STATE', '请先开始任务，再建立追踪卡');
  if (batch.order_type !== 'mass_production')
    throw new ProductionDomainError(
      'INVALID_STATE',
      '研发任务直接在任务中确认最终产出，不建立追踪卡',
    );
  const [[firstStep]] = await db.query<(RowDataPacket & { id: string })[]>(
    'SELECT CAST(id AS CHAR) id FROM batch_step_records WHERE production_batch_id=? ORDER BY step_order_snapshot,id LIMIT 1',
    [batchId],
  );
  if (!firstStep) throw new ProductionDomainError('INVALID_STATE', '任务没有已冻结的工艺路线');
  return { batchNo: batch.batch_no, firstStepRecordId: firstStep.id };
}

async function insertCard(
  db: PoolConnection,
  batchId: string,
  cardNo: string,
  quantity: number,
  firstStepRecordId: string | null,
  remark: string | null,
  person: ProductionTrackingPersonnelSnapshot,
  context: CommandContext,
): Promise<string> {
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO production_tracking_card (production_batch_id,card_no,quantity,status,current_step_record_id,personnel_id,personnel_code_snapshot,personnel_name_snapshot,remark,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      batchId,
      cardNo,
      quantity,
      firstStepRecordId === null ? 'unused' : 'in_progress',
      firstStepRecordId,
      person.personnelId,
      person.personnelCode,
      person.personnelName,
      remark,
      context.actorId,
      context.actorId,
    ],
  );
  return String(result.insertId);
}

export async function createTrackingCardAtFirstStation(
  db: PoolConnection,
  batchId: string,
  payload: CreateProductionTrackingCardPayload,
  person: ProductionTrackingPersonnelSnapshot,
  context: CommandContext,
): Promise<ProductionTrackingCardDetail> {
  requireTrackingCardQuantity(payload.quantity);
  const batch = await requireCreationBatch(db, batchId);
  const [cardNo] = await allocateTrackingCardNumbers(db, batchId, batch.batchNo, 1);
  if (!cardNo) throw new Error('追踪卡编号分配结果缺失');
  const cardId = await insertCard(
    db,
    batchId,
    cardNo,
    payload.quantity,
    batch.firstStepRecordId,
    payload.remark ?? null,
    person,
    context,
  );
  await db.execute(
    `INSERT INTO production_tracking_visit (tracking_card_id,production_batch_id,batch_step_record_id,personnel_id,personnel_code_snapshot,personnel_name_snapshot,arrived_by) VALUES (?,?,?,?,?,?,?)`,
    [
      cardId,
      batchId,
      batch.firstStepRecordId,
      person.personnelId,
      person.personnelCode,
      person.personnelName,
      context.actorId,
    ],
  );
  await writeProductionAudit(
    db,
    context,
    'production-tracking-card.create',
    'production_tracking_card',
    cardId,
    null,
    { cardNo, ...payload, ...person, firstStepRecordId: batch.firstStepRecordId },
  );
  return selectTrackingCard(db, cardId, true);
}

export async function createUnusedTrackingCards(
  db: PoolConnection,
  batchId: string,
  payload: CreateProductionTrackingCardsPayload,
  person: ProductionTrackingPersonnelSnapshot,
  context: CommandContext,
): Promise<ProductionTrackingCardsCreatedResult> {
  const quantities = splitTrackingCardQuantities(payload.totalQuantity, payload.quantityPerCard);
  const batch = await requireCreationBatch(db, batchId);
  const cardNos = await allocateTrackingCardNumbers(db, batchId, batch.batchNo, quantities.length);
  const cardIds: string[] = [];
  for (const [index, quantity] of quantities.entries()) {
    const cardNo = cardNos[index];
    if (!cardNo) throw new Error('追踪卡编号分配结果缺失');
    cardIds.push(
      await insertCard(
        db,
        batchId,
        cardNo,
        quantity,
        null,
        payload.remark ?? null,
        person,
        context,
      ),
    );
  }
  await writeProductionAudit(
    db,
    context,
    'production-tracking-card.create-bulk',
    'production_batches',
    batchId,
    null,
    { ...payload, ...person, cardIds, cardNos, quantities },
  );
  return { cards: await selectCreatedUnusedTrackingCards(db, cardIds) };
}
