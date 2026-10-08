import type { ProductionOutputInspection } from '@company/contracts';
export abstract class QualityFinishedInspectionQuery {
  /** 只读预览所需的记录存在性；不替代命令的锁内完整依据核验。 */
  abstract hasForCloseout(closeoutId: string, batchId: string): Promise<boolean>;
  /** Production 在锁住来源后要求 lock=true，读取本任务当前检验及历史引用。 */
  abstract readForCloseout(
    closeoutId: string,
    batchId: string,
    lock: boolean,
  ): Promise<ProductionOutputInspection[]>;
}
