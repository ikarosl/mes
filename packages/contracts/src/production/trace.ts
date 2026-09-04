import type { PageQuery } from '../common.js';
import type { ProductionBatchStatus } from './statuses.js';
import type { ProductionMaterialDemandItem } from './material.js';
import type { MaterialOutboundItem } from './outbound.js';
import type { BatchStepExecutionRecordItem } from './execution.js';

export interface ProductionTraceQuery extends PageQuery {
  keyword?: string;
}

export interface ProductionTraceBatchSummary {
  productionBatchId: string;
  batchNo: string;
  batchStatus: ProductionBatchStatus;
  workOrderId: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  plannedQuantity: string;
  completedQuantity: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ProductionTraceWorkOrderGroup {
  workOrderId: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  batches: ProductionTraceBatchSummary[];
}

export interface ProductionTraceInventoryTransaction {
  transactionId: string;
  outboundDetailId: string;
  itemId: string;
  materialVariantId: string;
  materialVariantCode: string;
  itemCode: string;
  itemName: string;
  itemBatchId: string;
  batchCode: string;
  quantity: string;
  unit: string;
  transactionAt: string;
}

export interface ProductionTraceDetail {
  summary: ProductionTraceBatchSummary;
  materialDemands: ProductionMaterialDemandItem[];
  materialOutbounds: MaterialOutboundItem[];
  inventoryTransactions: ProductionTraceInventoryTransaction[];
  materialInboundSources: Array<{
    itemBatchId: string;
    materialVariantId: string;
    materialVariantCode: string;
    batchCode: string;
    itemCode: string;
    itemName: string;
    sourceLabel: 'purchase_inbound' | 'initial_stock';
    inboundNo: string | null;
    provider: string | null;
    confirmedAt: string | null;
    inboundQuantity: string;
    inventoryTransactionId: string;
  }>;
  steps: BatchStepExecutionRecordItem[];
}
