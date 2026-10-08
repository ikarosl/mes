import type { ProcurementErrorCode } from '@company/contracts';

export class ProcurementDomainError extends Error {
  constructor(
    readonly code: ProcurementErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function receiptError(
  message: string,
  code: 'INVALID_RECEIPT' | 'RECEIPT_STATE' | 'RECEIPT_NOT_FOUND' = 'INVALID_RECEIPT',
): never {
  throw new ProcurementDomainError(code, message);
}
