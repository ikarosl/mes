import type { ProductionOutputInspection } from '@company/contracts';
export abstract class QualityFinishedInspectionQuery {
  /** Production 在锁住来源后要求 lock=true，读取本任务当前检验及历史引用。 */
  abstract readForCloseout(
    closeoutId: string,
    batchId: string,
    lock: boolean,
  ): Promise<ProductionOutputInspection[]>;
}
