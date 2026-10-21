import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { ApiErrorResponse } from '@company/contracts';
import {
  createRequestId,
  isRequestId,
} from '../../../../common/http/request-context.middleware.js';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
import { InventoryDomainError } from '../../domain/inventory.errors.js';

@Catch(InventoryDomainError)
export class InventoryDomainExceptionFilter implements ExceptionFilter {
  catch(exception: InventoryDomainError, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{
      requestId?: string;
      headers?: { 'x-request-id'?: string | string[] };
      originalUrl?: string;
      url?: string;
    }>();
    const response = http.getResponse<{
      setHeader(name: string, value: string): void;
      status(status: number): { json(body: ApiErrorResponse): void };
    }>();
    const header = request.headers?.['x-request-id'];
    const supplied = Array.isArray(header) ? header[0] : header;
    const requestId = request.requestId ?? (isRequestId(supplied) ? supplied : createRequestId());
    const status =
      exception.code === 'NOT_FOUND' ? 404 : exception.code === 'INVALID_INPUT' ? 400 : 409;
    response.setHeader('x-request-id', requestId);
    response.status(status).json({
      status,
      code: exception.code,
      message: exception.message,
      requestId,
      timestamp: toBeijingISOString(new Date()),
      path: request.originalUrl ?? request.url ?? '',
      ...(exception.details ? { details: exception.details } : {}),
    });
  }
}
