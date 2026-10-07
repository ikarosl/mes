import type { InventoryBatchItem, OutboundOrderStatus } from '@company/contracts';
import { INVENTORY_ITEM_KINDS, OUTBOUND_ORDER_STATUSES } from '@company/constants';
import { MAX_PERSISTED_INTEGER_QUANTITY } from '@company/utils';
import { inventoryBatchStatusLabel } from '../../constants/business-status';
import { formatQuantity } from '../production/production-status';

// These models only describe the local UI preview; they are not HTTP contracts.
export type PreviewOutboundItemKind = InventoryBatchItem['itemKind'];
export type PreviewOutboundStatus = Extract<
  OutboundOrderStatus,
  'pending_picking' | 'completed' | 'cancelled'
>;

export const PREVIEW_OUTBOUND_ITEM_KINDS = [...INVENTORY_ITEM_KINDS].reverse();
export const PREVIEW_OUTBOUND_STATUSES = OUTBOUND_ORDER_STATUSES.filter(
  (status): status is PreviewOutboundStatus =>
    status === 'pending_picking' || status === 'completed' || status === 'cancelled',
);

export interface PreviewOutboundDraftLine {
  itemBatchId: string;
  quantity: string;
}

export interface PreviewOutboundDraft {
  itemKind: PreviewOutboundItemKind;
  destination: string;
  remark: string;
  details: PreviewOutboundDraftLine[];
}

export interface PreviewOutboundDetail extends Pick<
  InventoryBatchItem,
  | 'itemBatchId'
  | 'itemKind'
  | 'itemId'
  | 'productId'
  | 'materialVariantId'
  | 'materialVariantCode'
  | 'itemCode'
  | 'itemName'
  | 'batchCode'
  | 'unit'
> {
  outboundQuantity: string;
}

export interface PreviewOutboundOrder {
  id: string;
  outboundNo: string;
  itemKind: PreviewOutboundItemKind;
  destination: string;
  status: PreviewOutboundStatus;
  remark: string;
  createdByName: string;
  createdAt: string;
  operatorName: string | null;
  outboundAt: string | null;
  cancelReason: string | null;
  cancelledByName: string | null;
  cancelledAt: string | null;
  details: PreviewOutboundDetail[];
}

export interface PreviewOutboundQuery {
  itemKind?: PreviewOutboundItemKind;
  status?: PreviewOutboundStatus;
  keyword: string;
  page: number;
  pageSize: number;
}

export const previewOutboundAvailableQuantity = (batch: InventoryBatchItem): number =>
  Number(
    batch.itemKind === 'finished_product'
      ? batch.onHandAvailableQuantity
      : batch.availableToAllocateQuantity,
  );

export function previewOutboundBatchBlockReason(batch: InventoryBatchItem): string | null {
  if (batch.batchStatus !== 'available')
    return `批次${inventoryBatchStatusLabel(batch.batchStatus)}，暂不可出库`;
  if (
    batch.itemKind === 'material' &&
    (!batch.itemId || !batch.materialVariantId || !batch.materialVariantCode)
  )
    return '缺少精确物料版本，暂不可出库';
  if (batch.itemKind === 'finished_product' && !batch.productId) return '缺少成品信息，暂不可出库';
  if (previewOutboundAvailableQuantity(batch) > 0) return null;
  return batch.itemKind === 'material' && Number(batch.reservedQuantity) > 0
    ? '可用量已被生产预留占用'
    : '当前无可出库库存';
}

/** Preserve the input text and reject decimals instead of rounding them. */
export function parsePreviewOutboundQuantity(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value.trim())) return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity <= MAX_PERSISTED_INTEGER_QUANTITY
    ? quantity
    : null;
}

export function previewOutboundQuantityError(value: string, available: number): string | null {
  if (!value.trim()) return '请填写出库数量';
  const quantity = parsePreviewOutboundQuantity(value);
  if (quantity === null)
    return `请输入 1～${formatQuantity(MAX_PERSISTED_INTEGER_QUANTITY)} 的整数，不接受小数`;
  if (quantity > available) return `数量超过当前可出库量 ${formatQuantity(available)}`;
  return null;
}

export function previewOutboundQuantitySummary(details: PreviewOutboundDetail[]): string {
  const byUnit = new Map<string, number>();
  for (const detail of details)
    byUnit.set(detail.unit, (byUnit.get(detail.unit) ?? 0) + Number(detail.outboundQuantity));
  return [...byUnit].map(([unit, quantity]) => `${formatQuantity(quantity)} ${unit}`).join('；');
}

export const previewOutboundStatusTag = (
  status: PreviewOutboundStatus,
): 'warning' | 'success' | 'info' =>
  status === 'completed' ? 'success' : status === 'cancelled' ? 'info' : 'warning';

export function previewOutboundDetailSnapshot(
  batch: InventoryBatchItem,
  quantity: number,
): PreviewOutboundDetail {
  return {
    itemBatchId: batch.itemBatchId,
    itemKind: batch.itemKind,
    itemId: batch.itemId,
    productId: batch.productId,
    materialVariantId: batch.materialVariantId,
    materialVariantCode: batch.materialVariantCode,
    itemCode: batch.itemCode,
    itemName: batch.itemName,
    batchCode: batch.batchCode,
    unit: batch.unit,
    outboundQuantity: String(quantity),
  };
}

