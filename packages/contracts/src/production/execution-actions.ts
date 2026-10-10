import type { VersionedCommand } from '../common.js';
import type { BatchStepStatus } from './statuses.js';

export type ProductionStepExecutionActionType = 'start' | 'complete' | 'reopen';
/** 已保存的历史动作只读；历史更正不代表当前存在写命令。 */
export type ProductionStepExecutionHistoryActionType =
  ProductionStepExecutionActionType | 'correct_history';
/** 仅用于读取已保存的历史更正记录。 */
export type ProductionStepHistoryCorrectionType = 'undo_start' | 'complete' | 'reopen';

export interface ReopenProductionStepPayload extends VersionedCommand {
  reason: string;
}

export interface ProductionStepExecutionActionItem {
  actionId: string;
  productionBatchId: string;
  stepRecordId: string;
  actionType: ProductionStepExecutionHistoryActionType;
  correctionType: ProductionStepHistoryCorrectionType | null;
  beforeStatus: BatchStepStatus;
  afterStatus: BatchStepStatus;
  beforeStartedAt: string | null;
  afterStartedAt: string | null;
  beforeCompletedAt: string | null;
  afterCompletedAt: string | null;
  reason: string | null;
  stepVersion: number;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
}

export interface ProductionStepExecutionHistoryItem extends Omit<
  ProductionStepExecutionActionItem,
  'actionType'
> {
  sourceType: 'execution_action' | 'closeout_action';
  actionType: ProductionStepExecutionHistoryActionType | 'terminate';
}

export interface ProductionStepActionAvailability {
  canStart: boolean;
  startBlockedReason: string | null;
  canComplete: boolean;
  completeBlockedReason: string | null;
  canReopen: boolean;
  reopenBlockedReason: string | null;
}
