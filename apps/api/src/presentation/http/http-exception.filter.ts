import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiErrorResponse } from '@company/contracts';
import { IDEMPOTENCY_RESULT_CORRUPT, IDEMPOTENCY_STORAGE_RETRYABLE } from '@company/constants';
import { DatabaseError } from '@company/database';
import { toBeijingISOString } from '../../common/time/date-time.js';
import { createRequestId, isRequestId } from '../../common/http/request-context.middleware.js';
import { IdempotencyStorageError } from '../../common/idempotency/idempotency.errors.js';
import { ConcurrencyError } from '../../common/persistence/optimistic-lock.js';

interface RequestWithContext {
  method?: string;
  originalUrl?: string;
  url?: string;
  headers?: { 'x-request-id'?: string | string[] };
  requestId?: string;
}

interface ResponseWriter {
  setHeader(name: string, value: string): void;
  status(status: number): { json(body: ApiErrorResponse): void };
}

/** The API's single error exit. Success payloads are intentionally unchanged. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<ResponseWriter>();
    const isHttpException = exception instanceof HttpException;
    const isConcurrencyError = exception instanceof ConcurrencyError;
    const isIdempotencyStorageError = exception instanceof IdempotencyStorageError;
    const status = isHttpException
      ? exception.getStatus()
      : isConcurrencyError
        ? HttpStatus.CONFLICT
        : isIdempotencyStorageError
          ? idempotencyStorageStatus(exception)
          : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId =
      request.requestId ?? readRequestId(request.headers?.['x-request-id']) ?? createRequestId();

    if (!isHttpException && !isConcurrencyError && !isIdempotencyStorageError) {
      const diagnostic = safeExceptionDiagnostic(exception);
      this.logger.error(
        [
          'Unhandled HTTP exception:',
          `requestId=${requestId}`,
          `status=${status}`,
          `method=${safeLogValue(request.method ?? 'UNKNOWN')}`,
          `path=${safeRequestPath(request.originalUrl ?? request.url ?? '')}`,
          `exceptionType=${diagnostic.exceptionType}`,
          ...(diagnostic.causeType ? [`causeType=${diagnostic.causeType}`] : []),
          ...(diagnostic.stage ? [`stage=${diagnostic.stage}`] : []),
          ...(diagnostic.code ? [`code=${diagnostic.code}`] : []),
          ...(diagnostic.errno === undefined ? [] : [`errno=${diagnostic.errno}`]),
          ...(diagnostic.sqlState ? [`sqlState=${diagnostic.sqlState}`] : []),
        ].join(' '),
        diagnostic.stack,
      );
    }

    const body: ApiErrorResponse = {
      status,
      code: errorCode(status, exception),
      message: isHttpException
        ? exceptionMessage(exception, status)
        : isConcurrencyError || isIdempotencyStorageError
          ? exception.message
          : '服务器内部错误，请稍后重试',
      requestId,
      timestamp: toBeijingISOString(new Date()),
      path: request.originalUrl ?? request.url ?? '',
    };

    response.setHeader('x-request-id', requestId);
    response.status(status).json(body);
  }
}

const readRequestId = (value: string | string[] | undefined) => {
  const requestId = Array.isArray(value) ? value[0] : value;
  return isRequestId(requestId) ? requestId : undefined;
};

interface SafeExceptionDiagnostic {
  exceptionType: string;
  causeType?: string;
  stage?: string;
  code?: string;
  errno?: number;
  sqlState?: string;
  stack?: string;
}

/**
 * 未预期异常只记录结构化诊断字段。绝不记录 message/sqlMessage；stack 首行同样会被替换，避免
 * SQL、请求载荷或凭证随驱动异常文本进入日志。
 */
