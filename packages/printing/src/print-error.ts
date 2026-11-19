export type LodopPrintOutcome = 'rejected' | 'unknown';

/** unknown means PRINT may already have submitted work; callers must never auto-retry it. */
export class LodopPrintError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly outcome: LodopPrintOutcome = 'rejected',
  ) {
    super(message);
    this.name = 'LodopPrintError';
  }
}
