import type { ProductionOutputRoundStatus } from '@company/contracts';

type RoundTagAppearance = {
  type: 'primary' | 'success' | 'warning' | 'info';
  effect: 'light' | 'plain';
};

const FINISHED_ROUND_TAGS: Record<ProductionOutputRoundStatus, RoundTagAppearance> = {
  pending_inspection: { type: 'info', effect: 'light' },
  inspecting: { type: 'primary', effect: 'light' },
  pending_finalization: { type: 'warning', effect: 'light' },
  reviewing: { type: 'primary', effect: 'plain' },
  finalized: { type: 'success', effect: 'plain' },
  superseded: { type: 'info', effect: 'plain' },
};

export const finishedRoundTagType = (
  status: ProductionOutputRoundStatus,
): RoundTagAppearance['type'] => FINISHED_ROUND_TAGS[status].type;
export const finishedRoundTagEffect = (
  status: ProductionOutputRoundStatus,
): RoundTagAppearance['effect'] => FINISHED_ROUND_TAGS[status].effect;
