import type { PageQuery, ReasonedVersionedCommand, VersionedCommand } from '../common.js';
import type {
  ReturnOrderStatus,
  ScrapStatus,
  StockCheckStatus,
  StockCheckResult,
  StockStatus,
  InventoryBatchStatus,
  InventoryReferenceType,
  InventorySourceType,
  InventoryTransactionType,
  DemandType,
  MaterialLossPurpose,
} from './statuses.js';

export interface ReturnOrderQuery extends PageQuery {
  keyword?: string;
  status?: ReturnOrderStatus;
}

export interface ReturnOrderBatchOption {
  productionBatchId: string;
  batchNo: string;
  workOrderNo: string;
  productCode: string;
  productName: string;
}

export interface ReturnOrderCandidateItem {
  allocationId: string;
  demandId: string;
  itemId: string;
  materialVariantId: string;
  materialVariantCode: string;
  itemCode: string;
  itemName: string;
  itemBatchId: string;
  batchCode: string;
  confirmedOutboundQuantity: string;
  occupiedReturnQuantity: string;
  /** 同一分配来源待确认及已确认的领料损耗占用。 */
  occupiedLossQuantity: string;
  returnableQuantity: string;
  unit: string;
}

export interface CreateReturnOrderPayload {
  productionBatchId: string;
  remark?: string | null;
  details: Array<{
    allocationId: string;
    returnQuantity: number;
    remark?: string | null;
  }>;
}

export interface ReturnOrderDetailItem {
  id: string;
  allocationId: string;
  demandId: string;
  itemId: string;
  materialVariantId: string;
  materialVariantCode: string;
  itemCode: string;
  itemName: string;
  itemBatchId: string;
  batchCode: string;
  returnQuantity: string;
  unit: string;
  returnStockStatus: 'available';
  releaseAfterReturn: true;
  inventoryTransactionId: string | null;
  remark: string | null;
}

export interface ReturnOrderItem {
  id: string;
  returnNo: string;
  productionBatchId: string;
  batchNo: string;
  workOrderId: string;
  workOrderNo: string;
  productCode: string;
  productName: string;
  status: ReturnOrderStatus;
  returnAt: string | null;
  operatorId: string | null;
  operatorName: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
  version: number;
  remark: string | null;
  cancelReason?: string | null;
  cancelledById?: string | null;
  cancelledByName?: string | null;
  cancelledAt?: string | null;
  details: ReturnOrderDetailItem[];
}

export type CancelReturnOrderPayload = ReasonedVersionedCommand;

export interface MaterialLossQuery extends PageQuery {
  keyword?: string;
  status?: ScrapStatus;
}

export interface MaterialLossBatchOption {
  productionBatchId: string;
  batchNo: string;
  workOrderNo: string;
  productCode: string;
  productName: string;
  batchStatus: 'material_partially_outbound' | 'material_outbound' | 'doing';
}

export interface MaterialLossCandidateItem {
  allocationId: string;
  demandId: string;
  itemId: string;
  materialVariantId: string;
  materialVariantCode: string;
  itemCode: string;
  itemName: string;
  itemBatchId: string;
  batchCode: string;
  confirmedOutboundQuantity: string;
  occupiedReturnQuantity: string;
  occupiedLossQuantity: string;
  availableLossQuantity: string;
  unit: string;
}

export interface CreateMaterialLossPayload {
  productionBatchId: string;
  allocationId: string;
  scrapQuantity: number;
  reasonType: string;
  remark?: string | null;
}

export interface MaterialLossItem {
  id: string;
  scrapNo: string;
  productionBatchId: string;
  batchNo: string;
  workOrderId: string;
  workOrderNo: string;
  productCode: string;
  productName: string;
  allocationId: string;
  demandId: string;
  itemId: string;
  materialVariantId: string;
  materialVariantCode: string;
  itemCode: string;
  itemName: string;
  itemBatchId: string;
  batchCode: string;
  scrapScene: 'production_consumed';
  purpose: MaterialLossPurpose;
  closeoutId: string | null;
  scrapQuantity: string;
  unit: string;
  reasonType: string;
  status: ScrapStatus;
  confirmedById: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
  version: number;
  remark: string | null;
  cancelReason?: string | null;
  cancelledById?: string | null;
  cancelledByName?: string | null;
  cancelledAt?: string | null;
  supplement: null | {
    supplementId: string;
    supplementNo: string;
    status: 'approved' | 'fulfilled' | 'cancelled';
    demandId: string;
    demandQuantity: string;
  };
}

export type CancelMaterialLossPayload = ReasonedVersionedCommand;

export interface StockCheckOrderQuery extends PageQuery {
  keyword?: string;
  status?: StockCheckStatus;
}

