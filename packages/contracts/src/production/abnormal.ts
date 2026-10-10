import type { VersionedCommand } from '../common.js';
import type {
  ReworkStatus,
  BatchStepAbnormalReviewStatus,
  BatchStepAbnormalOrigin,
} from './statuses.js';
import type { BatchStepReportItem } from './execution.js';

export interface BatchStepAbnormalDispositionItem {
  dispositionId: string;
  dispositionNo: string;
  productionBatchId: string;
  stepRecordId: string;
  sourceReportId: string;
  sourceAbnormalQuantity: string;
  abnormalOrigin: BatchStepAbnormalOrigin;
  reviewStatus: BatchStepAbnormalReviewStatus;
  dispositionType: 'rework' | 'scrap' | null;
  remark: string | null;
  version: number;
  createdAt: string;
}

export interface ApproveBatchStepReworkPayload extends VersionedCommand {
  remark?: string | null;
}

export interface RejectBatchStepAbnormalDispositionPayload extends VersionedCommand {
  reason: string;
}

export interface ReworkRecordItem {
  reworkId: string;
  reworkNo: string;
  abnormalDispositionId: string;
  productionBatchId: string;
  stepRecordId: string;
  sourceReportId: string;
  /** 批准时的来源工序负责人快照，仅用于追溯，不作为返工执行授权。 */
  responsibleUserId: string;
  responsibleUserName: string | null;
  reworkQuantity: string;
  unit: string;
  status: ReworkStatus;
  completedNormalReportId: string | null;
  completedAbnormalReportId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  version: number;
  remark: string | null;
  createdAt: string;
}

export type StartReworkPayload = VersionedCommand;

export interface CompleteReworkPayload extends VersionedCommand {
  normalQuantity: number;
  abnormalQuantity: number;
  remark?: string | null;
}

export interface CompleteReworkResult {
  rework: ReworkRecordItem;
  normalReport: BatchStepReportItem | null;
  abnormalReport: BatchStepReportItem | null;
  abnormalDisposition: BatchStepAbnormalDispositionItem | null;
}
