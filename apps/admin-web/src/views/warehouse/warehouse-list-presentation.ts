import type { MaterialOutboundItem, OutboundOrderStatus } from '@company/contracts';

const OUTBOUND_STATUS_HINTS: Record<OutboundOrderStatus, string> = {
  pending_picking: '尚未扣减库存',
  completed: '已生成负库存流水',
  cancelled: '未产生负库存流水',
};

export const outboundStatusHint = (status: OutboundOrderStatus): string =>
  OUTBOUND_STATUS_HINTS[status];

export const outboundRowClass = ({ row }: { row: MaterialOutboundItem }): string =>
  row.status === 'pending_picking'
    ? 'status-warning-row'
    : row.status === 'cancelled'
      ? 'status-muted-row'
      : '';
