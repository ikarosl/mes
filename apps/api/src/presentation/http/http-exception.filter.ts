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
import { toBeijingISOString } from '../../common/time/date-time.js';
import { createRequestId, isRequestId } from '../../common/http/request-context.middleware.js';
import { IdempotencyStorageError } from '../../common/idempotency/idempotency.errors.js';
import { ConcurrencyError } from '../../common/persistence/optimistic-lock.js';

interface RequestWithContext {
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
      // Do not log the original message or stack: it may contain payloads or secrets.
      this.logger.error(`Unhandled HTTP exception: requestId=${requestId}, status=${status}`);
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