export interface StockCheckCandidateItem {
  itemId: string;
  materialVariantId: string;
  materialVariantCode: string;
  itemCode: string;
  itemName: string;
  itemBatchId: string;
  batchCode: string;
  stockStatus: StockStatus;
  systemQuantity: string;
  unit: string;
}

export interface StockCheckCandidateQuery extends PageQuery {
  keyword?: string;
  stockStatus?: StockStatus;
}

export interface CreateStockCheckPayload {
  checkNo?: string | null;
  remark?: string | null;
  details: Array<{
    itemBatchId: string;
    stockStatus: StockStatus;
  }>;
}

export interface SaveStockCheckCountsPayload extends VersionedCommand {
  details: Array<{
    detailId: string;
    actualQuantity: number;
    remark?: string | null;
  }>;
}

export interface StockCheckDetailItem {
  id: string;
  itemId: string;
  materialVariantId: string;
  materialVariantCode: string;
  itemCode: string;
  itemName: string;
  itemBatchId: string;
  batchCode: string;
  stockStatus: StockStatus;
  unit: string;
  systemQuantity: string;
  actualQuantity: string | null;
  differenceQuantity: string | null;
  result: StockCheckResult | null;
  adjusted: boolean;
  remark: string | null;
}

export type CancelStockCheckPayload = ReasonedVersionedCommand;

export interface StockCheckOrderItem {
  id: string;
  checkNo: string;
  status: StockCheckStatus;
  checkAt: string | null;
  operatorId: string | null;
  operatorName: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
  version: number;
  remark: string | null;
  cancelReason?: string | null;
  cancelledById?: string | null;
  cancelledByName?: string | null;
  cancelledAt?: string | null;
  detailCount: number;
  pendingCount: number;
  differenceCount: number;
  details: StockCheckDetailItem[];
}

export interface InventoryBatchQuery extends PageQuery {
  itemKind?: 'material' | 'finished_product';
  sourceType?: InventorySourceType;
  keyword?: string;
  batchCode?: string;
  batchStatus?: InventoryBatchStatus;
}

export interface InventoryMaterialSupplyDemandQuery extends PageQuery {
  keyword?: string;
}

export interface InventoryMaterialSupplyDemandItem {
  itemId: string;
  materialVariantId: string;
  materialVariantCode: string;
  itemCode: string;
  itemName: string;
  unit: string;
  totalInventoryQuantity: string;
  availableInventoryQuantity: string;
  unavailableInventoryQuantity: string;
  openDemandQuantity: string;
  shortageQuantity: string;
  isShortage: boolean;
}

export interface InventoryMaterialDemandTraceQuery extends PageQuery {
  materialVariantId: string;
}

export interface InventoryMaterialDemandTraceItem {
  demandId: string;
  pendingCorrectionId?: string | null;
  replacesDemandId?: string | null;
  itemId: string;
  materialVariantId: string;
  materialVariantCode: string;
  productionBatchId: string;
  batchNo: string;
  workOrderId: string;
  workOrderNo: string;
  demandType: DemandType;
  demandQuantity: string;
  remainingDemandQuantity: string;
  unit: string;
  parentDemandId: string | null;
  supplementId: string | null;
  supplementNo: string | null;
  abnormalDispositionNo: string | null;
  materialLossScrapNo: string | null;
  createdAt: string;
}

export interface InventoryBatchItem {
  itemBatchId: string;
  itemKind: 'material' | 'finished_product';
  itemId: string | null;
  productId: string | null;
  materialVariantId: string | null;
  materialVariantCode: string | null;
  itemCode: string;
  itemName: string;
  unit: string;
  batchCode: string;
  sourceType: InventorySourceType;
  provider: string | null;
  batchStatus: InventoryBatchStatus;
  onHandAvailableQuantity: string;
  reservedQuantity: string;
  availableToAllocateQuantity: string;
  sourceWorkOrderId: string | null;
  sourceWorkOrderNo: string | null;
  sourceProductionBatchId: string | null;
  sourceProductionBatchNo: string | null;
  inboundSources: Array<{
    inboundId: string;
    inboundNo: string;
    provider: string | null;
    inboundAt: string;
    inboundQuantity: string;
    inventoryTransactionId: string;
    sourceType: InventorySourceType;
    outputRevisionId: string | null;
    outputRevisionNo: number | null;
  }>;
}

export interface InventoryBatchTransactionItem {
  inventoryTransactionId: string;
  transactionType: InventoryTransactionType;
  quantity: string;
  unit: string;
  stockStatus: StockStatus;
  referenceType: InventoryReferenceType;
  referenceDetailId: string;
  transactionGroupKey: string | null;
  reversalOfInventoryTransactionId: string | null;
  remark: string | null;
  transactionAt: string;
}

export interface InventoryBatchDetailItem extends InventoryBatchItem {
  inventoryTransactions: InventoryBatchTransactionItem[];
}
