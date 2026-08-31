import type { OperationLogListItem, OperationLogQuery, PageResult } from '@company/contracts';
import type { AuditLogEntry } from '../../../../common/audit/audit.types.js';

/** 供 HTTP 安全处理与身份用例共享的窄审计端口。 */
export abstract class AuditRepository {
  abstract listLogs(query: OperationLogQuery): Promise<PageResult<OperationLogListItem>>;
  abstract writeLog(entry: AuditLogEntry): Promise<void>;
}
