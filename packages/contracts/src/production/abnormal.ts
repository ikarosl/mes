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
  responsibleUserId: string;
  responsibleUserName: string | null;
  reworkQuantity: string;
  unit: string;
  status: ReworkStatus;
  completedReportId: string | null;
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
  report: BatchStepReportItem;
  abnormalDisposition: BatchStepAbnormalDispositionItem | null;
}
