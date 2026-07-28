import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiErrorResponse } from '@company/contracts';
import { toBeijingISOString } from '../../common/time/beijing-time.js';
import { isRequestId } from '../../common/http/request-context.middleware.js';

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
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId =
      request.requestId ?? readRequestId(request.headers?.['x-request-id']) ?? 'unknown';

    if (!isHttpException) {
      // Do not log the original message or stack: it may contain payloads or secrets.
      this.logger.error(`Unhandled HTTP exception: requestId=${requestId}, status=${status}`);
    }

    const body: ApiErrorResponse = {
      status,
      code: errorCode(status, exception),
      message: isHttpException ? exceptionMessage(exception, status) : '服务器内部错误，请稍后重试',
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

const errorCode = (status: number, exception: unknown) => {
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
