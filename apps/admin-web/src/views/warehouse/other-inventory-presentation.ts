import type {
  OtherInventoryDirection,
  OtherInventoryLine,
  OtherInventoryOrder,
  OtherInventoryStatus,
  OtherStockMaterial,
} from '@company/contracts';
import { OTHER_INVENTORY_ORDER_STATUSES } from '@company/constants';
import type { OtherInventoryDraftLine } from './other-inventory-draft';

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
export const otherStockMaterialLabel = (material: OtherStockMaterial): string =>
  `${material.code} · ${material.name} · ${material.unit}`;

export const otherInventoryDraftBatchSummary = (
  current: OtherInventoryDraftLine,
  lines: OtherInventoryDraftLine[],
): string => {
  if (current.target.mode !== 'new') return current.batch?.batchCode ?? '尚未选择库存批次';
  const clientKey = current.target.clientKey;
  const matchingRows = lines.flatMap((line, index) =>
    line.target.mode === 'new' && line.target.clientKey === clientKey ? [index + 1] : [],
  );
  if (matchingRows.length < 2) return '独立新建，确认时生成批号';
  const firstRow = matchingRows[0];
  return lines[firstRow - 1]?.key === current.key
    ? `新建批次，${matchingRows.length} 行共用`
    : `共用第 ${firstRow} 行的新批次（${matchingRows.length} 行）`;
};
