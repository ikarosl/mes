/** 已取消任务的原计划不占分配额度；人工结束任务仍占用原计划。 */
export const workOrderAssignedQuantitySql = (workOrderId: string, lock = false): string =>
  `COALESCE((SELECT SUM(b.planned_quantity) FROM production_batches b
    WHERE b.work_order_id=${workOrderId} AND b.status <>'cancelled'${lock ? ' FOR UPDATE' : ''}),0)`;
