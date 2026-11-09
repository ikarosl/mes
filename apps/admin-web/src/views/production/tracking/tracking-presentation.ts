import type { ProductionTrackingCardStatus } from '@company/contracts';
import { PRODUCTION_TRACKING_CARD_STATUS_LABELS } from '@company/constants';
import type { StatusTagType } from '../shared/production-status';

const CARD_STATUS_TYPES: Record<ProductionTrackingCardStatus, StatusTagType> = {
  unused: 'info',
  in_progress: 'primary',
  completed: 'success',
  voided: 'info',
};
export const trackingCardStatus = (status: ProductionTrackingCardStatus) => ({
  label: PRODUCTION_TRACKING_CARD_STATUS_LABELS[status],
  type: CARD_STATUS_TYPES[status],
});
export type TrackingCardAction = 'quantity' | 'void' | 'abnormality' | 'handling' | 'output';
export const TRACKING_ACTION_LABELS: Record<TrackingCardAction, string> = {
  quantity: '更正盘量',
  void: '作废追踪卡',
  abnormality: '登记随盘异常',
  handling: '追加异常处理',
  output: '终检确认产出',
};
