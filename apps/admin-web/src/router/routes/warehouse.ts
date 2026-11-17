import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router';
import { PERMISSIONS } from '@company/constants';
import MaterialStockDocumentsPage from '../../views/warehouse/MaterialStockDocumentsPage.vue';
import FinishedStockDocumentsPage from '../../views/warehouse/FinishedStockDocumentsPage.vue';
import StockDocumentOrdersPanel from '../../views/warehouse/StockDocumentOrdersPanel.vue';
import ScrapsPage from '../../views/warehouse/ScrapsPage.vue';
import WarehouseInventoryPage from '../../views/warehouse/WarehouseInventoryPage.vue';
import {
  STOCK_DOCUMENT_ROUTES,
  stockDocumentTabName,
} from '../../views/warehouse/stock-document-navigation';
import { page } from '../page';

const stockDocumentGroups = [
  {
    itemKind: 'material',
    segment: 'material',
    title: '物料出入库',
    component: MaterialStockDocumentsPage,
    keepAliveName: 'MaterialStockDocumentsPage',
  },
  {
    itemKind: 'finished_product',
    segment: 'finished',
    title: '成品出入库',
    component: FinishedStockDocumentsPage,
    keepAliveName: 'FinishedStockDocumentsPage',
  },
] as const;

function legacyDocument(
  to: Pick<RouteLocationNormalized, 'query' | 'hash'>,
  direction: 'inbound' | 'outbound',
  sourceType?: string,
  finished = false,
) {
  const identityKeys =
    direction === 'inbound'
      ? ['documentId', 'inboundId', 'returnId', 'otherInboundId', 'orderId', 'id']
      : ['documentId', 'outboundId', 'otherOutboundId', 'orderId', 'id'];
  const documentId = identityKeys
    .map((key) => to.query[key])
    .find((value) => typeof value === 'string' && value);
  const itemKind = finished || to.query.itemKind === 'finished_product' ? 'finished' : 'material';
  return {
    name: 'warehouse-' + itemKind + '-' + direction,
    query: {
      ...to.query,
      documentId,
      sourceType: sourceType ?? to.query.sourceType,
      inboundId: undefined,
      outboundId: undefined,
      returnId: undefined,
      otherInboundId: undefined,
      otherOutboundId: undefined,
      orderId: undefined,
      id: undefined,
    },
    hash: to.hash,
  };
}

export const warehouseRoutes: RouteRecordRaw[] = [
  page(
    'warehouse/inventory',
    'warehouse-inventory',
    '库存查询',
    WarehouseInventoryPage,
    PERMISSIONS.warehouse.inventory.view,
    'WarehouseInventoryPage',
  ),
  {
    path: 'warehouse/stock-documents',
    name: 'warehouse-stock-documents',
    redirect: { name: 'warehouse-material-inbound' },
  },
  ...stockDocumentGroups.map((group): RouteRecordRaw => {
    const scopes = STOCK_DOCUMENT_ROUTES.filter((scope) => scope.itemKind === group.itemKind);
    const tabName = stockDocumentTabName(group.itemKind);
    return {
      path: 'warehouse/stock-documents/' + group.segment,
      name: tabName,
      component: group.component,
      redirect: { name: scopes[0]?.name },
      meta: {
        title: group.title,
        tab: true,
        tabName,
        menuPath: '/warehouse/stock-documents/' + group.segment,
        keepAliveName: group.keepAliveName,
        permission: [...new Set(scopes.flatMap((scope) => scope.permission))],
      },
      children: scopes.map((scope) => ({
        path: scope.direction,
        name: scope.name,
        component: StockDocumentOrdersPanel,
        props: { itemKind: scope.itemKind, direction: scope.direction },
        meta: { permission: scope.permission },
      })),
    };
  }),
  {
    path: 'warehouse/inbound-orders',
    name: 'warehouse-inbound',
    meta: { permission: PERMISSIONS.warehouse.inbound.view },
    redirect: (to) =>
      legacyDocument(to, 'inbound', undefined, to.query.sourceType === 'finished_product'),
  },
  {
    path: 'warehouse/inbound-orders/finished',
    name: 'warehouse-inbound-finished',
    meta: { permission: PERMISSIONS.warehouse.inbound.view },
    redirect: (to) => legacyDocument(to, 'inbound', 'finished_product', true),
  },
  {
    path: 'warehouse/inbound-orders/other',
    alias: '/warehouse/other-inbounds',
    name: 'warehouse-other-inbounds',
    meta: { permission: PERMISSIONS.warehouse.otherInbounds.view },
    redirect: (to) => legacyDocument(to, 'inbound', 'other'),
  },
  {
    path: 'warehouse/outbound-orders',
    name: 'warehouse-outbound',
    meta: { permission: PERMISSIONS.warehouse.outbound.view },
    redirect: (to) => legacyDocument(to, 'outbound'),
  },
  {
    path: 'warehouse/outbound-orders/other',
    alias: '/warehouse/other-outbounds',
    name: 'warehouse-other-outbounds',
    meta: { permission: PERMISSIONS.warehouse.otherOutbounds.view },
    redirect: (to) => legacyDocument(to, 'outbound', 'other'),
  },
  {
    path: 'warehouse/return-orders',
    name: 'warehouse-returns',
    meta: { permission: PERMISSIONS.warehouse.returns.view },
    redirect: (to) => legacyDocument(to, 'inbound', 'return_inbound'),
  },
  page(
    'warehouse/scraps',
    'warehouse-scraps',
    '领料损耗',
    ScrapsPage,
    PERMISSIONS.warehouse.scraps.view,
    'ScrapsPage',
  ),
];
