import type { ProcurementSupplierSummary } from '@company/contracts';

export const supplierSummary = (suppliers: ProcurementSupplierSummary[]): string =>
  suppliers.map((supplier) => supplier.supplierName).join('、');
