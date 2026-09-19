import { randomUUID } from 'node:crypto';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { InventoryDomainError } from '../domain/inventory.errors.js';
import { fixedIntegerQuantity } from '@company/utils';

// Production 内部共享的持久化机械操作；业务状态与完整命令事务由各 Adapter 所有。
export const pagination = (query: {
  page?: number;
  pageSize?: number;
}): { page: number; pageSize: number; offset: number } => {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  return { page, pageSize, offset: (page - 1) * pageSize };
};
export const placeholders = (values: { length: number }): string =>
  Array(values.length).fill('?').join(',');
export const numericSort = (a: string, b: string): number => Number(a) - Number(b);
export const decimal = fixedIntegerQuantity;
export const iso = (value: Date | null): string | null =>
  value ? toBeijingISOString(value) : null;
export const businessNo = (prefix: string): string =>
  `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
export const requireVersion = (current: number, expected: number, target: string): void => {
  if (current !== expected)
    throw new InventoryDomainError('CONCURRENT_MODIFICATION', `${target}版本已变化，请刷新后重试`);
};
export const requireAffected = (result: ResultSetHeader, target: string): void => {
  if (result.affectedRows !== 1)
    throw new InventoryDomainError('CONCURRENT_MODIFICATION', `${target}已被其他操作修改`);
};
export const lockIds = async (
  db: PoolConnection,
  table: 'item_batch',
  ids: string[],
): Promise<void> => {
  if (!ids.length) return;
  await db.query(
    `SELECT id FROM ${table} WHERE id IN (${placeholders(ids)}) ORDER BY id FOR UPDATE`,
    ids,
  );
};
export const groupBy = <T>(values: T[], key: (value: T) => string): Map<string, T[]> => {
  const result = new Map<string, T[]>();
  for (const value of values) result.set(key(value), [...(result.get(key(value)) ?? []), value]);
  return result;
};

export const writeInventoryAudit = (
  db: PoolConnection,
  context: CommandContext,
  action: string,
  targetType: string,
  targetId: string,
  beforeData: unknown,
  afterData: unknown,
): Promise<void> => {
  return writeTransactionalAudit(db, {
    logType: 'business',
    module: 'inventory',
    action,
    userId: context.actorId,
    targetId,
    targetType,
    result: 'success',
    beforeData,
    afterData,
    requestId: context.requestId,
    ip: context.ip,
    userAgent: context.userAgent,
  });
};
