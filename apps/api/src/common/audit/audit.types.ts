import type { OperationResult } from '@company/contracts';

export interface CommandContext {
  actorId: string | null;
  requestId: string;
  ip: string | null;
  userAgent: string | null;
}

/**
 * 仅表示已经由 HTTP 幂等门禁验证过的、显式启用幂等能力的认证命令。
 * 普通命令、application port 与 repository 只能依赖 CommandContext。
 */
export interface IdempotentCommandContext extends CommandContext {
  actorId: string;
  idempotencyKey: string;
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
