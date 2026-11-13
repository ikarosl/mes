import { PRODUCTION_TRACKING_CARD_BATCH_LIMIT } from '@company/constants';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { ProductionDomainError } from '../../domain/production.errors.js';

const MAX_SEQUENCE = 18446744073709551615n;
const MAX_CARD_NUMBER_LENGTH = 100;

/** 调用方持有任务锁；计数、卡、到站、成功审计与幂等快照共用当前事务。 */
export async function allocateTrackingCardNumbers(
  db: PoolConnection,
  batchId: string,
  batchNo: string,
  count: number,
): Promise<string[]> {
  if (!Number.isSafeInteger(count) || count < 1 || count > PRODUCTION_TRACKING_CARD_BATCH_LIMIT)
    throw new ProductionDomainError('INVALID_INPUT', '本次追踪卡张数超出允许范围');
  await db.execute(
    `INSERT INTO production_tracking_card_sequence (production_batch_id,last_sequence)
     VALUES (?,0) ON DUPLICATE KEY UPDATE last_sequence=last_sequence`,
    [batchId],
  );
  const [[row]] = await db.query<(RowDataPacket & { last_sequence: string })[]>(
    `SELECT CAST(last_sequence AS CHAR) last_sequence FROM production_tracking_card_sequence
     WHERE production_batch_id=? FOR UPDATE`,
    [batchId],
  );
  if (!row) throw new Error('追踪卡序号计数未生成');
  const previous = BigInt(row.last_sequence);
  const last = previous + BigInt(count);
  if (last > MAX_SEQUENCE)
    throw new ProductionDomainError('CONFLICT', '该任务追踪卡序号已用尽，请联系管理员');
  const numbers = Array.from({ length: count }, (_, index) => {
    const sequence = (previous + BigInt(index) + 1n).toString().padStart(3, '0');
    const number = `${batchNo}-k-${sequence}`;
    if (Array.from(number).length > MAX_CARD_NUMBER_LENGTH)
      throw new ProductionDomainError('CONFLICT', '追踪卡号超过允许长度，请联系管理员');
    return number;
  });
  await db.execute(
    'UPDATE production_tracking_card_sequence SET last_sequence=? WHERE production_batch_id=?',
    [last.toString(), batchId],
  );
  return numbers;
}
