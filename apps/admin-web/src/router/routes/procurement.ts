import type { RouteRecordRaw } from 'vue-router';
import { PERMISSIONS } from '@company/constants';
import SuppliersPage from '../../views/procurement/SuppliersPage.vue';
import PurchaseOrdersPage from '../../views/procurement/PurchaseOrdersPage.vue';
import PurchaseReceiptsPage from '../../views/procurement/PurchaseReceiptsPage.vue';
import { page } from '../page';

export const procurementRoutes: RouteRecordRaw[] = [
  page(
    'procurement/suppliers',
    'procurement-suppliers',
    '供应商配置',
    SuppliersPage,
    PERMISSIONS.procurement.suppliers.view,
    'SuppliersPage',
  ),
  page(
    'procurement/purchase-orders',
    'procurement-orders',
    '采购单',
    PurchaseOrdersPage,
    PERMISSIONS.procurement.orders.view,
    'PurchaseOrdersPage',
  ),
  page(
    'procurement/receipts',
    'procurement-receipts',
    '采购到货',
    PurchaseReceiptsPage,
    PERMISSIONS.warehouse.receipts.view,
    'PurchaseReceiptsPage',
  ),
];
