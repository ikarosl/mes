import type {
  BatchReverseStepReportSelection,
  BatchStepReportItem,
  ProductionWorkerTaskItem,
} from '@company/contracts';

export interface SelectedProductionReport extends BatchReverseStepReportSelection {
  stepOrder: number;
  stepName: string;
  report: BatchStepReportItem;
}

export interface ProductionReportVerificationStep {
  productionBatchId: string;
  stepRecordId: string;
  version: number;
  stepOrder: number;
  stepName: string;
}

export type ProductionReportContext = Pick<
  ProductionWorkerTaskItem,
  | 'productionBatchId'
  | 'stepRecordId'
  | 'batchNo'
  | 'stepOrder'
  | 'stepName'
  | 'hasPreviousStep'
  | 'status'
  | 'unit'
  | 'plannedQuantity'
  | 'activatedSupplementInputQuantity'
  | 'upperLimitQuantity'
  | 'effectiveDirectReportedQuantity'
  | 'effectiveDirectNormalQuantity'
  | 'effectiveDirectAbnormalQuantity'
  | 'effectiveNormalQuantity'
  | 'effectiveAbnormalQuantity'
  | 'requiredNormalQuantity'
  | 'remainingNormalQuantity'
  | 'availableReportQuantity'
  | 'pendingSupplementInputQuantity'
  | 'quotaDistribution'
  | 'version'
  | 'canReport'
  | 'reportBlockedReason'
>;
