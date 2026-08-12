import type {
  InboundOrderStatus,
  InventoryBatchItem,
  MaterialOutboundItem,
  OutboundOrderStatus,
  PurchaseInboundOrderItem,
} from '@company/contracts';

const INBOUND_STATUS_HINTS: Record<InboundOrderStatus, string> = {
  pending: '尚未计入库存',
  completed: '已计入可分配库存',
  cancelled: '未产生库存',
};

const OUTBOUND_STATUS_HINTS: Record<OutboundOrderStatus, string> = {
  pending_picking: '尚未扣减库存',
  picked: '已拣料，待完成出库',
  partially_outbound: '部分明细已出库',
  completed: '已生成负库存流水',
  cancelled: '未产生负库存流水',
};

export const inboundStatusHint = (status: InboundOrderStatus): string =>
  INBOUND_STATUS_HINTS[status];

export const outboundStatusHint = (status: OutboundOrderStatus): string =>
  OUTBOUND_STATUS_HINTS[status];

export const inboundRowClass = ({ row }: { row: PurchaseInboundOrderItem }): string =>
  row.status === 'pending'
    ? 'status-warning-row'
    : row.status === 'cancelled'
      ? 'status-muted-row'
      : '';

export const outboundRowClass = ({ row }: { row: MaterialOutboundItem }): string =>
  row.status === 'pending_picking' || row.status === 'picked' || row.status === 'partially_outbound'
    ? 'status-warning-row'
    : row.status === 'cancelled'
      ? 'status-muted-row'
      : '';

export const inventoryRowClass = ({ row }: { row: InventoryBatchItem }): string => {
  if (row.batchStatus === 'frozen') return 'status-warning-row';
  if (row.batchStatus === 'disabled') return 'status-muted-row';
  return Number(row.availableToAllocateQuantity) <= 0 ? 'status-empty-row' : '';
};

export const inventoryAvailabilityHint = (row: InventoryBatchItem): string => {
  if (row.batchStatus === 'frozen') return '已冻结，不可分配';
  if (row.batchStatus === 'disabled') return '已停用，不可分配';
  if (Number(row.availableToAllocateQuantity) <= 0) return '当前无可分配量';
  if (Number(row.reservedQuantity) > 0) return '已扣除有效预留';
  return '可用于生产分配';
};
