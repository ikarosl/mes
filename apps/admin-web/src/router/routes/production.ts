import type { RouteRecordRaw } from 'vue-router';
import { PERMISSIONS } from '@company/constants';
import ProductionOrdersPage from '../../views/production/work-orders/ProductionOrdersPage.vue';
import ProductionTasksPage from '../../views/production/tasks/ProductionTasksPage.vue';
import ProductionWorkbenchPage from '../../views/production/tracking/ProductionWorkbenchPage.vue';
import ProductionWorkbenchOperationsPanel from '../../views/production/tracking/ProductionWorkbenchOperationsPanel.vue';
import ProductionCodeBindingPanel from '../../views/production/tracking/ProductionCodeBindingPanel.vue';
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
  {
    path: 'production/workbench',
    name: 'production-workbench',
    component: ProductionWorkbenchPage,
    redirect: { name: 'production-workbench-operations' },
    meta: {
      title: '员工工作台',
      permission: PERMISSIONS.production.workbench.view,
      tab: true,
      tabName: 'production-workbench',
      menuPath: '/production/workbench',
      keepAliveName: 'ProductionWorkbenchPage',
    },
    children: [
      {
        path: 'operations',
        name: 'production-workbench-operations',
        component: ProductionWorkbenchOperationsPanel,
      },
      {
        path: 'code-binding',
        name: 'production-workbench-code-binding',
        component: ProductionCodeBindingPanel,
      },
    ],
  },
  page(
    'production/tracking',
    'production-tracking',
    '工序追踪',
    ProductionTrackingPage,
    PERMISSIONS.production.tracking.view,
    'ProductionTrackingPage',
  ),
];
