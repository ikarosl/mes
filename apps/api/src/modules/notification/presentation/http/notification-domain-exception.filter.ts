import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { ApiErrorResponse } from '@company/contracts';
import { NotificationDomainError } from '../../domain/notification.errors.js';
import { createRequestId } from '../../../../common/http/request-context.middleware.js';
import { toBeijingISOString } from '../../../../common/time/date-time.js';

@Catch(NotificationDomainError)
export class NotificationDomainExceptionFilter implements ExceptionFilter {
  catch(error: NotificationDomainError, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<{ requestId?: string; originalUrl?: string }>();
    const response = http.getResponse<{
      setHeader(k: string, v: string): void;
      status(s: number): { json(body: ApiErrorResponse): void };
    }>();
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN'
          ? 403
          : error.code === 'CONCURRENT_MODIFICATION' || error.code === 'NOTIFICATION_EVENT_CONFLICT'
            ? 409
            : 400;
    const requestId = request.requestId ?? createRequestId();
    response.setHeader('x-request-id', requestId);
    response.status(status).json({
      status,
      code: error.code,
      message: error.message,
      requestId,
      timestamp: toBeijingISOString(new Date()),
      path: request.originalUrl ?? '',
    });
  }
}
