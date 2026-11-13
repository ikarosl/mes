import type { WorkOrderOption } from '@company/contracts';
import { productionWorkOrdersApi } from '../../../api/production/work-orders';
import { useRefreshableOptions } from '../../../composables/options/useRefreshableOptions';
import { formatQuantity } from '../../../utils/quantity';

/** 任务弹窗自持可建任务的工单候选；计划内剩余或累计超计划仅供核对，不作为数量上限。 */
export function useWorkOrderOptions() {
  const source = useRefreshableOptions(
    () => productionWorkOrdersApi.workOrderOptions(),
    '工单选项刷新失败，暂时保留上次数据',
  );

  const formatOption = (order: WorkOrderOption): string => {
    const remaining = Number(order.remainingQuantity);
    const balance =
      remaining < 0
        ? `累计超计划 ${formatQuantity(-remaining)}`
        : `计划内剩余 ${formatQuantity(remaining)}`;
    return `${order.workOrderNo} / ${order.productCode} / ${order.productName} / ${balance}`;
  };

  return { ...source, formatOption };
}
