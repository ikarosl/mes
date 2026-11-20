import type { ProductionTrackingCardDetail, ProductionTrackingStep } from '@company/contracts';
import { trackingCardLocation, type TrackingCardAction } from './tracking-presentation';

interface WorkbenchCardContext {
  batchId: string | null;
  stepId: string;
  ready: boolean;
  steps: ProductionTrackingStep[];
}

export function workbenchCardReadOnlyReason(
  card: ProductionTrackingCardDetail | null,
  context: WorkbenchCardContext,
  action?: TrackingCardAction,
): string {
  if (!card) return '';
  if (!context.ready || !context.steps.some((step) => step.stepRecordId === context.stepId))
    return '工作台任务、工序或人员资料尚未核实，当前仅可查看追踪；请刷新准备信息后核对。';
  if (card.productionBatchId !== context.batchId)
    return '本盘不属于工作台当前所选任务，当前仅可查看追踪。';
  if (card.currentStepRecordId !== context.stepId)
    return `本盘${trackingCardLocation(card)}，与工作台当前所选工序不一致，当前仅可查看追踪。`;
  if (action === 'output') {
    const lastStep = context.steps.reduce((last, step) =>
      step.stepOrder > last.stepOrder ? step : last,
    );
    if (context.stepId !== lastStep.stepRecordId)
      return '终检确认产出须选择本任务末站，并与本盘当前位置一致。';
  }
  return '';
}

export function workbenchDuplicateScanMessage(
  card: ProductionTrackingCardDetail,
  stepRecordId: string,
): string {
  if (card.currentStepRecordId === stepRecordId) {
    if (card.status === 'completed') return '本盘已完成终检，重复扫描未新增登记，仅可查看追踪。';
    return '本盘已在当前工序登记，重复扫描未计量，原登记人保留。';
  }
  const visit = card.visits.find((item) => item.stepRecordId === stepRecordId);
  const stepName = visit?.stepName || '所选工序';
  const previous = visit?.completedAt ? `${stepName}已交接` : `${stepName}已有到站记录`;
  return `本盘${previous}，${trackingCardLocation(card)}；本次回扫未新增登记，仅可查看追踪。`;
}
