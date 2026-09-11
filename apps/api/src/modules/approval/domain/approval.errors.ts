export type ApprovalErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_INPUT'
  | 'INVALID_STATE'
  | 'FORBIDDEN'
  | 'FLOW_NOT_CONFIGURED'
  | 'NO_ELIGIBLE_ASSIGNEE'
  | 'CONCURRENT_MODIFICATION';

export class ApprovalDomainError extends Error {
  constructor(
    readonly code: ApprovalErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
