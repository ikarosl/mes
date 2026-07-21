import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { permissionMatches } from '@company/constants';
import { AuthService } from '../../application/auth.service.js';
import { AuditRepository } from '../../application/ports/audit.repository.js';
import { IS_PUBLIC, REQUIRED_PERMISSION } from './auth.decorators.js';
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly audit: AuditRepository,
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
      method: string;
      path?: string;
      ip?: string;
      user?: Awaited<ReturnType<AuthService['authenticate']>>;
    }>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      await this.writeDenied(request, null, 'HTTP 401');
      throw new UnauthorizedException('缺少访问令牌');
    }
    let user: Awaited<ReturnType<AuthService['authenticate']>>;
    try {
      user = await this.auth.authenticate(token);
    } catch (error) {
      await this.writeDenied(request, null, 'HTTP 401');
      throw error;
    }
    const permission = this.reflector.getAllAndOverride<string | undefined>(REQUIRED_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permissionMatches(user.permissions, permission)) {
      await this.writeDenied(request, user.id, 'HTTP 403');
      return false;
    }
    request.user = user;
    return true;
  }
  private async writeDenied(
    request: { method: string; path?: string; ip?: string },
    userId: string | null,
    remark: string,
  ) {
    try {
      await this.audit.writeLog({
        logType: 'security',
        module: request.path?.split('/').filter(Boolean)[1] ?? 'unknown',
        action: `${request.method} ${request.path ?? ''}`,
        userId,
        result: 'failed',
        ip: request.ip ?? null,
        remark,
      });
    } catch {
      this.logger.warn('Security audit log write failed');
    }
  }
}
