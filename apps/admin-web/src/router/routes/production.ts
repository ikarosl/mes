import type { RouteRecordRaw } from 'vue-router';
import { PERMISSIONS } from '@company/constants';
import ProductionOrdersPage from '../../views/production/work-orders/ProductionOrdersPage.vue';
import ProductionTasksPage from '../../views/production/tasks/ProductionTasksPage.vue';
import ProductionWorkerTasksPage from '../../views/production/execution/WorkerTasksPage.vue';
import ProductionExecutionRecordsPage from '../../views/production/execution/ProductionExecutionRecordsPage.vue';
import ProductionTracePage from '../../views/production/traceability/ProductionTracePage.vue';
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
    'production/worker-tasks',
    'production-worker-tasks',
    '我的工序',
    ProductionWorkerTasksPage,
    PERMISSIONS.production.workerTasks.view,
    'ProductionWorkerTasksPage',
  ),
  page(
    'production/execution-records',
    'production-execution-records',
    '生产报工记录',
    ProductionExecutionRecordsPage,
    PERMISSIONS.production.executionRecords.view,
    'ProductionExecutionRecordsPage',
  ),
  page(
    'production/trace',
    'production-trace',
    '生产追溯',
    ProductionTracePage,
    PERMISSIONS.production.trace.view,
    'ProductionTracePage',
  ),
];
