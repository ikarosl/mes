import type { FinishedGoodsInboundCandidate, InventoryInboundTarget } from '@company/contracts';

export interface FinishedInboundSelection {
  rowKey: string;
  source: FinishedGoodsInboundCandidate;
  quantity: string;
  target: InventoryInboundTarget;
}
