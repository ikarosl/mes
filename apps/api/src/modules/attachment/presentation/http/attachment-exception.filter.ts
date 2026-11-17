import { Catch, type ArgumentsHost, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { ApiErrorResponse } from '@company/contracts';
import {
  createRequestId,
  isRequestId,
} from '../../../../common/http/request-context.middleware.js';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
import { AttachmentError, type AttachmentErrorCode } from '../../domain/attachment.errors.js';

@Catch(AttachmentError)
export class AttachmentExceptionFilter implements ExceptionFilter {
  catch(error: AttachmentError, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{
      requestId?: string;
      originalUrl?: string;
      url?: string;
      headers?: { 'x-request-id'?: string | string[] };
    }>();
    const response = http.getResponse<{
      setHeader(name: string, value: string): void;
      status(status: number): { json(body: ApiErrorResponse): void };
    }>();
    const header = request.headers?.['x-request-id'];
    const candidate = Array.isArray(header) ? header[0] : header;
    const requestId = request.requestId ?? (isRequestId(candidate) ? candidate : createRequestId());
    const status = statusFor(error.code);
    response.setHeader('x-request-id', requestId);
    response.status(status).json({
      status,
      code: error.code,
      message: error.message,
      requestId,
      timestamp: toBeijingISOString(new Date()),
      path: request.originalUrl ?? request.url ?? '',
    });
  }
}

const statusFor = (code: AttachmentErrorCode): number => {
  if (code === 'NOT_FOUND') return HttpStatus.NOT_FOUND;
  if (code === 'ATTACHMENT_TOO_LARGE') return HttpStatus.PAYLOAD_TOO_LARGE;
  if (code === 'UNSUPPORTED_ATTACHMENT_TYPE') return HttpStatus.UNSUPPORTED_MEDIA_TYPE;
  if (code === 'STORAGE_UNAVAILABLE') return HttpStatus.BAD_GATEWAY;
  if (
    code === 'CONFLICT' ||
    code === 'ATTACHMENT_REFERENCED' ||
    code === 'ATTACHMENT_NOT_AVAILABLE' ||
    code === 'ATTACHMENT_CLEANUP_IN_PROGRESS' ||
    code === 'INVALID_ATTACHMENT_STATE'
  )
    return HttpStatus.CONFLICT;
  return HttpStatus.BAD_REQUEST;
};
