import type { PageQuery } from '../common.js';
import type { ProductionCloseoutMode } from './output.js';
import type { InventoryTransactionType, ProductionBatchStatus } from './statuses.js';
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
  /** 末工序报工数量；不代表最终质检后批准产出。 */
  completedQuantity: string;
  closeoutMode: ProductionCloseoutMode | null;
  currentOutputRevisionId: string | null;
  executionCompletedAt: string | null;
  finalOutput: {
    revisionNo: number;
    availableQuantity: string;
    extraQuantity: string;
    scrapQuantity: string;
    plannedShortfallQuantity: string;
  } | null;
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
    /** 原始正库存流水的业务类型，不根据关联单据是否存在推断。 */
    sourceLabel: InventoryTransactionType;
    /** 外购入库单号或退料单号；其他未解析来源为 null。 */
    sourceDocumentNo: string | null;
    provider: string | null;
    confirmedAt: string | null;
    inboundQuantity: string;
    inventoryTransactionId: string;
  }>;
  steps: BatchStepExecutionRecordItem[];
}
