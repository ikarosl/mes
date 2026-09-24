import type { PageQuery } from '../common.js';
import type { DemandType, DemandBusinessStatus } from './statuses.js';
import type { WorkOrderType } from './work-order.js';

/** 管理员为一个基础 BOM 明细确认精确物料版本后的管理台投影。 */
export interface MaterialDemandManagementQuery extends PageQuery {
  keyword?: string;
  productionBatchId?: string;
  status?: 'pending' | 'configured';
}

export interface MaterialDemandManagementVariant {
  materialVariantId: string;
  materialVariantCode: string;
  majorVersion: string;
  minorVersion: string;
  selectedQuantity: string | null;
  status: number;
}

export interface MaterialDemandManagementDemand {
  demandId: string;
  demandType: DemandType;
  parentDemandId: string | null;
  materialVariantId: string;
  materialVariantCode: string;
  demandQuantity: string;
  remainingQuantity: string;
  businessStatus: DemandBusinessStatus;
  supplierHint: string | null;
}

export interface MaterialDemandManagementRow {
  id: string;
  productionBatchId: string;
  batchNo: string;
  workOrderNo: string;
  orderType: WorkOrderType;
  requirementBasisId: string | null;
  productMaterialId: string | null;
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  requiredQuantity: string | null;
  configuredQuantity: string;
  /** 批量任务初始需求确认时锁定的具体版本；研发任务恒为 null。 */
  lockedMaterialVariantId: string | null;
  supplierHint: string | null;
  status: 'pending' | 'configured';
  demands: MaterialDemandManagementDemand[];
  variants: MaterialDemandManagementVariant[];
}

export type MaterialDemandManagementPage = {
  items: MaterialDemandManagementRow[];
  total: number;
  page: number;
  pageSize: number;
};

export interface MaterialDemandVariantSplitInput {
  materialVariantId: string;
  quantity: number;
  supplierHint?: string | null;
}

export interface MaterialDemandRequirementInput {
  productMaterialId: string;
  splits: MaterialDemandVariantSplitInput[];
}

export interface ConfigureMaterialDemandsPayload {
  requirements: MaterialDemandRequirementInput[];
}

export interface AddManualMaterialDemandsPayload {
  reason: string;
  requirements: ManualMaterialDemandRequirementInput[];
}

export interface ManualMaterialDemandRequirementInput {
  materialId: string;
  splits: MaterialDemandVariantSplitInput[];
}

export interface AddManualMaterialDemandsResult {
  additionId: string;
  additionNo: string;
  demandIds: string[];
}

export interface ProductionMaterialOptionsQuery {
  keyword?: string;
  includeIds?: string[];
}
