import type { ProductionTrackingCardItem, ProductionTrackingCardStatus } from '@company/contracts';
import { PRODUCTION_TRACKING_CARD_STATUS_LABELS } from '@company/constants';
import { formatQuantity } from '../../../utils/quantity';
import type { StatusTagType } from '../shared/production-status';

const CARD_STATUS_TYPES: Record<ProductionTrackingCardStatus, StatusTagType> = {
  unused: 'info',
  in_progress: 'primary',
  completed: 'success',
  scrapped: 'danger',
  voided: 'info',
};
export const trackingCardStatus = (status: ProductionTrackingCardStatus) => ({
  label: PRODUCTION_TRACKING_CARD_STATUS_LABELS[status],
  type: CARD_STATUS_TYPES[status],
});
export function trackingOutputLabel(
  card: Pick<ProductionTrackingCardItem, 'status' | 'availableQuantity' | 'unit'>,
): string {
  if (card.status === 'scrapped') return '整盘报废，无产出入库';
  if (card.status === 'voided' && card.availableQuantity === null) return '已作废，未确认产出';
  return card.availableQuantity === null
    ? '尚未定稿'
    : `${formatQuantity(card.availableQuantity)} ${card.unit}`;
}
export type TrackingCardAction = 'quantity' | 'void' | 'abnormality' | 'handling' | 'output';
export const TRACKING_ACTION_LABELS: Record<TrackingCardAction, string> = {
  quantity: '更正盘量',
  void: '作废追踪卡',
  abnormality: '登记随盘异常',
  handling: '处理异常并结算',
  output: '终检确认产出',
};
