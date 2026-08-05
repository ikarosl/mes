import type { WorkOrderOption } from '@company/contracts';
import { productionApi } from '../../../api/production';
import { useRefreshableOptions } from '../../../composables/options/useRefreshableOptions';
import { formatQuantity } from '../production-status';

/**
 * 已下达工单候选（任务表单弹窗自持，本地过滤）：
 *  - 走 /production/work-orders/options 契约：后端完整返回全部 released 且仍有余量的工单，前端本地 filterable。
 *  - 数据新鲜度由弹窗打开、下拉展开、页面激活时 refresh() 保证（useRefreshableOptions：last-request-wins、
 *    失败保留上次成功快照并局部提示）。
 *  - label 包含工单号、产品编码、产品名称与剩余数量，供 Element Plus filterable 本地搜索。
 *
 * 所有权（T1）：TaskFormDialog 持有实例，负责打开/展开/页面激活刷新；页面不持有、不预载。
 */
export function useWorkOrderOptions() {
  const source = useRefreshableOptions(
    () => productionApi.workOrderOptions(),
    '工单选项刷新失败，暂时保留上次数据',
  );

  const formatOption = (order: WorkOrderOption): string =>
    `${order.workOrderNo} / ${order.productCode} / ${order.productName} / 剩余 ${formatQuantity(
      order.remainingQuantity,
    )}`;

  return { ...source, formatOption };
}
