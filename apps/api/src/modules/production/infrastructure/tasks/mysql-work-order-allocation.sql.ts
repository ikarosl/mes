/** 非取消任务计划累计，包含正常完工和提前结束任务，与实际产出独立。 */
export const workOrderAssignedQuantitySql = (workOrderId: string): string =>
  `COALESCE((SELECT SUM(b.planned_quantity) FROM production_batches b
    WHERE b.work_order_id=${workOrderId} AND b.status <>'cancelled'),0)`;
