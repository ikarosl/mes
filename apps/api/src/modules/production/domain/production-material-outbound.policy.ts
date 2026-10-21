import type { ProductionBatchStatus, ProductionMaterialAllocationItem } from '@company/contracts';
import { integerQuantity } from './integer-quantity.js';
import { ProductionDomainError } from './production.errors.js';
import { requireBatchTransition } from './production-status.policy.js';

export interface MaterialOutboundQuantitySnapshot {
  assignedQuantity: string | number;
  issuedQuantity: string | number;
  pendingQuantity: string | number;
}

/** 待出库单占可制单量，已领事实占剩余可领量；退料不恢复原分配。 */
export const materialOutboundAvailableQuantities = (
  snapshot: MaterialOutboundQuantitySnapshot,
): { remainingQuantity: number; orderableQuantity: number } => {
  const remaining =
    integerQuantity(snapshot.assignedQuantity) - integerQuantity(snapshot.issuedQuantity);
  return {
    remainingQuantity: Math.max(0, remaining),
    orderableQuantity: Math.max(0, remaining - integerQuantity(snapshot.pendingQuantity)),
  };
};

export interface MaterialOutboundConfirmationLine {
  allocationId: string;
  demandId: string;
  itemId: string;
  materialVariantId: string;
  batchId: string;
  quantity: string | number;
}

export interface MaterialOutboundConfirmationAllocation {
  id: string;
  productionBatchId: string;
  status: ProductionMaterialAllocationItem['allocationStatus'];
  assignedQuantity: string | number;
  issuedQuantity: string | number;
}

export interface MaterialOutboundConfirmationPlan {
  stockRequests: Array<{
    batchId: string;
    itemId: string;
    materialVariantId: string;
    quantity: number;
  }>;
  demandRequests: Array<{ demandId: string; quantity: number }>;
}

/** 在持久化层取得当前分配与库存锁后，按原明细顺序核验并汇总本次履约。 */
export const planMaterialOutboundConfirmation = (
  productionBatchId: string,
  details: readonly MaterialOutboundConfirmationLine[],
  allocations: readonly MaterialOutboundConfirmationAllocation[],
): MaterialOutboundConfirmationPlan => {
  const byAllocation = new Map(allocations.map((allocation) => [allocation.id, allocation]));
  const requestedByBatch = new Map<
    string,
    MaterialOutboundConfirmationPlan['stockRequests'][number]
  >();
  const requestedByDemand = new Map<string, number>();
  for (const detail of details) {
    const allocation = byAllocation.get(detail.allocationId);
    if (
      !allocation ||
      allocation.status !== 'active' ||
      allocation.productionBatchId !== productionBatchId
    )
      throw new ProductionDomainError('OUTBOUND_ALLOCATION_CHANGED', '出库单对应分配已失效');
    if (
      integerQuantity(allocation.issuedQuantity) + integerQuantity(detail.quantity) >
      integerQuantity(allocation.assignedQuantity)
    )
      throw new ProductionDomainError('OUTBOUND_EXCEEDS_ALLOCATION', '出库数量超过分配剩余量');
    const current = requestedByBatch.get(detail.batchId);
    requestedByBatch.set(detail.batchId, {
      batchId: detail.batchId,
      itemId: detail.itemId,
      materialVariantId: detail.materialVariantId,
      quantity: (current?.quantity ?? 0) + integerQuantity(detail.quantity),
    });
    requestedByDemand.set(
      detail.demandId,
      (requestedByDemand.get(detail.demandId) ?? 0) + integerQuantity(detail.quantity),
    );
  }
  return {
    stockRequests: [...requestedByBatch.values()],
    demandRequests: [...requestedByDemand].map(([demandId, quantity]) => ({ demandId, quantity })),
  };
};

export const requireMaterialOutboundStockQuantities = (
  requests: readonly MaterialOutboundConfirmationPlan['stockRequests'][number][],
  stocks: readonly { id: string; availableQuantity: string | number }[],
): void => {
  const stocksById = new Map(stocks.map((stock) => [stock.id, stock]));
  for (const requested of requests) {
    if (
      requested.quantity >
      integerQuantity(stocksById.get(requested.batchId)?.availableQuantity ?? 0)
    )
      throw new ProductionDomainError(
        'INSUFFICIENT_AVAILABLE_STOCK',
        '库存账面可用数量不足，整单未扣减',
      );
  }
};

/** 领料仅推进未开工任务的物料阶段，已开工任务继续执行。 */
export const materialOutboundBatchStatus = (
  current: ProductionBatchStatus,
  allDemandsOutbound: boolean,
): ProductionBatchStatus => {
  const next = allDemandsOutbound ? 'material_outbound' : 'material_partially_outbound';
  if (
    (allDemandsOutbound &&
      ['material_pending', 'material_assigned', 'material_partially_outbound'].includes(current)) ||
    (!allDemandsOutbound && ['material_pending', 'material_assigned'].includes(current))
  ) {
    requireBatchTransition(current, next);
    return next;
  }
  return current;
};
