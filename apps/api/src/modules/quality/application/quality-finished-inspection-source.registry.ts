import { Injectable } from '@nestjs/common';
import type { ProductionOutputQuantities } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { QualityCommandError } from '../quality-command.error.js';
export interface FinishedInspectionSource {
  closeoutId: string;
  batchId: string;
  version: number;
  declared: ProductionOutputQuantities;
}
/** 来源模块负责锁、状态与版本；Quality 只写检验事实。调用必须共享活动事务。 */
export interface QualityFinishedInspectionSourceHandler {
  prepare(batchId: string, version: number): Promise<FinishedInspectionSource>;
  advance(source: FinishedInspectionSource, context: CommandContext): Promise<void>;
}
@Injectable()
export class QualityFinishedInspectionSourceRegistry {
  private handler: QualityFinishedInspectionSourceHandler | null = null;
  register(handler: QualityFinishedInspectionSourceHandler): void {
    if (this.handler) throw new Error('Finished inspection source already registered');
    this.handler = handler;
  }
  require(): QualityFinishedInspectionSourceHandler {
    if (!this.handler) throw new QualityCommandError('INVALID_STATE', '成品检验来源尚未初始化');
    return this.handler;
  }
}
