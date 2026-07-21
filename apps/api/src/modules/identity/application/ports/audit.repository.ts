import type { AuditLogEntry } from '../audit.types.js';

/** Narrow audit port shared by HTTP security handling and identity use cases. */
export abstract class AuditRepository {
  abstract listLogs(): Promise<Record<string, unknown>[]>;
  abstract writeLog(entry: AuditLogEntry): Promise<void>;
}
