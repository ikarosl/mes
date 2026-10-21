import { ApprovalSubjectError } from '../../application/approval-subject-handler.js';
import { Catch, type ArgumentsHost, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { ApiErrorResponse } from '@company/contracts';
import {
  createRequestId,
  isRequestId,
} from '../../../../common/http/request-context.middleware.js';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
import { ApprovalDomainError, type ApprovalErrorCode } from '../../domain/approval.errors.js';

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

@Catch(ApprovalDomainError, ApprovalSubjectError)
export class ApprovalDomainExceptionFilter implements ExceptionFilter {
  catch(exception: ApprovalDomainError | ApprovalSubjectError, host: ArgumentsHost): void {
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
      ...(exception.details ? { details: exception.details } : {}),
    });
  }
}

const statusFor = (code: ApprovalErrorCode): number => {
  if (code === 'NOT_FOUND') return HttpStatus.NOT_FOUND;
  if (code === 'FORBIDDEN') return HttpStatus.FORBIDDEN;
  if (code === 'CONFLICT' || code === 'CONCURRENT_MODIFICATION') return HttpStatus.CONFLICT;
  return HttpStatus.BAD_REQUEST;
};

const readRequestId = (value: string | string[] | undefined): string | undefined => {
  const requestId = Array.isArray(value) ? value[0] : value;
  return isRequestId(requestId) ? requestId : undefined;
};
