import type { OperationLogListItem, OperationLogQuery, PageResult } from '@company/contracts';
import type { AuditLogEntry } from '../audit.types.js';

/** Narrow audit port shared by HTTP security handling and identity use cases. */
export abstract class AuditRepository {
  abstract listLogs(query: OperationLogQuery): Promise<PageResult<OperationLogListItem>>;
  abstract writeLog(entry: AuditLogEntry): Promise<void>;
}
