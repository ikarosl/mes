import type { Pool } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';

export const writeAttachmentAudit = (
  db: Pick<Pool, 'execute'>,
  audit: CommandContext,
  action: string,
  id: string,
  beforeData: unknown,
  afterData: unknown,
  result: 'success' | 'failed' = 'success',
): Promise<void> =>
  writeTransactionalAudit(db, {
    logType: 'business',
    module: 'attachment',
    action,
    userId: audit.actorId,
    targetId: id,
    targetType: 'attachment',
    result,
    beforeData,
    afterData,
    ip: audit.ip,
    requestId: audit.requestId,
    userAgent: audit.userAgent,
  });