export function createPreviewOutboundInventory(): InventoryBatchItem[] {
  const finished = (
    itemBatchId: string,
    batchCode: string,
    quantity: number,
    overrides: Partial<InventoryBatchItem> = {},
  ): InventoryBatchItem => ({
    itemBatchId,
    itemKind: 'finished_product',
    itemId: null,
    productId: '30001',
    materialVariantId: null,
    materialVariantCode: null,
    itemCode: 'CP-1001',
    itemName: '驱动器壳体',
    unit: '件',
    batchCode,
    sourceType: 'finished_product',
    provider: null,
    batchStatus: 'available',
    onHandAvailableQuantity: String(quantity),
    reservedQuantity: '0',
    availableToAllocateQuantity: '0',
    sourceWorkOrderId: null,
    sourceWorkOrderNo: null,
    sourceProductionBatchId: null,
    sourceProductionBatchNo: null,
    inboundSources: [],
    ...overrides,
  });
  const material = (
    itemBatchId: string,
    batchCode: string,
    quantity: number,
    reserved: number,
    overrides: Partial<InventoryBatchItem> = {},
  ): InventoryBatchItem => ({
    itemBatchId,
    itemKind: 'material',
    itemId: '20001',
    productId: null,
    materialVariantId: '40001',
    materialVariantCode: 'WL-2001-V01',
    itemCode: 'WL-2001',
    itemName: '安装支架',
    unit: '件',
    batchCode,
    sourceType: 'purchased',
    provider: '示例供应商',
    batchStatus: 'available',
    onHandAvailableQuantity: String(quantity),
    reservedQuantity: String(reserved),
    availableToAllocateQuantity: String(quantity - reserved),
    sourceWorkOrderId: null,
    sourceWorkOrderNo: null,
    sourceProductionBatchId: null,
    sourceProductionBatchNo: null,
    inboundSources: [],
    ...overrides,
  });

  // Completed sample orders are already reflected in these current balances.
  return [
    finished('10001', 'IB20261001-1', 200),
    finished('10002', 'IB20261003-1', 80),
    finished('10003', 'IB20261005-1', 60, {
      productId: '30002',
      itemCode: 'CP-1002',
      itemName: '电机法兰',
    }),
    finished('10004', 'IB20261006-1', 30, { batchStatus: 'frozen' }),
    finished('10005', 'IB20260928-1', 0),
    material('20001', 'IB20261002-1', 120, 40),
    material('20002', 'IB20261004-1', 75, 0, {
      materialVariantId: '40002',
      materialVariantCode: 'WL-2001-V02',
    }),
    material('20003', 'IB20261005-2', 240, 0, {
      itemId: '20002',
      materialVariantId: '40003',
      materialVariantCode: 'WL-2002-V01',
      itemCode: 'WL-2002',
      itemName: '铝合金型材',
      unit: '米',
    }),
    material('20004', 'IB20261006-2', 50, 50),
    material('20005', 'IB20261007-1', 40, 0, {
      batchStatus: 'frozen',
      availableToAllocateQuantity: '0',
    }),
  ];
}

export function createPreviewOutboundOrders(
  inventory: InventoryBatchItem[],
): PreviewOutboundOrder[] {
  const details = (rows: Array<[string, number]>): PreviewOutboundDetail[] =>
    rows.map(([id, quantity]) => {
      const batch = inventory.find((item) => item.itemBatchId === id);
      if (!batch) throw new Error('示例库存批次缺失');
      return previewOutboundDetailSnapshot(batch, quantity);
    });
  const order = (
    sequence: number,
    itemKind: PreviewOutboundItemKind,
    destination: string,
    status: PreviewOutboundStatus,
    rows: Array<[string, number]>,
    overrides: Partial<PreviewOutboundOrder> = {},
  ): PreviewOutboundOrder => ({
    id: `preview-outbound-${sequence}`,
    outboundNo: `示例-CK-20261008-${String(sequence).padStart(3, '0')}`,
    itemKind,
    destination,
    status,
    remark: '',
    createdByName: '示例库管',
    createdAt: `2026-10-08T09:${String(sequence * 5).padStart(2, '0')}:00+08:00`,
    operatorName: null,
    outboundAt: null,
    cancelReason: null,
    cancelledByName: null,
    cancelledAt: null,
    details: details(rows),
    ...overrides,
  });
  return [
    order(
      1,
      'finished_product',
      '东区装配车间',
      'pending_picking',
      [
        ['10001', 40],
        ['10002', 30],
      ],
      { remark: '按库存批次分开拣货' },
    ),
    order(
      2,
      'material',
      '设备维护区',
      'pending_picking',
      [
        ['20001', 30],
        ['20003', 12],
      ],
      { remark: '支架与型材分别按单位核对' },
    ),
    order(3, 'finished_product', '样品展示区', 'completed', [['10003', 15]], {
      operatorName: '示例库管',
      outboundAt: '2026-10-08T09:30:00+08:00',
      remark: '已完成的示例记录',
    }),
    order(4, 'material', '设备维护区', 'cancelled', [['20002', 20]], {
      cancelReason: '本次维修计划取消',
      cancelledByName: '示例库管',
      cancelledAt: '2026-10-08T09:35:00+08:00',
    }),
    order(5, 'finished_product', '南区装配车间', 'pending_picking', [['10002', 70]], {
      remark: '待出库不占量，确认时重新核对库存',
    }),
  ];
}
