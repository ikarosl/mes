export class ProductionDomainError extends Error {
  constructor(
    readonly code:
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'INVALID_STATE'
      | 'INVALID_INPUT'
      | 'CONCURRENT_MODIFICATION'
      | 'INSUFFICIENT_AVAILABLE_STOCK'
      | 'ALLOCATION_EXCEEDS_DEMAND'
      | 'ALLOCATION_ALREADY_OUTBOUND'
      | 'OUTBOUND_EXCEEDS_ALLOCATION'
      | 'STEP_ASSIGNMENT_CONFLICT'
      | 'STEP_START_NOT_ALLOWED'
      | 'NOT_STEP_ASSIGNEE',
    message: string,
  ) {
    super(message);
  }
}
