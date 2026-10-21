import type { BatchStepAbnormalDispositionItem } from './abnormal.js';
import type { ReworkRecordView } from './report-view.js';

/** 产线处理专检不合格的真实处置历史；来源结果固定为处理当时的记录。 */
export interface ProcessInspectionDispositionHistoryItem extends BatchStepAbnormalDispositionItem {
  sourceType: 'process_inspection';
  sourceReportId: null;
  processInspectionId: string;
  processInspectionRecordId: string;
  unit: string;
  createdBy: string;
  createdByName: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  /** 当前处置说明，后续审批可更新；不能作为首次处理时的说明。 */
  remark: string | null;
  rework: ReworkRecordView | null;
}
