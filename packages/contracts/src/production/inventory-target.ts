export type InventoryInboundTarget =
  { mode: 'new'; clientKey: string; batchCode?: string } | { mode: 'existing'; batchId: string };

export interface InventoryInboundBatchCandidate {
  batchId: string;
  batchCode: string;
  unit: string;
  batchStatus: 'available';
  availableQuantity: string;
}
