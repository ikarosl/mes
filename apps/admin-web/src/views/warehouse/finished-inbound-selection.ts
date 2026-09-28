import type { FinishedGoodsInboundCandidate, InventoryInboundTarget } from '@company/contracts';

export interface FinishedInboundSelection {
  detailKey: string;
  source: FinishedGoodsInboundCandidate;
  quantity: string;
  target: InventoryInboundTarget;
}
