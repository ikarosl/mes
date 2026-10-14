import type { PoolConnection } from 'mysql2/promise';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../../common/audit/transactional-audit-writer.js';

export const writeProductionAudit = (
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
    module: 'production',
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
