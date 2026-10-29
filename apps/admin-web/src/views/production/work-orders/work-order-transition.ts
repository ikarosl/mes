export type WorkOrderTransitionMode = 'complete' | 'early-close' | 'archive';

export interface WorkOrderTransitionValue {
  mode: WorkOrderTransitionMode;
  reason: string | null;
}
