import type {
  OtherInventoryDirection,
  OtherInventoryLine,
  OtherInventoryOrder,
  OtherInventoryStatus,
  OtherStockObject,
} from '@company/contracts';
import { OTHER_INVENTORY_ORDER_STATUSES } from '@company/constants';

export const otherInventoryPendingStatus = (
  direction: OtherInventoryDirection,
): OtherInventoryStatus => (direction === 'inbound' ? 'pending' : 'pending_picking');
export const otherInventoryStatuses = (
  direction: OtherInventoryDirection,
): OtherInventoryStatus[] =>
  OTHER_INVENTORY_ORDER_STATUSES.filter(
    (status) =>
      status === otherInventoryPendingStatus(direction) ||
      status === 'completed' ||
      status === 'cancelled',
  );
export const otherInventoryStatusTag = (
  status: OtherInventoryStatus,
): 'success' | 'info' | 'warning' =>
  status === 'completed' ? 'success' : status === 'cancelled' ? 'info' : 'warning';
export const otherInventoryQuantity = (value: string | number): string =>
  Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
export const activeOtherInventoryLines = (order: OtherInventoryOrder): OtherInventoryLine[] =>
  order.details.filter((line) => !line.isDeleted);
export const otherInventoryQuantitySummary = (order: OtherInventoryOrder): string => {
  const quantities = new Map<string, number>();
  for (const line of activeOtherInventoryLines(order))
    quantities.set(line.unit, (quantities.get(line.unit) ?? 0) + Number(line.quantity));
  return [...quantities]
    .map(([unit, quantity]) => `${otherInventoryQuantity(quantity)} ${unit}`)
    .join('；');
};
export const otherInventoryObjectSummary = (order: OtherInventoryOrder): string =>
  [
    ...new Set(
      activeOtherInventoryLines(order).map((line) =>
        line.materialVariantCode ? `${line.itemCode} · ${line.materialVariantCode}` : line.itemCode,
      ),
    ),
  ].join('；');
export const otherInventoryNewBatchGroupLabel = (
  order: OtherInventoryOrder,
  line: OtherInventoryLine,
): string => {
  if (line.targetMode !== 'new' || !line.newBatchKey || line.isDeleted) return '';
  const keys = [
    ...new Set(
      activeOtherInventoryLines(order).flatMap((detail) =>
        detail.targetMode === 'new' && detail.newBatchKey ? [detail.newBatchKey] : [],
      ),
    ),
  ];
  return `本单新批次组 ${keys.indexOf(line.newBatchKey) + 1}`;
};
export const otherStockObjectLabel = (object: OtherStockObject): string =>
  `${object.code} · ${object.name}${object.materialVariantCode ? ` · 版本 ${object.materialVariantCode}` : ''} · ${object.unit}`;
