import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IDEMPOTENCY_NOT_SUPPORTED } from '@company/constants';
import {
  IDEMPOTENT_ENDPOINT,
  VALIDATED_IDEMPOTENCY_KEY,
  type CommandContextRequest,
  type IdempotentEndpointMeta,
} from '../../common/security/auth.decorators.js';

/**
 * 端点级 Idempotency-Key 启用门禁（阶段 A 矩阵，见 docs/http-idempotency-implementation-plan.md §8）。
 *
 * 严格契约：任何未启用端点——包括 `@Public()` 匿名端点——携带任意 Idempotency-Key（含空串/超长）都返回
 * `400 IDEMPOTENCY_NOT_SUPPORTED`，不登记、不静默忽略；已启用端点（`@IdempotentEndpoint({ scope })`）缺少键或
 * 长度非法返回 `400 VALIDATION_ERROR`，合法键放行进入闭环。
 *
 * 启用判定只按元数据存在性：scope 形状由装饰器在装饰时校验并独占写入，此处不重复校验。
 *
 * 公开端点只是不接入幂等闭环（闭环要求已认证 actorId，匿名命令不属于该框架范围），但仍不得静默接受该头：
 * 客户端一旦发送，说明其误以为请求受幂等保护，必须明确拒绝，与其余未启用端点行为一致。
 *
 * 注册顺序必须在 AuthGuard 之后，保证 401/403 优先于幂等检查。
 */
@Injectable()
export class IdempotencyKeyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const metadata = this.reflector.getAllAndOverride<IdempotentEndpointMeta>(IDEMPOTENT_ENDPOINT, [
      context.getHandler(),
      context.getClass(),
    ]);
    const enabled = metadata !== undefined;
    const request = context.switchToHttp().getRequest<
      CommandContextRequest & {
        headers?: { 'idempotency-key'?: string | string[] };
      }
    >();
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
    request[VALIDATED_IDEMPOTENCY_KEY] = key;
    return true;
  }
}
