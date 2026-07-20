import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { permissionMatches } from '@company/constants';
import { AuthService } from '../../application/auth.service.js';
import { IS_PUBLIC, REQUIRED_PERMISSION } from './auth.decorators.js';
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: Awaited<ReturnType<AuthService['authenticate']>>;
    }>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('缺少访问令牌');
    const user = await this.auth.authenticate(token);
    const permission = this.reflector.getAllAndOverride<string | undefined>(REQUIRED_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permissionMatches(user.permissions, permission)) return false;
    request.user = user;
    return true;
  }
}