const safeExceptionDiagnostic = (exception: unknown): SafeExceptionDiagnostic => {
  const cause = readCause(exception);
  const source = cause ?? exception;
  const code = safeErrorCode(readField(source, 'code') ?? readField(exception, 'code'));
  const errno = safeErrno(readField(source, 'errno') ?? readField(exception, 'errno'));
  const sqlState = safeSqlState(readField(source, 'sqlState') ?? readField(exception, 'sqlState'));
  const stage = exception instanceof DatabaseError ? databaseStage(exception.message) : undefined;
  const exceptionType = safeTypeName(exception);
  const causeType = cause ? safeTypeName(cause) : undefined;
  const stack = safeStack(exception, cause, exceptionType, causeType);
  return {
    exceptionType,
    ...(causeType ? { causeType } : {}),
    ...(stage ? { stage } : {}),
    ...(code ? { code } : {}),
    ...(errno === undefined ? {} : { errno }),
    ...(sqlState ? { sqlState } : {}),
    ...(stack ? { stack } : {}),
  };
};

const readCause = (error: unknown): unknown =>
  error && typeof error === 'object' && 'cause' in error ? Reflect.get(error, 'cause') : undefined;

const readField = (error: unknown, field: string): unknown =>
  error && typeof error === 'object' ? Reflect.get(error, field) : undefined;

const safeTypeName = (error: unknown): string => {
  if (!error || typeof error !== 'object') return safeLogValue(typeof error);
  const constructor = Reflect.get(error, 'constructor');
  const name = constructor && typeof constructor === 'function' ? constructor.name : '';
  return safeLogValue(name || 'UnknownError');
};

const safeErrorCode = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(value) ? value : undefined;

const safeErrno = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) ? value : undefined;

const safeSqlState = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[0-9A-Z]{5}$/.test(value) ? value : undefined;

const databaseStage = (message: string): string | undefined =>
  ({
    获取数据库连接失败: 'acquire-connection',
    开启数据库事务失败: 'begin-transaction',
    数据库查询失败: 'query',
    提交数据库事务失败: 'commit',
  })[message];

const safeStack = (
  exception: unknown,
  cause: unknown,
  exceptionType: string,
  causeType: string | undefined,
): string | undefined => {
  const sections = [
    safeStackSection(exception, exceptionType),
    cause ? safeStackSection(cause, causeType ?? 'UnknownError') : undefined,
  ].filter((section): section is string => Boolean(section));
  return sections.length ? sections.join('\nCaused by: ') : undefined;
};

const safeStackSection = (error: unknown, type: string): string | undefined => {
  const stack = readField(error, 'stack');
  if (typeof stack !== 'string') return undefined;
  const frames = stack
    .split(/\r?\n/)
    .slice(1, 13)
    .filter((line) => /^\s*at\s/.test(line))
    .map((line) => line.replace(/[\r\n]/g, ''));
  return frames.length ? [`${type}: [message redacted]`, ...frames].join('\n') : undefined;
};

const safeRequestPath = (value: string): string => safeLogValue(value.split('?', 1)[0] || '/');

const safeLogValue = (value: string): string =>
  value.replace(/[^A-Za-z0-9_./:-]/g, '_').slice(0, 240);

/** 可重试存储失败是瞬态（锁等待/死锁/连接中断）→ 503；结果损坏是确定性服务端数据问题 → 500。 */
const idempotencyStorageStatus = (error: IdempotencyStorageError) =>
  error.kind === 'retryable' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.INTERNAL_SERVER_ERROR;

const errorCode = (status: number, exception: unknown) => {
  if (exception instanceof IdempotencyStorageError)
    return exception.kind === 'corrupt'
      ? IDEMPOTENCY_RESULT_CORRUPT
      : IDEMPOTENCY_STORAGE_RETRYABLE;
  if (exception instanceof ConcurrencyError) return exception.code;
  if (exception instanceof HttpException) {
    const payload = exception.getResponse();
    if (
      payload &&
      typeof payload === 'object' &&
      'code' in payload &&
      typeof payload.code === 'string'
    )
      return payload.code;
  }
  return HttpStatus[status] ?? 'INTERNAL_SERVER_ERROR';
};

const exceptionMessage = (exception: HttpException, status: number) => {
  const payload = exception.getResponse();
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const { message } = payload;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return '请求参数不符合要求';
  }
  return HttpStatus[status] ?? '请求失败';
};
