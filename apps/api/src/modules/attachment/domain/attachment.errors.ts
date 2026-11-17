export type AttachmentErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'ATTACHMENT_REFERENCED'
  | 'ATTACHMENT_NOT_AVAILABLE'
  | 'INVALID_ATTACHMENT_REFERENCE'
  | 'IMMUTABLE_ATTACHMENT_REFERENCE'
  | 'INVALID_ATTACHMENT_STATE'
  | 'INVALID_ATTACHMENT_INPUT'
  | 'ATTACHMENT_TOO_LARGE'
  | 'UNSUPPORTED_ATTACHMENT_TYPE'
  | 'ATTACHMENT_CLEANUP_IN_PROGRESS'
  | 'STORAGE_UNAVAILABLE'
  | 'VERSIONED_BUCKET_UNSUPPORTED';

export class AttachmentError extends Error {
  constructor(
    readonly code: AttachmentErrorCode,
    message: string,
  ) {
    super(message);
  }
}
