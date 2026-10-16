import { Catch, HttpException, HttpStatus, Logger, type ArgumentsHost } from '@nestjs/common';
import { PROCUREMENT_ERROR_CODES } from '@company/constants';
import { HttpExceptionFilter } from '../../../../presentation/http/http-exception.filter.js';
import { createRequestId } from '../../../../common/http/request-context.middleware.js';
import { ProcurementDomainError } from '../../domain/procurement.errors.js';
import { QualityCommandError } from '../../../quality/public.js';
import { InventoryCommandError } from '../../../inventory/public.js';
import { ProductionProcurementInputError } from '../../../production/public.js';

@Catch(
  ProcurementDomainError,
  QualityCommandError,
  InventoryCommandError,
  ProductionProcurementInputError,
)
export class ProcurementDomainExceptionFilter extends HttpExceptionFilter {
  private readonly diagnosticLogger = new Logger(ProcurementDomainExceptionFilter.name);
  override catch(
    exception:
      | ProcurementDomainError
      | QualityCommandError
      | InventoryCommandError
      | ProductionProcurementInputError,
    host: ArgumentsHost,
  ): void {
    const status =
      exception.code === PROCUREMENT_ERROR_CODES.supplierNotFound ||
      exception.code === PROCUREMENT_ERROR_CODES.purchaseOrderNotFound ||
      exception.code === PROCUREMENT_ERROR_CODES.receiptNotFound ||
      exception.code === 'NOT_FOUND'
        ? HttpStatus.NOT_FOUND
        : exception.code === PROCUREMENT_ERROR_CODES.supplierNameTaken ||
            exception.code === PROCUREMENT_ERROR_CODES.purchaseOrderState ||
            exception.code === PROCUREMENT_ERROR_CODES.receiptState ||
            exception.code === 'INVALID_STATE' ||
            exception.code === 'CONCURRENT_MODIFICATION' ||
            exception.code === 'CONFLICT'
          ? HttpStatus.CONFLICT
          : HttpStatus.BAD_REQUEST;
    let message = exception.message;
    if (
      exception instanceof QualityCommandError &&
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
