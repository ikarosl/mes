import type { ProductionBatchItem } from '@company/contracts';
import { mapBatch, type BatchRow } from './mysql-production.shared.js';

export const mapBatches = (batches: BatchRow[]): ProductionBatchItem[] => batches.map(mapBatch);
