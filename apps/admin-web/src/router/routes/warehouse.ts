import type { RouteRecordRaw } from 'vue-router';
import { PERMISSIONS } from '@company/constants';
import InboundOrdersPage from '../../views/warehouse/InboundOrdersPage.vue';
import OutboundOrdersPage from '../../views/warehouse/OutboundOrdersPage.vue';
import ReturnOrdersPage from '../../views/warehouse/ReturnOrdersPage.vue';
import ScrapsPage from '../../views/warehouse/ScrapsPage.vue';
import StockChecksPage from '../../views/warehouse/StockChecksPage.vue';
import WarehouseInventoryPage from '../../views/warehouse/WarehouseInventoryPage.vue';
import OtherInboundsPage from '../../views/warehouse/OtherInboundsPage.vue';
import OtherOutboundsPage from '../../views/warehouse/OtherOutboundsPage.vue';
import PurchaseInboundPanel from '../../views/warehouse/components/PurchaseInboundPanel.vue';
import FinishedGoodsInboundPanel from '../../views/warehouse/components/FinishedGoodsInboundPanel.vue';
import ProductionOutboundPanel from '../../views/warehouse/components/ProductionOutboundPanel.vue';
import { page } from '../page';

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
    path: 'warehouse/inbound-orders',
    component: InboundOrdersPage,
    meta: {
      title: '入库管理',
      tab: true,
      tabName: 'warehouse-inbound',
      menuPath: '/warehouse/inbound-orders',
      keepAliveName: 'InboundOrdersPage',
    },
    children: [
      {
        path: '',
        name: 'warehouse-inbound',
        component: PurchaseInboundPanel,
        props: (route) => ({
          active: true,
          requestedInboundId:
            typeof route.query.inboundId === 'string' ? route.query.inboundId : null,
          requestedReceiptLineId:
            typeof route.query.receiptLineId === 'string' ? route.query.receiptLineId : null,
        }),
        meta: { permission: PERMISSIONS.warehouse.inbound.view },
      },
      {
        path: 'finished',
        name: 'warehouse-inbound-finished',
        component: FinishedGoodsInboundPanel,
        props: (route) => ({
          active: true,
          requestedInboundId:
            typeof route.query.inboundId === 'string' ? route.query.inboundId : null,
        }),
        meta: { permission: PERMISSIONS.warehouse.inbound.view },
      },
      {
        path: 'other',
        alias: '/warehouse/other-inbounds',
        name: 'warehouse-other-inbounds',
        component: OtherInboundsPage,
        meta: { permission: PERMISSIONS.warehouse.otherInbounds.view },
      },
    ],
  },
  {
    path: 'warehouse/outbound-orders',
    component: OutboundOrdersPage,
    meta: {
      title: '出库管理',
      tab: true,
      tabName: 'warehouse-outbound',
      menuPath: '/warehouse/outbound-orders',
      keepAliveName: 'OutboundOrdersPage',
    },
    children: [
      {
        path: '',
        name: 'warehouse-outbound',
        component: ProductionOutboundPanel,
        meta: { permission: PERMISSIONS.warehouse.outbound.view },
      },
      {
        path: 'other',
        alias: '/warehouse/other-outbounds',
        name: 'warehouse-other-outbounds',
        component: OtherOutboundsPage,
        meta: { permission: PERMISSIONS.warehouse.otherOutbounds.view },
      },
    ],
  },
  page(
    'warehouse/return-orders',
    'warehouse-returns',
    '退料管理',
    ReturnOrdersPage,
    PERMISSIONS.warehouse.returns.view,
    'ReturnOrdersPage',
  ),
  page(
    'warehouse/scraps',
    'warehouse-scraps',
    '领料损耗',
    ScrapsPage,
    PERMISSIONS.warehouse.scraps.view,
    'ScrapsPage',
  ),
  page(
    'warehouse/stock-checks',
    'warehouse-stock-checks',
    '盘点管理',
    StockChecksPage,
    PERMISSIONS.warehouse.stockChecks.view,
    'StockChecksPage',
  ),
];
