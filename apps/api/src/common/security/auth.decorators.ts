import {
  BadRequestException,
  SetMetadata,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { UserProfile } from '@company/contracts';
import type { AuditContext, CommandContext } from '../audit/audit.types.js';
import { createRequestId } from '../http/request-context.middleware.js';

export const IS_PUBLIC = 'isPublic';
export const REQUIRED_PERMISSION = 'requiredPermission';
export const AUDIT_IN_APPLICATION = 'auditInApplication';
export const IDEMPOTENT_ENDPOINT = 'idempotentEndpoint';

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
    const request = context.switchToHttp().getRequest<{
      user?: UserProfile;
      ip?: string;
      requestId?: string;
      headers?: { 'user-agent'?: string | string[]; 'idempotency-key'?: string | string[] };
    }>();
    const userAgent = boundedHeader(request.headers?.['user-agent'], 512);
    const idempotencyKey = readIdempotencyKey(request.headers?.['idempotency-key']);
    return {
      actorId: request.user?.id ?? null,
      requestId: request.requestId ?? createRequestId(),
      ip: request.ip ?? null,
      userAgent,
      idempotencyKey,
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
    const userAgent = boundedHeader(request.headers?.['user-agent'], 512);
    const userId = request.user?.id ?? null;
    return {
      userId,
      actorId: userId,
      requestId: request.requestId ?? createRequestId(),
      ip: request.ip ?? null,
      userAgent,
    };
  },
);

export const boundedHeader = (
  value: string | string[] | undefined,
  maxLength: number,
): string | null => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ? candidate.slice(0, maxLength) : null;
};

const readIdempotencyKey = (value: string | string[] | undefined): string | undefined => {
  const candidate = (Array.isArray(value) ? value[0] : value)?.trim();
  if (candidate === undefined) return undefined;
  if (candidate.length === 0 || candidate.length > 150) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Idempotency-Key must contain between 1 and 150 characters',
    });
  }
  return candidate;
};
