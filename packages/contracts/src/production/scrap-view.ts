import type {
  BatchStepScrapReproductionAuthorizationItem,
  ProductionMaterialSupplementItem,
} from './supplement.js';
import type { BatchStepReportReference, BatchStepReportSourceKind } from './report-view.js';

export interface BatchStepScrapReproductionAuthorizationView extends BatchStepScrapReproductionAuthorizationItem {
  authorizedByName: string | null;
}

export interface BatchStepScrapSupplementReference {
  supplementId: string;
  supplementNo: string;
  status: ProductionMaterialSupplementItem['status'];
  remark: string | null;
  createdAt: string;
}

/** 真实工序报废事实及其同源引用；报废事实没有独立业务编号。 */
export interface BatchStepScrapRecordView {
  scrapRecordId: string;
  productionBatchId: string;
  stepRecordId: string;
  scrapQuantity: string;
  unit: string;
  sourceReport: BatchStepReportReference;
  sourceReportSourceKind: BatchStepReportSourceKind;
  sourceReportRemark: string | null;
  dispositionId: string;
  dispositionNo: string;
  remark: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  reproductionAuthorization: BatchStepScrapReproductionAuthorizationView | null;
  supplement: BatchStepScrapSupplementReference | null;
}
