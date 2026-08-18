import { Catch, type ArgumentsHost, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { ApiErrorResponse } from '@company/contracts';
import {
  createRequestId,
  isRequestId,
} from '../../../../common/http/request-context.middleware.js';
import { toBeijingISOString } from '../../../../common/time/beijing-time.js';
import { ProductionDomainError } from '../../domain/production.errors.js';

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

@Catch(ProductionDomainError)
export class ProductionDomainExceptionFilter implements ExceptionFilter {
  catch(exception: ProductionDomainError, host: ArgumentsHost): void {
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

const statusFor = (code: ProductionDomainError['code']): number => {
  if (code === 'NOT_FOUND') return HttpStatus.NOT_FOUND;
  if (code === 'NOT_STEP_ASSIGNEE') return HttpStatus.FORBIDDEN;
  if (
    code === 'CONFLICT' ||
    code === 'CONCURRENT_MODIFICATION' ||
    code === 'WORK_ORDER_COMPLETION_NOT_ALLOWED' ||
    code === 'WORK_ORDER_CLOSE_NOT_ALLOWED' ||
    code === 'BATCH_CANCEL_NOT_ALLOWED' ||
    code === 'INSUFFICIENT_AVAILABLE_STOCK' ||
    code === 'ALLOCATION_EXCEEDS_DEMAND' ||
    code === 'ALLOCATION_ALREADY_OUTBOUND' ||
    code === 'ALLOCATION_PENDING_OUTBOUND' ||
    code === 'OUTBOUND_EXCEEDS_ALLOCATION' ||
    code === 'OUTBOUND_ALLOCATION_CHANGED' ||
    code === 'OUTBOUND_CONFIRM_NOT_ALLOWED' ||
    code === 'OUTBOUND_CANCEL_NOT_ALLOWED' ||
    code === 'INBOUND_CONFIRM_NOT_ALLOWED' ||
    code === 'INBOUND_CANCEL_NOT_ALLOWED' ||
    code === 'RETURN_QUANTITY_EXCEEDED' ||
    code === 'RETURN_CONFIRM_NOT_ALLOWED' ||
    code === 'RETURN_CANCEL_NOT_ALLOWED' ||
    code === 'STOCK_CHECK_COUNT_NOT_ALLOWED' ||
    code === 'STOCK_CHECK_INCOMPLETE' ||
    code === 'STOCK_CHECK_SNAPSHOT_CHANGED' ||
    code === 'STOCK_CHECK_CANCEL_NOT_ALLOWED' ||
    code === 'STEP_ASSIGNMENT_CONFLICT' ||
    code === 'STEP_START_NOT_ALLOWED' ||
    code === 'STEP_COMPLETION_NOT_ALLOWED' ||
    code === 'STEP_REPORT_NOT_ALLOWED' ||
    code === 'STEP_REPORT_QUANTITY_EXCEEDED' ||
    code === 'STEP_REPORT_ALREADY_REVERSED' ||
    code === 'STEP_REPORT_DEPENDENCY_CONFLICT' ||
    code === 'DOWNSTREAM_QUANTITY_CONFLICT' ||
    code === 'BATCH_EXECUTION_COMPLETION_NOT_ALLOWED' ||
    code === 'NO_REQUIRED_REPORTING_STEP' ||
    code === 'REQUIRED_STEP_INCOMPLETE' ||
    code === 'FINAL_STEP_QUANTITY_INSUFFICIENT'
  )
    return HttpStatus.CONFLICT;
  return HttpStatus.BAD_REQUEST;
};

const readRequestId = (value: string | string[] | undefined): string | undefined => {
  const requestId = Array.isArray(value) ? value[0] : value;
  return isRequestId(requestId) ? requestId : undefined;
};
