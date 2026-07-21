import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { UserProfile } from '@company/contracts';
import { catchError, from, mergeMap, throwError } from 'rxjs';
import { IdentityRepository } from '../../application/ports/identity.repository.js';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly repository: IdentityRepository) {}
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
    return next.handle().pipe(
      mergeMap((value) =>
        from(this.repository.writeLog({ ...entry, result: 'success' })).pipe(
          mergeMap(() => [value]),
        ),
      ),
      catchError((error: unknown) =>
        from(
          this.repository.writeLog({
            ...entry,
            result: 'failed',
            remark: auditFailureRemark(error),
          }),
        ).pipe(mergeMap(() => throwError(() => error))),
      ),
    );
  }
}

/** Keep operation logs useful without persisting raw exception messages or secrets. */
export const auditFailureRemark = (error: unknown) =>
  error instanceof HttpException ? `HTTP ${error.getStatus()}` : 'Unhandled request failure';

interface AuditRequest {
  method: string;
  path?: string;
  ip?: string;
  headers: { 'x-forwarded-for'?: string };
  socket?: { remoteAddress?: string };
  user?: UserProfile;
}
const readIp = (request: AuditRequest) =>
  request.headers['x-forwarded-for']?.split(',')[0]?.trim() ??
  request.ip ??
  request.socket?.remoteAddress ??
  null;
