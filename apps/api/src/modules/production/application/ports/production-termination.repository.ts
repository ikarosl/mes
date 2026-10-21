import type { BatchTerminationCheck } from '@company/contracts';

export abstract class ProductionTerminationRepository {
  abstract getCheck(batchId: string): Promise<BatchTerminationCheck>;
}
