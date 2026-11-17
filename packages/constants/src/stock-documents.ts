import { PERMISSIONS } from './permissions.js';

export const STOCK_DOCUMENT_DIRECTIONS = ['inbound', 'outbound'] as const;
export const STOCK_DOCUMENT_DIRECTION_LABELS = { inbound: '入库', outbound: '出库' } as const;
export const STOCK_DOCUMENT_ITEM_KINDS = ['material', 'finished_product'] as const;
export const STOCK_DOCUMENT_SOURCE_TYPES = [
  'purchased',
  'finished_product',
  'return_inbound',
  'production_material',
  'other',
] as const;
export const STOCK_DOCUMENT_SOURCE_LABELS = {
  purchased: '采购入库',
  finished_product: '生产入库',
  return_inbound: '生产退料',
  production_material: '生产领料',
  other: '其他',
} as const;
export const STOCK_DOCUMENT_STATUSES = [
  'pending',
  'pending_picking',
  'completed',
  'cancelled',
] as const;
export const STOCK_DOCUMENT_STATUS_LABELS = {
  pending: '待确认',
  pending_picking: '待确认',
  completed: '已确认',
  cancelled: '已取消',
} as const;

/** Only current stock-document scenarios; reserved ledger codes do not grant access. */
export const STOCK_DOCUMENT_SCENARIOS = [
  {
    direction: 'inbound',
    itemKind: 'material',
    sourceType: 'purchased',
    label: '采购入库',
    viewPermission: PERMISSIONS.warehouse.inbound.view,
  },
  {
    direction: 'inbound',
    itemKind: 'finished_product',
    sourceType: 'finished_product',
    label: '生产入库',
    viewPermission: PERMISSIONS.warehouse.inbound.view,
  },
  {
    direction: 'inbound',
    itemKind: 'material',
    sourceType: 'return_inbound',
    label: '生产退料',
    viewPermission: PERMISSIONS.warehouse.returns.view,
  },
  {
    direction: 'inbound',
    itemKind: 'material',
    sourceType: 'other',
    label: '其他入库',
    viewPermission: PERMISSIONS.warehouse.otherInbounds.view,
  },
  {
    direction: 'inbound',
    itemKind: 'finished_product',
    sourceType: 'other',
    label: '其他入库',
    viewPermission: PERMISSIONS.warehouse.otherInbounds.view,
  },
  {
    direction: 'outbound',
    itemKind: 'material',
    sourceType: 'production_material',
    label: '生产领料',
    viewPermission: PERMISSIONS.warehouse.outbound.view,
  },
  {
    direction: 'outbound',
    itemKind: 'material',
    sourceType: 'other',
    label: '其他出库',
    viewPermission: PERMISSIONS.warehouse.otherOutbounds.view,
  },
  {
    direction: 'outbound',
    itemKind: 'finished_product',
    sourceType: 'other',
    label: '其他出库',
    viewPermission: PERMISSIONS.warehouse.otherOutbounds.view,
  },
] as const;

export const STOCK_DOCUMENT_VIEW_PERMISSIONS = [
  PERMISSIONS.warehouse.inbound.view,
  PERMISSIONS.warehouse.returns.view,
  PERMISSIONS.warehouse.otherInbounds.view,
  PERMISSIONS.warehouse.outbound.view,
  PERMISSIONS.warehouse.otherOutbounds.view,
] as const;
