import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UserProfile } from '@company/contracts';
import type { AuditContext, CommandContext } from '../audit/audit.types.js';

export const IS_PUBLIC = 'isPublic';
export const REQUIRED_PERMISSION = 'requiredPermission';
export const AUDIT_IN_APPLICATION = 'auditInApplication';

export const Public = () => SetMetadata(IS_PUBLIC, true);
export const RequirePermission = (permission: string) =>
  SetMetadata(REQUIRED_PERMISSION, permission);
export const AuditInApplication = () => SetMetadata(AUDIT_IN_APPLICATION, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<{ user?: UserProfile }>().user,
);

export const CurrentCommandContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CommandContext => {
    const request = context.switchToHttp().getRequest<{
      user?: UserProfile;
      ip?: string;
      requestId?: string;
      headers?: { 'user-agent'?: string | string[]; 'idempotency-key'?: string | string[] };
    }>();
    const userAgent = request.headers?.['user-agent'];
    const idempotencyKey = request.headers?.['idempotency-key'];
    return {
      actorId: request.user?.id ?? null,
      requestId: request.requestId ?? 'unknown',
      ip: request.ip ?? null,
      userAgent: Array.isArray(userAgent) ? (userAgent[0] ?? null) : (userAgent ?? null),
      idempotencyKey: Array.isArray(idempotencyKey) ? idempotencyKey[0] : idempotencyKey,
    };
  },
);

/** @deprecated Use CurrentCommandContext. */
export const CurrentAuditContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuditContext => {
    const request = context.switchToHttp().getRequest<{
      user?: UserProfile;
      ip?: string;
      requestId?: string;
      headers?: { 'user-agent'?: string | string[] };
    }>();
    const userAgent = request.headers?.['user-agent'];
    const userId = request.user?.id ?? null;
    return {
      userId,
      actorId: userId,
      requestId: request.requestId ?? 'unknown',
      ip: request.ip ?? null,
      userAgent: Array.isArray(userAgent) ? (userAgent[0] ?? null) : (userAgent ?? null),
    };
  },
);
