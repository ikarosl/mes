import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UserProfile } from '@company/contracts';
export const IS_PUBLIC = 'isPublic';
export const REQUIRED_PERMISSION = 'requiredPermission';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const RequirePermission = (permission: string) =>
  SetMetadata(REQUIRED_PERMISSION, permission);
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<{ user?: UserProfile }>().user,
);
