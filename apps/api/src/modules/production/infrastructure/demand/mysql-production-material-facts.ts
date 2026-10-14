import type {
  InventoryProductionDocumentCommand,
  InventoryProductionDocumentFacts,
} from '../../../inventory/public.js';
import type { AllocationRow, DemandRow } from './mysql-production-material.mapper.js';
import { integerQuantity } from '../../domain/integer-quantity.js';

export interface ProductionMaterialQuantities {
  issued: Map<string, number>;
  pendingIssue: Map<string, number>;
  occupiedReturn: Map<string, number>;
  issuedByDemand: Map<string, number>;
}

/** 实核与关闭需求共用剩余预留／异常／未确认领料的判断。 */
export const allocationRequiresCloseout = (
  allocation: { id: string; status: string; assignedQuantity: string | number },
  quantities: ProductionMaterialQuantities,
): boolean =>
  !['released', 'cancelled'].includes(allocation.status) &&
  (['frozen', 'abnormal'].includes(allocation.status) ||
    Number(allocation.assignedQuantity) > (quantities.issued.get(allocation.id) ?? 0) ||
    (quantities.pendingIssue.get(allocation.id) ?? 0) > 0);

/** 公共实际单据按生产场景返回，人工其他单永不参与生产履约或退料额度。 */
export const materialQuantitiesOf = (
  facts: InventoryProductionDocumentFacts,
): ProductionMaterialQuantities => {
  const issued = new Map<string, number>();
  const pendingIssue = new Map<string, number>();
  const occupiedReturn = new Map<string, number>();
  const issuedByDemand = new Map<string, number>();
  const add = (map: Map<string, number>, key: string, value: string) =>
    map.set(key, (map.get(key) ?? 0) + integerQuantity(value));
  for (const order of facts.outbounds) {
    for (const line of order.details) {
      if (order.status === 'completed') {
        add(issued, line.allocationId, line.quantity);
        add(issuedByDemand, line.demandId, line.quantity);
      } else if (order.status === 'pending') {
        add(pendingIssue, line.allocationId, line.quantity);
      }
    }
  }
  for (const order of facts.returns) {
    if (order.status === 'cancelled') continue;
    for (const line of order.details) add(occupiedReturn, line.allocationId, line.quantity);
  }
  return { issued, pendingIssue, occupiedReturn, issuedByDemand };
};

export const hydrateAllocationQuantities = async (
  rows: AllocationRow[],
  documents: InventoryProductionDocumentCommand,
  lock = false,
): Promise<void> => {
  if (!rows.length) return;
  const quantities = materialQuantitiesOf(
    await documents.facts({ allocationIds: rows.map((row) => String(row.id)), lock }),
  );
  for (const row of rows) {
    row.outbound_quantity = String(quantities.issued.get(String(row.id)) ?? 0);
    row.pending_outbound_quantity = String(quantities.pendingIssue.get(String(row.id)) ?? 0);
  }
};

export const hydrateDemandQuantities = (rows: DemandRow[], allocations: AllocationRow[]): void => {
  for (const row of rows) {
    const related = allocations.filter(
      (allocation) => String(allocation.demand_id) === String(row.id),
    );
    row.outbound_quantity = String(
      related.reduce(
        (total, allocation) => total + integerQuantity(allocation.outbound_quantity),
        0,
      ),
    );
    row.remaining_allocated_quantity = String(
      related
        .filter((allocation) => !['released', 'cancelled'].includes(allocation.allocation_status))
        .reduce(
          (total, allocation) =>
            total +
            Math.max(
              0,
              integerQuantity(allocation.assigned_number) -
                integerQuantity(allocation.outbound_quantity),
            ),
          0,
        ),
    );
  }
};
