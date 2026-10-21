export interface InventoryAllocationReservation {
  id: string;
  batchId: string;
  assignedNumber: string;
  allocationStatus: 'active' | 'frozen' | 'abnormal';
}

/** 仅提供当前预留事实，不回调来源命令或授予领料资格。必须复用调用者事务，NOWAIT。 */
export abstract class InventoryReservationReadPort {
  abstract currentAllocations(batchIds: string[]): Promise<InventoryAllocationReservation[]>;
}
