import {
  BadRequestException,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { UserProfile } from '@company/contracts';
import type { CommandContext, IdempotentCommandContext } from '../audit/audit.types.js';
import { createRequestId } from '../http/request-context.middleware.js';

export const IS_PUBLIC = 'isPublic';
export const REQUIRED_PERMISSION = 'requiredPermission';
export const AUDIT_IN_APPLICATION = 'auditInApplication';
export const IDEMPOTENT_ENDPOINT = 'idempotentEndpoint';

/** Guard 校验后的请求内幂等键。Symbol 避免被普通日志或序列化意外暴露。 */
export const VALIDATED_IDEMPOTENCY_KEY = Symbol('validatedIdempotencyKey');

export interface CommandContextRequest {
  user?: UserProfile;
  ip?: string;
  requestId?: string;
  headers?: { 'user-agent'?: string | string[] };
  [VALIDATED_IDEMPOTENCY_KEY]?: string;
}

export const Public = () => SetMetadata(IS_PUBLIC, true);
/**
 * 声明所需权限。传数组表示 any-of（任意之一命中即放行），用于跨页面 /options 等被多个
 * 消费页面共用的只读端点。单个字符串为既有语义（必须命中）。
 */
export const RequirePermission = (permission: string | readonly string[]) =>
  SetMetadata(REQUIRED_PERMISSION, permission);
export const AuditInApplication = () => SetMetadata(AUDIT_IN_APPLICATION, true);

/**
 * @IdempotentEndpoint 元数据形状：scope 是稳定契约标识（如 `production.batch.create.v1`），
 * 与 application 层幂等契约常量（*-idempotency.contract.ts）一一对应。架构门禁
 * （scripts/check-api-architecture.mjs）交叉校验「声明启用端点 — scope — executor 接入」：
 * 装饰器实参必须引用契约常量，禁止字面量。
 */
export interface IdempotentEndpointMeta {
  readonly scope: string;
}

/**
 * 声明端点接入幂等闭环。scope 必须引用本模块幂等契约常量（如
 * `{ scope: CREATE_BATCH_IDEMPOTENCY_SCOPE }`）。
 *
 * 空/非法 scope 在装饰时（类定义/模块加载期）抛错：失败时刻最早、错误信息最接近出错点；
 * Guard 只按元数据存在性启用端点，不重复校验——元数据形状由本装饰器独占写入，
 * 任何绕过装饰器的元数据写入都是门禁外的故意行为。
 */
export const IdempotentEndpoint = ({ scope }: IdempotentEndpointMeta) => {
  if (typeof scope !== 'string' || scope.trim().length === 0) {
    throw new Error(
      'IdempotentEndpoint 必须携带非空 scope（如 { scope: CREATE_BATCH_IDEMPOTENCY_SCOPE }）',
    );
  }
  return SetMetadata(IDEMPOTENT_ENDPOINT, { scope });
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<{ user?: UserProfile }>().user,
);

export const CurrentCommandContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CommandContext => {
    const request = context.switchToHttp().getRequest<CommandContextRequest>();
    return commandContextFromRequest(request);
  },
);

export const CurrentIdempotentCommandContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): IdempotentCommandContext => {
    const request = context.switchToHttp().getRequest<CommandContextRequest>();
    const command = commandContextFromRequest(request);
    if (!command.actorId) {
      throw new UnauthorizedException('幂等命令缺少认证用户上下文');
    }
    const idempotencyKey = request[VALIDATED_IDEMPOTENCY_KEY];
    if (!idempotencyKey) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '幂等命令缺少已校验的 Idempotency-Key',
      });
    }
    return { ...command, actorId: command.actorId, idempotencyKey };
  },
);

const commandContextFromRequest = (request: CommandContextRequest): CommandContext => ({
  actorId: request.user?.id ?? null,
  requestId: request.requestId ?? createRequestId(),
  ip: request.ip ?? null,
  userAgent: boundedHeader(request.headers?.['user-agent'], 512),
});

export const boundedHeader = (
  value: string | string[] | undefined,
  maxLength: number,
): string | null => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ? candidate.slice(0, maxLength) : null;
};
