import type { RouteRecordRaw } from 'vue-router';
import { PERMISSIONS } from '@company/constants';
import ProductionOrdersPage from '../../views/production/work-orders/ProductionOrdersPage.vue';
import ProductionTasksPage from '../../views/production/tasks/ProductionTasksPage.vue';
import ProductionWorkbenchPage from '../../views/production/tracking/ProductionWorkbenchPage.vue';
import ProductionTrackingPage from '../../views/production/tracking/ProductionTrackingPage.vue';
import { page } from '../page';

export const productionRoutes: RouteRecordRaw[] = [
  page(
    'production/orders',
    'production-orders',
    '工单管理',
    ProductionOrdersPage,
    PERMISSIONS.production.orders.view,
    'ProductionOrdersPage',
  ),
  page(
    'production/tasks',
    'production-tasks',
    '生产任务',
    ProductionTasksPage,
    PERMISSIONS.production.tasks.view,
    'ProductionTasksPage',
  ),
  page(
    'production/workbench',
    'production-workbench',
    '员工工作台',
    ProductionWorkbenchPage,
    PERMISSIONS.production.workbench.view,
    'ProductionWorkbenchPage',
  ),
  page(
    'production/tracking',
    'production-tracking',
    '工序追踪',
    ProductionTrackingPage,
    PERMISSIONS.production.tracking.view,
    'ProductionTrackingPage',
  ),
];
