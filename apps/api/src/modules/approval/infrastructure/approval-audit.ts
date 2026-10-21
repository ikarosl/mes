import type { PoolConnection } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';

/** 配置与申请的成功审计共用此入口，必须使用调用方当前事务连接。 */
export async function writeApprovalAudit(
  db: PoolConnection,
  context: CommandContext,
  action: string,
  targetId: string,
  afterData: Record<string, unknown>,
): Promise<void> {
  await writeTransactionalAudit(db, {
    logType: 'business',
    module: 'approval',
    action,
    userId: context.actorId,
    targetId,
    targetType: 'approval',
    result: 'success',
    afterData,
    requestId: context.requestId,
    ip: context.ip,
    userAgent: context.userAgent,
  });
}
