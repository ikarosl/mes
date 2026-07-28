import type { Pool } from 'mysql2/promise';
import type { AuditLogEntry } from './audit.types.js';

export const writeTransactionalAudit = async (
  executor: Pick<Pool, 'execute'>,
  entry: AuditLogEntry,
): Promise<void> => {
  await executor.execute(
    `INSERT INTO operation_logs
     (log_type,module,action,user_id,target_id,target_type,result,before_data,after_data,ip,request_id,http_method,route,http_status,duration_ms,user_agent,error_code,remark)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      entry.logType,
      entry.module,
      entry.action,
      entry.userId ?? null,
      entry.targetId ?? null,
      entry.targetType ?? null,
      entry.result,
      jsonValue(entry.beforeData),
      jsonValue(entry.afterData),
      entry.ip ?? null,
      entry.requestId ?? null,
      entry.httpMethod ?? null,
      entry.route ?? null,
      entry.httpStatus ?? null,
      entry.durationMs ?? null,
      entry.userAgent ?? null,
      entry.errorCode ?? null,
      entry.remark ?? null,
    ],
  );
};

const jsonValue = (value: unknown): string | null =>
  value === undefined || value === null ? null : JSON.stringify(value);
