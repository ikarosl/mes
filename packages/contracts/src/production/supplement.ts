import type { VersionedCommand } from '../common.js';
import type { BatchStepAbnormalDispositionItem } from './abnormal.js';

export interface ProductionSupplementCandidateItem {
  originalDemandId: string;
  productionBatchId: string;
  productMaterialId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  normalDemandQuantity: string;
}

export interface ApproveScrapSupplementLinePayload {
  originalDemandId: string;
  supplementQuantity: number;
}

export interface ApproveScrapSupplementPayload extends VersionedCommand {
  materialEndStepRecordId: string;
  details: ApproveScrapSupplementLinePayload[];
  remark?: string | null;
}

export interface ProductionScrapSupplementPlanLineItem {
  originalDemandId: string;
  productMaterialId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  plannedQuantity: string;
  unit: string;
}

export interface ProductionScrapSupplementPlanItem {
  planId: string;
  planNo: string;
  dispositionId: string;
  productionBatchId: string;
  sourceStepRecordId: string;
  sourceReportId: string;
  materialEndStepRecordId: string;
  status: 'draft' | 'confirmed';
  confirmedSupplementId: string | null;
  remark: string | null;
  version: number;
  updatedAt: string;
  lines: ProductionScrapSupplementPlanLineItem[];
}

export interface SaveProductionScrapSupplementPlanPayload {
  planVersion: number | null;
  dispositionVersion: number;
  materialEndStepRecordId: string;
  details: ApproveScrapSupplementLinePayload[];
  remark?: string | null;
}

export interface ConfirmProductionScrapSupplementPlanPayload extends VersionedCommand {
  dispositionVersion: number;
}

export interface ProductionMaterialSupplementDemandItem {
  originalDemandId: string;
  demandId: string;
  productMaterialId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  supplementQuantity: string;
  unit: string;
}

export interface ProductionMaterialSupplementItem {
  supplementId: string;
  supplementNo: string;
  scrapRecordId: string;
  productionBatchId: string;
  stepRecordId: string;
  status: 'approved' | 'fulfilled';
  remark: string | null;
  createdAt: string;
  demands: ProductionMaterialSupplementDemandItem[];
}

export interface ProductionStepSupplementSourceItem {
  scrapRecordId: string;
  supplementId: string;
  sourceStepRecordId: string;
  sourceStepOrder: number;
  sourceStepCode: string;
  sourceStepName: string;
  quantity: string;
  status: 'pending_material' | 'material_ready';
}

export interface BatchStepScrapReproductionAuthorizationItem {
  authorizationId: string;
  scrapRecordId: string;
  supplementId: string;
  entryStepRecordId: string;
  quotaEndStepRecordId: string;
  materialEndStepRecordId: string;
  authorizedQuantity: string;
  authorizedBy: string;
  authorizedAt: string;
}

export interface ApproveScrapSupplementResult {
  disposition: BatchStepAbnormalDispositionItem;
  scrapRecord: {
    scrapRecordId: string;
    sourceReportId: string;
    scrapQuantity: string;
    unit: string;
  };
  reproductionAuthorization: BatchStepScrapReproductionAuthorizationItem;
  supplement: ProductionMaterialSupplementItem;
}
