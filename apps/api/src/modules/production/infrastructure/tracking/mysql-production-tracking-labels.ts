import { createHash } from 'node:crypto';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { PageResult, ProductionTrackingAbnormalityDescriptionQuery } from '@company/contracts';
import { ProductionDomainError } from '../../domain/production.errors.js';
import type { Db } from '../shared/mysql-production-db.js';

type LabelValue = { id: string; label: string };
type LabelRow = RowDataPacket & LabelValue;

async function findLabel(
  db: PoolConnection,
  processStepId: string | null,
  label: string,
  current = false,
): Promise<LabelValue | null> {
  const [[row]] = await db.query<LabelRow[]>(
    `SELECT CAST(id AS CHAR) id,label FROM production_tracking_abnormality_label
     WHERE scope_key=? AND label_hash=?${current ? ' FOR SHARE' : ''}`,
    [processStepId ?? '0', createHash('sha256').update(label, 'utf8').digest()],
  );
  if (row && row.label !== label)
    throw new ProductionDomainError('CONFLICT', '异常标签摘要冲突，请联系管理员核对');
  return row ?? null;
}

async function hasHistoricalLabel(db: PoolConnection, label: string): Promise<boolean> {
  const [[row]] = await db.query<RowDataPacket[]>(
    `SELECT 1 FROM production_tracking_abnormality_label
     WHERE label_hash=? AND BINARY label=BINARY ? LIMIT 1`,
    [createHash('sha256').update(label, 'utf8').digest(), label],
  );
  return Boolean(row);
}

export async function requireTrackingDescriptionLabels(
  db: PoolConnection,
  processStepId: string | null,
  input: readonly string[],
  actorId: string | null,
): Promise<{ id: string; label: string }[]> {
  if (actorId === null)
    throw new ProductionDomainError('INVALID_INPUT', '登记异常必须有实际登录操作者');
  const observations: { label: string; row: LabelValue | null; hash: Buffer }[] = [];
  for (const raw of input) {
    // Retained selections may come from another scope; historical bytes stay intact.
    let row = await findLabel(db, processStepId, raw);
    const trimmed = raw.trim();
    const preserveRaw = Boolean(row) || (raw !== trimmed && (await hasHistoricalLabel(db, raw)));
    const label = preserveRaw ? raw : trimmed;
    row ??= label === raw ? null : await findLabel(db, processStepId, label);
    if (!label) throw new ProductionDomainError('INVALID_INPUT', '异常描述标签不能为空');
    observations.push({ label, row, hash: createHash('sha256').update(label, 'utf8').digest() });
  }
  // Different tasks share the same dictionary. Insert in one stable hash order while
  // preserving the reporter's label order in the immutable assignment facts below.
  const byLabel = new Map<string, LabelValue>();
  const ordered = [...observations].sort((a, b) => Buffer.compare(a.hash, b.hash));
  for (const observation of ordered) {
    const { label, hash } = observation;
    let row = observation.row ?? byLabel.get(label) ?? null;
    if (!row) {
      try {
        const [created] = await db.execute<ResultSetHeader>(
          `INSERT INTO production_tracking_abnormality_label
           (process_step_id,label_hash,label,created_by) VALUES (?,?,?,?)`,
          [processStepId, hash, label, actorId],
        );
        row = { id: String(created.insertId), label };
      } catch (error) {
        if ((error as { code?: unknown })?.code !== 'ER_DUP_ENTRY') throw error;
        // Another task can register the same process label while this task is locked.
        row = await findLabel(db, processStepId, label, true);
        if (!row) throw error;
      }
    }
    byLabel.set(label, row);
  }
  const seen = new Set<string>();
  return observations.flatMap(({ label }) => {
    const row = byLabel.get(label);
    if (!row) throw new Error('异常标签规范化结果不完整');
    if (seen.has(row.id)) return [];
    seen.add(row.id);
    return [row];
  });
}

export async function selectTrackingDescriptionOptions(
  db: Db,
  processStepId: string | null,
  query: ProductionTrackingAbnormalityDescriptionQuery,
): Promise<PageResult<string>> {
  const where = `scope_key=?${query.keyword ? ' AND label LIKE ?' : ''}`;
  const values = query.keyword
    ? [processStepId ?? '0', `%${query.keyword}%`]
    : [processStepId ?? '0'];
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) total FROM production_tracking_abnormality_label WHERE ${where}`,
    values,
  );
  const [rows] = await db.query<LabelRow[]>(
    `SELECT CAST(id AS CHAR) id,label FROM production_tracking_abnormality_label
     WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  return { items: rows.map((row) => row.label), total: Number(count?.total ?? 0), page, pageSize };
}

export async function selectTrackingCardLabels(
  db: Db,
  cardIds: readonly string[],
  lock = false,
): Promise<(RowDataPacket & { cardId: string; abnormalityId: string; label: string })[]> {
  if (!cardIds.length) return [];
  const [rows] = await db.query<
    (RowDataPacket & { cardId: string; abnormalityId: string; label: string })[]
  >(
    `SELECT CAST(a.tracking_card_id AS CHAR) cardId,CAST(a.id AS CHAR) abnormalityId,l.label
     FROM production_tracking_abnormality a
     JOIN production_tracking_abnormality_label_assignment link ON link.abnormality_id=a.id
     JOIN production_tracking_abnormality_label l ON l.id=link.label_id
     WHERE a.tracking_card_id IN (${cardIds.map(() => '?').join(',')})
     ORDER BY a.id,link.label_order${lock ? ' FOR SHARE' : ''}`,
    [...cardIds],
  );
  return rows;
}
