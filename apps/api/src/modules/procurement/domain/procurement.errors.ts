import type { ProcurementErrorCode } from '@company/contracts';

export class ProcurementDomainError extends Error {
  constructor(
    readonly code: ProcurementErrorCode,
    message: string,
  ) {
    super(message);
  }
}
