import type { PageQuery } from '../common.js';
import type { DemandType, DemandBusinessStatus } from './statuses.js';

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
  advisoryStockQuantity: string;
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
}

export interface MaterialDemandManagementRow {
  id: string;
  productionBatchId: string;
  batchNo: string;
  workOrderNo: string;
  requirementBasisId: string | null;
  productMaterialId: string;
  materialProductId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  requiredQuantity: string;
  configuredQuantity: string;
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
