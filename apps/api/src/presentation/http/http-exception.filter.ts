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

/** API 的统一错误出口；成功载荷保持原样，不做额外改动。 */
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
    const isMulterFileTooLarge = isMulterFileSizeError(exception);
    const status = isMulterFileTooLarge
      ? HttpStatus.PAYLOAD_TOO_LARGE
      : isHttpException
        ? exception.getStatus()
        : isConcurrencyError
          ? HttpStatus.CONFLICT
          : isIdempotencyStorageError
            ? idempotencyStorageStatus(exception)
            : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId =
      request.requestId ?? readRequestId(request.headers?.['x-request-id']) ?? createRequestId();

    if (
      !isHttpException &&
      !isConcurrencyError &&
      !isIdempotencyStorageError &&
      !isMulterFileTooLarge
    ) {
      const diagnostic = safeExceptionDiagnostic(exception);
      this.logger.error(
        [
          '未处理的 HTTP 异常：',
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
      message: isMulterFileTooLarge
        ? '文件大小不能超过 20MB'
        : isHttpException
          ? exceptionMessage(exception, status)
          : isConcurrencyError || isIdempotencyStorageError
            ? translateBackendMessage(exception.message, status)
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

const isMulterFileSizeError = (exception: unknown): boolean =>
  Boolean(
    exception &&
    typeof exception === 'object' &&
    Reflect.get(exception, 'name') === 'MulterError' &&
    Reflect.get(exception, 'code') === 'LIMIT_FILE_SIZE',
  );

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
  return sections.length ? sections.join('\n原因：') : undefined;
};

const safeStackSection = (error: unknown, type: string): string | undefined => {
  const stack = readField(error, 'stack');
  if (typeof stack !== 'string') return undefined;
  const frames = stack
    .split(/\r?\n/)
    .slice(1, 13)
    .filter((line) => /^\s*at\s/.test(line))
    .map((line) => line.replace(/[\r\n]/g, ''));
  return frames.length ? [`${type}：[消息已脱敏]`, ...frames].join('\n') : undefined;
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
  if (typeof payload === 'string') return translateBackendMessage(payload, status);
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const { message } = payload;
    if (typeof message === 'string') return translateBackendMessage(message, status);
    if (Array.isArray(message)) return '请求参数不符合要求';
  }
  return defaultHttpMessage(status);
};

const defaultHttpMessage = (status: number): string =>
  ({
    [HttpStatus.BAD_REQUEST]: '请求参数不符合要求',
    [HttpStatus.UNAUTHORIZED]: '未授权，请先登录',
    [HttpStatus.FORBIDDEN]: '无权执行此操作',
    [HttpStatus.NOT_FOUND]: '请求的资源不存在',
    [HttpStatus.METHOD_NOT_ALLOWED]: '不支持当前请求方法',
    [HttpStatus.REQUEST_TIMEOUT]: '请求超时，请稍后重试',
    [HttpStatus.CONFLICT]: '请求存在冲突，请刷新后重试',
    [HttpStatus.PAYLOAD_TOO_LARGE]: '文件大小不能超过 20MB',
    [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: '不支持当前媒体类型',
    [HttpStatus.UNPROCESSABLE_ENTITY]: '请求内容无法处理',
    [HttpStatus.TOO_MANY_REQUESTS]: '请求过于频繁，请稍后重试',
    [HttpStatus.INTERNAL_SERVER_ERROR]: '服务器内部错误，请稍后重试',
    [HttpStatus.BAD_GATEWAY]: '上游服务异常，请稍后重试',
    [HttpStatus.SERVICE_UNAVAILABLE]: '服务暂不可用，请稍后重试',
    [HttpStatus.GATEWAY_TIMEOUT]: '上游服务响应超时，请稍后重试',
  })[status] ?? '请求失败';

const translateBackendMessage = (message: string, status: number): string => {
  const normalized = message.trim();
  const translations: Record<string, string> = {
    'File too large': '文件大小不能超过 20MB',
    'Payload Too Large': '文件大小不能超过 20MB',
    'Request Entity Too Large': '请求内容过大',
    'Bad Request': '请求参数不符合要求',
    Unauthorized: '未授权，请先登录',
    'Forbidden resource': '无权执行此操作',
    Forbidden: '无权执行此操作',
    'Not Found': '请求的资源不存在',
    'Method Not Allowed': '不支持当前请求方法',
    'Internal Server Error': '服务器内部错误，请稍后重试',
    'Refresh and retry': '请刷新后重试',
  };
  if (translations[normalized]) return translations[normalized];
  return /\b[A-Za-z]{2,}\b(?:\s+\b[A-Za-z]{2,}\b)+/.test(normalized)
    ? defaultHttpMessage(status)
    : message;
};
