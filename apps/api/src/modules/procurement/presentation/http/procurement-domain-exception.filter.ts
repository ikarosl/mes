import { Catch, HttpException, HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { PROCUREMENT_ERROR_CODES } from '@company/constants';
import { HttpExceptionFilter } from '../../../../presentation/http/http-exception.filter.js';
import { ProcurementDomainError } from '../../domain/procurement.errors.js';
import { QualityCommandError } from '../../../quality/public.js';
import { InventoryCommandError } from '../../../inventory/public.js';

@Catch(ProcurementDomainError, QualityCommandError, InventoryCommandError)
export class ProcurementDomainExceptionFilter extends HttpExceptionFilter {
  override catch(
    exception: ProcurementDomainError | QualityCommandError | InventoryCommandError,
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
    super.catch(
      new HttpException({ code: exception.code, message: exception.message }, status),
      host,
    );
  }
}
