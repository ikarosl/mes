export interface AuditContext {
  userId: string | null;
  ip: string | null;
}

export interface AuditLogEntry {
  logType: string;
  module: string;
  action: string;
  userId?: string | null;
  targetId?: string | null;
  targetType?: string | null;
  result: OperationResult;
  beforeData?: unknown;
  afterData?: unknown;
  ip?: string | null;
  remark?: string | null;
}
import type { OperationResult } from '@company/contracts';
