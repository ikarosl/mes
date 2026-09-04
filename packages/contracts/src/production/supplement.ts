import type { VersionedCommand } from '../common.js';
import type { BatchStepAbnormalDispositionItem } from './abnormal.js';

export interface ProductionSupplementVariantCandidate {
  id: string;
  variantCode: string;
  majorVersion: string;
  minorVersion: string;
}

export interface ProductionSupplementCandidateItem {
  originalDemandId: string;
  productionBatchId: string;
  requirementBasisId: string;
  productMaterialId: string;
  itemId: string;
  materialVariantId: string;
  materialVariantCode: string;
  variants: ProductionSupplementVariantCandidate[];
  itemCode: string;
  itemName: string;
  quantityPerUnit: string;
  unit: string;
  isKeyMaterial: boolean;
  needBatchRecord: boolean;
  plannedOutputQuantity: string;
  normalDemandQuantity: string;
}

export interface ApproveScrapSupplementLinePayload {
  originalDemandId: string;
  requirementBasisId: string;
  materialVariantId: string;
  supplementQuantity: number;
}

export interface ApproveScrapSupplementPayload extends VersionedCommand {
  details: ApproveScrapSupplementLinePayload[];
  remark?: string | null;
}

export interface ProductionScrapSupplementPlanLineItem {
  originalDemandId: string;
  requirementBasisId: string;
  productMaterialId: string;
  itemId: string;
  materialVariantId: string;
  materialVariantCode: string;
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
  details: ApproveScrapSupplementLinePayload[];
  remark?: string | null;
}

export interface ConfirmProductionScrapSupplementPlanPayload extends VersionedCommand {
  dispositionVersion: number;
}

export interface ProductionMaterialSupplementDemandItem {
  originalDemandId: string;
  demandId: string;
  requirementBasisId: string;
  productMaterialId: string;
  itemId: string;
  materialVariantId: string;
  materialVariantCode: string;
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
