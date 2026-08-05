import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IDEMPOTENCY_NOT_SUPPORTED } from '@company/constants';
import { IDEMPOTENT_ENDPOINT, IS_PUBLIC } from '../../../../common/security/auth.decorators.js';

/**
 * 端点级 Idempotency-Key 启用门禁（阶段 A 矩阵，见 docs/http-idempotency-implementation-plan.md §8）。
 *
 * - 公开端点（health/login/refresh/logout）直接放行，幂等框架不覆盖匿名命令；
 * - 未启用端点：携带任意 Idempotency-Key（含空串/超长）→ 400 IDEMPOTENCY_NOT_SUPPORTED，不登记；
 * - 已启用端点（@IdempotentEndpoint）：缺少键或长度非法 → 400 VALIDATION_ERROR；合法键放行进入闭环。
 *
 * 注册顺序必须在 AuthGuard 之后，保证 401/403 优先于幂等检查。
 */
@Injectable()
export class IdempotencyKeyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const enabled = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_ENDPOINT, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<{
      headers?: { 'idempotency-key'?: string | string[] };
    }>();
    const header = request.headers?.['idempotency-key'];
    const key = (Array.isArray(header) ? header[0] : header)?.trim();
    if (!enabled) {
      if (key !== undefined) {
        throw new BadRequestException({
          code: IDEMPOTENCY_NOT_SUPPORTED,
          message: '该接口不支持 Idempotency-Key',
        });
      }
      return true;
    }
    if (key === undefined) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '缺少必填的 Idempotency-Key',
      });
    }
    if (key.length === 0 || key.length > 150) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Idempotency-Key must contain between 1 and 150 characters',
      });
    }
    return true;
  }
}
