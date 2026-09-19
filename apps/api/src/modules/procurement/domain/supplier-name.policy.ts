import { PROCUREMENT_ERROR_CODES, SUPPLIER_NAME_MAX_LENGTH } from '@company/constants';
import { ProcurementDomainError } from './procurement.errors.js';

export const normalizeSupplierName = (name: string): string => {
  const normalized = name.trim();
  if (!normalized || [...normalized].length > SUPPLIER_NAME_MAX_LENGTH) {
    throw new ProcurementDomainError(
      PROCUREMENT_ERROR_CODES.invalidSupplierName,
      `供应商名称不能为空，且不能超过 ${SUPPLIER_NAME_MAX_LENGTH} 个字符`,
    );
  }
  return normalized;
};
