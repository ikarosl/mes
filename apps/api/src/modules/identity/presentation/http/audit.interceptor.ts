import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserProfile } from '@company/contracts';
import { catchError, from, mergeMap, throwError } from 'rxjs';
import { AuditRepository } from '../../application/ports/audit.repository.js';
import { AUDIT_IN_APPLICATION } from './auth.decorators.js';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);
  constructor(
    private readonly repository: AuditRepository,
    private readonly reflector: Reflector,
  ) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<AuditRequest>();
    if (request.method === 'GET') return next.handle();
    const entry = {
      logType: request.path?.startsWith('/api/auth') ? 'auth' : 'operation',
      module: request.path?.split('/').filter(Boolean)[1] ?? 'unknown',
      action: `${request.method} ${request.path ?? ''}`,
      userId: request.user?.id ?? null,
      ip: readIp(request),
    };
    const applicationAudited = this.reflector.getAllAndOverride<boolean>(AUDIT_IN_APPLICATION, [
      context.getHandler(),
      context.getClass(),
    ]);
    return next.handle().pipe(
      mergeMap((value) =>
        applicationAudited
          ? [value]
          : from(this.writeBestEffort({ ...entry, result: 'success' })).pipe(
              mergeMap(() => [value]),
            ),
      ),
      catchError((error: unknown) =>
        from(
          this.writeBestEffort({
            ...entry,
            result: 'failed',
            remark: auditFailureRemark(error),
          }),
        ).pipe(mergeMap(() => throwError(() => error))),
      ),
    );
  }
  private async writeBestEffort(entry: Parameters<AuditRepository['writeLog']>[0]) {
    try {
      await this.repository.writeLog(entry);
    } catch {
      this.logger.warn('Audit log write failed');
    }
  }
}

/** Keep operation logs useful without persisting raw exception messages or secrets. */
export const auditFailureRemark = (error: unknown) =>
  error instanceof HttpException ? `HTTP ${error.getStatus()}` : 'Unhandled request failure';

interface AuditRequest {
  method: string;
  path?: string;
  ip?: string;
  user?: UserProfile;
}
const readIp = (request: AuditRequest) => request.ip ?? null;
