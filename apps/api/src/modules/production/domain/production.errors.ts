export class ProductionDomainError extends Error {
  constructor(
    readonly code:
      'NOT_FOUND' | 'CONFLICT' | 'INVALID_STATE' | 'INVALID_INPUT' | 'CONCURRENT_MODIFICATION',
    message: string,
  ) {
    super(message);
  }
}
