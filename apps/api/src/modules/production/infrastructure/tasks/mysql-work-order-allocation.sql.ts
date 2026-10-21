/** 已取消、已终止任务的原计划不占分配额度；收尾中和正常完工仍占用。 */
export const workOrderAssignedQuantitySql = (workOrderId: string, lock = false): string =>
  `COALESCE((SELECT SUM(b.planned_quantity) FROM production_batches b
    WHERE b.work_order_id=${workOrderId} AND b.status NOT IN ('cancelled','terminated')${lock ? ' FOR UPDATE' : ''}),0)`;

/** 只读历史展示，不参与分配上限，也不抵扣审定产出。 */
export const workOrderTerminatedPlanSql = (workOrderId: string): string =>
  `COALESCE((SELECT SUM(b.planned_quantity) FROM production_batches b
    WHERE b.work_order_id=${workOrderId} AND b.status='terminated'),0)`;
