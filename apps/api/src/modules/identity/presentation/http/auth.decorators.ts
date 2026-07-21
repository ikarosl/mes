import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UserProfile } from '@company/contracts';
import type { AuditContext } from '../../application/audit.types.js';
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
export const CurrentAuditContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuditContext => {
    const request = context.switchToHttp().getRequest<{ user?: UserProfile; ip?: string }>();
    return { userId: request.user?.id ?? null, ip: request.ip ?? null };
  },
);
