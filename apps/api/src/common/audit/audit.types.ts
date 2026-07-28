import type { OperationResult } from '@company/contracts';

export interface CommandContext {
  actorId: string | null;
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  idempotencyKey?: string;
}

/** @deprecated Use CommandContext for all new commands. */
export interface AuditContext {
  userId: string | null;
  actorId?: string | null;
  requestId?: string;
  ip: string | null;
  userAgent?: string | null;
  idempotencyKey?: string;
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
  requestId?: string | null;
  httpMethod?: string | null;
  route?: string | null;
  httpStatus?: number | null;
  durationMs?: number | null;
  userAgent?: string | null;
  errorCode?: string | null;
  remark?: string | null;
}
