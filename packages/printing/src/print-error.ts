export type LodopPrintOutcome = 'rejected' | 'unknown';

/** An unknown outcome can already be queued on the workstation. Never retry it automatically. */
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
