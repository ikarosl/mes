import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserProfile } from '@company/contracts';
import { IDEMPOTENCY_RESULT_CORRUPT, IDEMPOTENCY_STORAGE_RETRYABLE } from '@company/constants';
import { catchError, from, mergeMap, throwError } from 'rxjs';
import { AuditRepository } from '../../application/ports/audit.repository.js';
import { ConcurrencyError } from '../../../../common/persistence/optimistic-lock.js';
import { IdempotencyStorageError } from '../../../../common/idempotency/idempotency.errors.js';
import { AUDIT_IN_APPLICATION } from '../../../../common/security/auth.decorators.js';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);
  constructor(
    private readonly repository: AuditRepository,
    private readonly reflector: Reflector,
  ) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp();
    const request = http.getRequest<AuditRequest>();
    const response = http.getResponse<{ statusCode?: number }>();
    if (request.method === 'GET') return next.handle();
    const entry = {
      logType: request.path?.startsWith('/api/auth') ? 'auth' : 'operation',
      module: request.path?.split('/').filter(Boolean)[1] ?? 'unknown',
      action: `${request.method} ${request.path ?? ''}`,
      userId: request.user?.id ?? null,
      ip: readIp(request),
      requestId: request.requestId ?? null,
      httpMethod: request.method,
      route: request.route?.path ?? request.path ?? null,
      userAgent: readHeader(request.headers?.['user-agent']),
    };
    const startedAt = Date.now();
    const applicationAudited = this.reflector.getAllAndOverride<boolean>(AUDIT_IN_APPLICATION, [
      context.getHandler(),
      context.getClass(),
    ]);
    return next.handle().pipe(
      mergeMap((value) =>
        applicationAudited
          ? [value]
          : from(
              this.writeBestEffort({
                ...entry,
                result: 'success',
                httpStatus: response.statusCode ?? 200,
                durationMs: Date.now() - startedAt,
              }),
            ).pipe(mergeMap(() => [value])),
      ),
      catchError((error: unknown) =>
        from(
          this.writeBestEffort({
            ...entry,
            result: 'failed',
            httpStatus:
              error instanceof HttpException
                ? error.getStatus()
                : error instanceof ConcurrencyError
                  ? HttpStatus.CONFLICT
                  : error instanceof IdempotencyStorageError
                    ? idempotencyStorageStatus(error)
                    : 500,
            durationMs: Date.now() - startedAt,
            errorCode: auditErrorCode(error),
            remark: auditFailureRemark(error),
          }),
        ).pipe(mergeMap(() => throwError(() => error))),
      ),
    );
  }
  private async writeBestEffort(entry: Parameters<AuditRepository['writeLog']>[0]) {
    try {
      await this.repository.writeLog(entry);
    } catch {
      this.logger.warn('操作日志写入失败');
    }
  }
}

/** 在不持久化原始异常消息或凭证的前提下，保留操作日志的诊断价值。 */
export const auditFailureRemark = (error: unknown) =>
  error instanceof HttpException
    ? `HTTP ${error.getStatus()}`
    : error instanceof ConcurrencyError
      ? 'HTTP 409'
      : error instanceof IdempotencyStorageError
        ? `HTTP ${idempotencyStorageStatus(error)}`
        : '未处理的请求失败';

/** 幂等存储错误与 HttpExceptionFilter 保持一致的 HTTP 状态：可重试 503，结果损坏 500。 */
export const idempotencyStorageStatus = (error: IdempotencyStorageError) =>
  error.kind === 'retryable' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.INTERNAL_SERVER_ERROR;

export const auditErrorCode = (error: unknown): string => {
  if (error instanceof ConcurrencyError) return error.code;
  if (error instanceof IdempotencyStorageError)
    return error.kind === 'corrupt' ? IDEMPOTENCY_RESULT_CORRUPT : IDEMPOTENCY_STORAGE_RETRYABLE;
  if (!(error instanceof HttpException)) return 'INTERNAL_SERVER_ERROR';
  const payload = error.getResponse();
  if (
    payload &&
    typeof payload === 'object' &&
    'code' in payload &&
    typeof payload.code === 'string'
  ) {
    return payload.code;
  }
  return HttpStatus[error.getStatus()] ?? `HTTP_${error.getStatus()}`;
};

interface AuditRequest {
  method: string;
  path?: string;
  route?: { path?: string };
  ip?: string;
  requestId?: string;
  headers?: { 'user-agent'?: string | string[] };
  user?: UserProfile;
}
const readIp = (request: AuditRequest) => request.ip ?? null;
const readHeader = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? null;
