import { Catch, HttpException, HttpStatus, Logger, type ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from '../../../../presentation/http/http-exception.filter.js';
import { createRequestId } from '../../../../common/http/request-context.middleware.js';
import { QualityCommandError } from '../../quality-command.error.js';
@Catch(QualityCommandError)
export class QualityCommandExceptionFilter extends HttpExceptionFilter {
  private readonly diagnosticLogger = new Logger(QualityCommandExceptionFilter.name);
  override catch(exception: QualityCommandError, host: ArgumentsHost): void {
    const status = qualityErrorStatus(exception.code);
    let message = exception.message;
    if (
      exception.code === 'INVALID_STATE' &&
      (message === '检验命令必须位于来源业务事务中' || message === '检验当前读要求来源活动事务')
    ) {
      const request = host.switchToHttp().getRequest<{ requestId?: string }>();
      const requestId = (request.requestId ??= createRequestId());
      this.diagnosticLogger.error(
        `requestId=${requestId} code=${exception.code} diagnostic=${message}`,
      );
      message = `当前无法办理检验，请联系管理员处理（请求编号：${requestId}）`;
    }
    super.catch(new HttpException({ code: exception.code, message }, status), host);
  }
}

const qualityErrorStatus = (code: QualityCommandError['code']): HttpStatus => {
  if (code === 'NOT_FOUND') return HttpStatus.NOT_FOUND;
  if (code === 'INVALID_INPUT') return HttpStatus.BAD_REQUEST;
  return HttpStatus.CONFLICT;
};
