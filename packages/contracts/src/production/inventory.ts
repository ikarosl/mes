import type { PageQuery, VersionedCommand } from '../common.js';
import type {
  ReturnOrderStatus,
  ScrapStatus,
  StockCheckStatus,
  StockCheckResult,
  StockStatus,
  InventoryBatchStatus,
  InventorySourceType,
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
  itemCode: string;
  itemName: string;
  itemBatchId: string;
  batchCode: string;
  confirmedOutboundQuantity: string;
  occupiedReturnQuantity: string;
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
  details: ReturnOrderDetailItem[];
}

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
  batchStatus: 'material_outbound' | 'doing';
}

export interface MaterialLossCandidateItem {
  allocationId: string;
  demandId: string;
  itemId: string;
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
  itemCode: string;
  itemName: string;
  itemBatchId: string;
  batchCode: string;
  scrapScene: 'production_consumed';
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
  supplement: null | {
    supplementId: string;
    supplementNo: string;
    status: 'approved' | 'fulfilled';
    demandId: string;
    demandQuantity: string;
  };
}

export interface StockCheckOrderQuery extends PageQuery {
  keyword?: string;
  status?: StockCheckStatus;
}

export interface StockCheckCandidateItem {
  itemId: string;
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
  detailCount: number;
  pendingCount: number;
  differenceCount: number;
  details: StockCheckDetailItem[];
}

export interface InventoryBatchQuery extends PageQuery {
  keyword?: string;
  batchCode?: string;
  batchStatus?: InventoryBatchStatus;
}

export interface InventoryBatchItem {
  itemBatchId: string;
  itemId: string;
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
  inboundSources: Array<{
    inboundId: string;
    inboundNo: string;
    provider: string | null;
    inboundAt: string;
    inboundQuantity: string;
    inventoryTransactionId: string;
  }>;
}
