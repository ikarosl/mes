import type { PageQuery } from '../common.js';
import type { ProductionOutputRevision } from './output.js';
import type { InventoryInboundTarget } from './inventory-target.js';
export type FinishedGoodsInboundSource = 'self_made' | 'production_extra';
export type FinishedGoodsInboundTarget = InventoryInboundTarget;
export interface FinishedGoodsInboundQuery extends PageQuery {
  keyword?: string;
  sourceType?: FinishedGoodsInboundSource;
  status?: 'completed';
}
export interface FinishedGoodsInboundCandidateQuery extends PageQuery {
  keyword?: string;
  sourceType?: FinishedGoodsInboundSource;
}
export interface FinishedGoodsInboundCandidate {
  productionBatchId: string;
  batchNo: string;
  workOrderId: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  sourceType: FinishedGoodsInboundSource;
  allocationId: string;
  outputRevisionId: string;
  revisionNo: number;
  authorizedQuantity: string;
  receivedQuantity: string;
  remainingQuantity: string;
  canConfirm: boolean;
  blockers: string[];
}
export interface FinishedGoodsInboundOrderLine {
  inboundDetailId: string;
  allocationId: string;
  outputRevisionId: string;
  revisionNo: number;
  sourceType: FinishedGoodsInboundSource;
  quantity: string;
  itemBatchId: string;
  batchCode: string;
  inventoryTransactionId: string;
  approvedOutput?: ProductionOutputRevision;
}
export interface FinishedGoodsInboundOrderItem {
  inboundId: string;
  inboundNo: string;
  status: 'completed';
  productionBatchId: string;
  batchNo: string;
  workOrderId: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  inboundQuantity: string;
  details: FinishedGoodsInboundOrderLine[];
  createdById: string;
  createdByName: string;
  createdAt: string;
  inboundAt: string;
  remark: string | null;
}
export type FinishedGoodsInboundOrderDetail = FinishedGoodsInboundOrderItem;
export interface ConfirmFinishedGoodsInboundLine {
  detailKey: string;
  allocationId: string;
  revisionId: string;
  quantity: number;
  target: FinishedGoodsInboundTarget;
}
export interface ConfirmFinishedGoodsInboundPayload {
  productionBatchId: string;
  details: ConfirmFinishedGoodsInboundLine[];
  remark?: string | null;
}
export interface FinishedGoodsInboundCommandResult {
  inboundId: string;
}
