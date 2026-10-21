import type { ProductionBatchItem } from '@company/contracts';
import { mapBatch, type BatchSummaryRow } from './mysql-production-batch.persistence.js';

export const mapBatches = (batches: BatchSummaryRow[]): ProductionBatchItem[] =>
  batches.map(mapBatch);
