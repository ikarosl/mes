import type { ProductionBatchStatus, WorkOrderStatus } from './statuses.js';
import type { WorkOrderType } from './work-order.js';
import type { MaterialLossPurpose, ScrapStatus } from './statuses.js';

/** 领料损耗逐笔证据；收尾登记不产生补料，不计入成品报废。 */
export interface BatchTerminationLossRecord {
  id: string;
  scrapNo: string;
  purpose: MaterialLossPurpose;
  closeoutId: string | null;
  allocationId: string;
  demandId: string;
  itemCode: string;
  materialVariantCode: string;
  inventoryBatchCode: string;
  scrapQuantity: string;
  unit: string;
  reason: string;
  status: ScrapStatus;
  createdBy: string;
  createdAt: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
}

export interface BatchTerminationImpact {
  kind: 'step' | 'abnormal' | 'rework' | 'supplement' | 'outbound' | 'demand' | 'allocation';
  id: string;
  label: string;
  quantity: string | null;
  unit: string | null;
  status: string;
  version: number;
}

export interface BatchTerminationMaterial {
  allocationId: string;
  inventoryBatchCode: string;
  itemCode: string;
  materialVariantCode: string;
  unit: string;
  assignedQuantity: string;
  outboundQuantity: string;
  returnQuantity: string;
  lossQuantity: string;
  returnableQuantity: string;
}

export interface BatchTerminationRecord {
  id: string;
  revisionNo: number;
  approvalInstanceId: string;
  availableQuantity: string;
  extraQuantity: string;
  additionalScrapQuantity: string;
  existingScrapQuantity: string;
  reason: string;
  materialReviewNote: string;
  createdBy: string;
  createdAt: string;
}

export interface BatchTerminationCheck {
  batchId: string;
  batchNo: string;
  batchStatus: ProductionBatchStatus;
  workOrderId: string;
  workOrderNo: string;
  orderType: WorkOrderType;
  workOrderStatus: WorkOrderStatus;
  productCode: string;
  productName: string;
  unit: string;
  plannedQuantity: string;
  reportedNormalQuantity: string;
  existingScrapQuantity: string;
  version: number;
  checkToken: string;
  canTerminate: boolean;
  blockers: string[];
  impacts: BatchTerminationImpact[];
  materials: BatchTerminationMaterial[];
  lossRecords: BatchTerminationLossRecord[];
  termination: BatchTerminationRecord | null;
}
