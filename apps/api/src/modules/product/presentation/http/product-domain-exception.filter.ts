import { Catch, type ArgumentsHost, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { ApiErrorResponse } from '@company/contracts';
import {
  createRequestId,
  isRequestId,
} from '../../../../common/http/request-context.middleware.js';
import { toBeijingISOString } from '../../../../common/time/beijing-time.js';
import { ProductDomainError, type ProductErrorCode } from '../../domain/product.errors.js';

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

@Catch(ProductDomainError)
export class ProductDomainExceptionFilter implements ExceptionFilter {
  catch(exception: ProductDomainError, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<ResponseWriter>();
    const status = statusFor(exception.code);
    const requestId =
      request.requestId ?? readRequestId(request.headers?.['x-request-id']) ?? createRequestId();

    response.setHeader('x-request-id', requestId);
    response.status(status).json({
      status,
      code: exception.code,
      message: exception.message,
      requestId,
      timestamp: toBeijingISOString(new Date()),
      path: request.originalUrl ?? request.url ?? '',
    });
  }
}

const statusFor = (code: ProductErrorCode): number => {
  if (code === 'NOT_FOUND') return HttpStatus.NOT_FOUND;
  if (code === 'CONFLICT' || code === 'ROUTE_IN_USE' || code === 'DEFAULT_ROUTE_IN_USE')
    return HttpStatus.CONFLICT;
  if (code === 'STORAGE_UNAVAILABLE') return HttpStatus.BAD_GATEWAY;
  return HttpStatus.BAD_REQUEST;
};

const readRequestId = (value: string | string[] | undefined): string | undefined => {
  const requestId = Array.isArray(value) ? value[0] : value;
  return isRequestId(requestId) ? requestId : undefined;
};
