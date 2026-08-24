import type { PageQuery, ReasonedVersionedCommand, VersionedCommand } from '../common.js';
import type { ProductionBatchStatus, OutboundOrderStatus } from './statuses.js';

export interface CreateMaterialOutboundDetailPayload {
  allocationId: string;
  outboundQuantity: number;
}

export interface CreateMaterialOutboundPayload {
  details: CreateMaterialOutboundDetailPayload[];
  remark?: string | null;
}

export interface MaterialOutboundDetailItem {
  id: string;
  allocationId: string;
  demandId: string;
  itemId: string;
  itemBatchId: string;
  batchCode: string;
  itemCode: string;
  itemName: string;
  outboundQuantity: string;
  unit: string;
  inventoryTransactionId: string | null;
}

export interface MaterialOutboundQuantitySummary {
  unit: string;
  quantity: string;
}

export interface MaterialOutboundItem {
  outboundId: string;
  outboundNo: string;
  productionBatchId: string;
  batchNo: string;
  workOrderId: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  status: OutboundOrderStatus;
  outboundAt: string | null;
  operatorId: string | null;
  operatorName: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  version: number;
  remark: string | null;
  cancelSource?: 'manual' | 'production_batch' | null;
  cancelReason?: string | null;
  cancelledById?: string | null;
  cancelledByName?: string | null;
  cancelledAt?: string | null;
  quantitySummary: MaterialOutboundQuantitySummary[];
  details: MaterialOutboundDetailItem[];
}

export interface MaterialOutboundCommandResult {
  productionBatchId: string;
  batchStatus: ProductionBatchStatus;
  batchVersion: number;
  outbound: MaterialOutboundItem;
}

export interface MaterialOutboundQuery extends PageQuery {
  keyword?: string;
  status?: OutboundOrderStatus;
}

export interface MaterialOutboundBatchOption {
  productionBatchId: string;
  batchNo: string;
  workOrderNo: string;
  productCode: string;
  productName: string;
  batchStatus: ProductionBatchStatus;
}

export interface MaterialOutboundCandidateItem {
  allocationId: string;
  demandId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemBatchId: string;
  batchCode: string;
  assignedQuantity: string;
  confirmedOutboundQuantity: string;
  pendingOutboundQuantity: string;
  availableToOrderQuantity: string;
  remainingActualOutboundQuantity: string;
  unit: string;
}

export type ConfirmMaterialOutboundPayload = VersionedCommand;

export type CancelMaterialOutboundPayload = ReasonedVersionedCommand;
