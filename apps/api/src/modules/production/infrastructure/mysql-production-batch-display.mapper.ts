import type { ProductionBatchItem } from '@company/contracts';
import { mapBatch, type BatchSummaryRow } from './mysql-production.shared.js';

export const mapBatches = (batches: BatchSummaryRow[]): ProductionBatchItem[] =>
  batches.map(mapBatch);
