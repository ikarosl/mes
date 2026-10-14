export interface ProductionCurrentAllocation {
  id: string;
  batchId: string;
  assignedNumber: string;
  allocationStatus: 'active' | 'frozen' | 'abnormal';
}

export class ProductionReservationReadError extends Error {
  readonly code = 'CONCURRENT_MODIFICATION';
}

/** 仅公开当前有效预留事实，不提供来源资格或分配写能力。 */
export abstract class ProductionReservationQuery {
  /** 调用者同池事务中按 ID 排序 FOR SHARE NOWAIT，只锁 Production 自有分配。 */
  abstract currentAllocations(batchIds: string[]): Promise<ProductionCurrentAllocation[]>;
}
