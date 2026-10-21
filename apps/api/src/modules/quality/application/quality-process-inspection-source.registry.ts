import { Injectable } from '@nestjs/common';
import { QualityCommandError } from '../quality-command.error.js';
export interface QualityProcessInspectionSourceHandler {
  /** 同池事务；来源拥有者锁工单→任务→工序，核验任务工序身份与登记资格。 */
  prepare(batchId: string, stepId: string, intent: 'create' | 'correct' | 'reverse'): Promise<void>;
}
@Injectable()
export class QualityProcessInspectionSourceRegistry {
  private handler: QualityProcessInspectionSourceHandler | null = null;
  register(handler: QualityProcessInspectionSourceHandler): void {
    if (this.handler) throw new Error('Process inspection source already registered');
    this.handler = handler;
  }
  require(): QualityProcessInspectionSourceHandler {
    if (!this.handler) throw new QualityCommandError('INVALID_STATE', '工序专检来源尚未初始化');
    return this.handler;
  }
}
