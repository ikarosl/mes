import type {
  ProductionTrackingAbnormalityHandling,
  ProductionTrackingCardDetail,
  ProductionTrackingCardItem,
  ProductionTrackingCardStatus,
  ProductionTrackingStep,
  ProductionTrackingVisit,
} from '@company/contracts';
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
export function trackingCardLocation(
  card: Pick<ProductionTrackingCardItem, 'status' | 'currentStepName'>,
): string {
  if (!card.currentStepName) return '未到站';
  if (card.status === 'completed') return `末站：${card.currentStepName}`;
  if (card.status === 'scrapped' || card.status === 'voided')
    return `最后在站：${card.currentStepName}`;
  return `在站：${card.currentStepName}`;
}

interface TrackingFlowRow {
  stepRecordId: string;
  stepOrder: number;
  stepName: string;
  visit: ProductionTrackingVisit | null;
  status: { label: string; type: StatusTagType };
}

export function trackingFlowRows(
  card: ProductionTrackingCardDetail | null,
  steps: ProductionTrackingStep[],
): TrackingFlowRow[] {
  if (!card) return [];
  const visits = new Map(card.visits.map((visit) => [visit.stepRecordId, visit]));
  const routeSteps = steps.map((step) => ({
    stepRecordId: step.stepRecordId,
    stepOrder: step.stepOrder,
    stepName: step.stepName,
  }));
  const frozenStepIds = new Set(steps.map((step) => step.stepRecordId));
  for (const visit of card.visits) {
    if (!frozenStepIds.has(visit.stepRecordId)) {
      routeSteps.push({
        stepRecordId: visit.stepRecordId,
        stepOrder: visit.stepOrder,
        stepName: visit.stepName,
      });
    }
  }
  routeSteps.sort((a, b) => a.stepOrder - b.stepOrder);
  return routeSteps.map((step) => {
    const visit = visits.get(step.stepRecordId) ?? null;
    let status: TrackingFlowRow['status'] = { label: '未到站', type: 'info' };
    if (visit?.completedAt) {
      status = {
        label:
          card.status === 'completed' && step.stepRecordId === card.currentStepRecordId
            ? '已完工'
            : '已交接',
        type: 'success',
      };
    } else if (visit) {
      status = { label: '已到站', type: 'primary' };
    }
    return { ...step, visit, status };
  });
}

export function trackingVisitQuantity(visit: ProductionTrackingVisit | null): string {
  if (!visit) return '—';
  if (visit.reportedQuantity === null) return '尚未报工';
  return `${formatQuantity(visit.reportedQuantity)} ${visit.unit}`;
}

export function trackingReferencedScrapQuantity(
  handling: ProductionTrackingAbnormalityHandling,
): number {
  return handling.scrapReferences.reduce(
    (total, reference) => total + Number(reference.quantity),
    0,
  );
}

export type TrackingCardAction = 'quantity' | 'void' | 'abnormality' | 'handling' | 'output';
export const TRACKING_ACTION_LABELS: Record<TrackingCardAction, string> = {
  quantity: '更正盘量',
  void: '作废追踪卡',
  abnormality: '登记随盘异常',
  handling: '处理异常并结算',
  output: '终检确认产出',
};
