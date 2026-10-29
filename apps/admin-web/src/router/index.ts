import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import type { Component } from 'vue';
import { PERMISSIONS } from '@company/constants';
import { useAuthStore } from '../stores/auth';
import { useTabsStore } from '../stores/tabs';
import AdminLayout from '../views/AdminLayout.vue';
import LoginPage from '../views/LoginPage.vue';
import DashboardPage from '../views/DashboardPage.vue';
import UsersPage from '../views/system/UsersPage.vue';
import RolesPage from '../views/system/RolesPage.vue';
import SystemUserCandidates from '../views/system/SystemUserCandidates.vue';
import PermissionsPage from '../views/system/PermissionsPage.vue';
import LogsPage from '../views/system/LogsPage.vue';
import TemplatesPage from '../views/system/TemplatesPage.vue';
import NoPermissionPage from '../views/NoPermissionPage.vue';

// 审批中心
import ApprovalInboxPage from '../views/approval/ApprovalInboxPage.vue';
import ApprovalFlowsPage from '../views/approval/ApprovalFlowsPage.vue';

// 产品资料
import ProductsPage from '../views/product/ProductsPage.vue';
import ProductCategoriesPage from '../views/product/ProductCategoriesPage.vue';
import ProcessesPage from '../views/product/ProcessesPage.vue';
import ProcessRoutesPage from '../views/product/ProcessRoutesPage.vue';

// 采购管理
import SuppliersPage from '../views/procurement/SuppliersPage.vue';
import PurchaseOrdersPage from '../views/procurement/PurchaseOrdersPage.vue';
import PurchaseReceiptsPage from '../views/procurement/PurchaseReceiptsPage.vue';
import InboundInspectionsPage from '../views/quality/InboundInspectionsPage.vue';
import FinishedInspectionsPage from '../views/quality/FinishedInspectionsPage.vue';
import ProcessInspectionsPage from '../views/quality/ProcessInspectionsPage.vue';

// 生产管理
import ProductionOrdersPage from '../views/production/ProductionOrdersPage.vue';
import ProductionTasksPage from '../views/production/ProductionTasksPage.vue';
import ProductionWorkerTasksPage from '../views/production/WorkerTasksPage.vue';
import ProductionExecutionRecordsPage from '../views/production/ProductionExecutionRecordsPage.vue';
import ProductionTracePage from '../views/production/ProductionTracePage.vue';

// 仓储管理
import InboundOrdersPage from '../views/warehouse/InboundOrdersPage.vue';
import OutboundOrdersPage from '../views/warehouse/OutboundOrdersPage.vue';
import ReturnOrdersPage from '../views/warehouse/ReturnOrdersPage.vue';
import ScrapsPage from '../views/warehouse/ScrapsPage.vue';
import StockChecksPage from '../views/warehouse/StockChecksPage.vue';
import WarehouseInventoryPage from '../views/warehouse/WarehouseInventoryPage.vue';
import OtherInboundsPage from '../views/warehouse/OtherInboundsPage.vue';
import OtherOutboundsPage from '../views/warehouse/OtherOutboundsPage.vue';
import PurchaseInboundPanel from '../views/warehouse/components/PurchaseInboundPanel.vue';
import FinishedGoodsInboundPanel from '../views/warehouse/components/FinishedGoodsInboundPanel.vue';
import ProductionOutboundPanel from '../views/warehouse/components/ProductionOutboundPanel.vue';

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    title?: string;
    permission?: string | readonly string[];
    tab?: boolean;
    tabName?: string;
    menuPath?: string;
    keepAliveName?: string;
  }
}

const page = (
  path: string,
  name: string,
  title: string,
  component: Component,
  permission: string | readonly string[] | undefined,
  keepAliveName: string,
): RouteRecordRaw => ({
  path,
  name,
  component,
  meta: { title, permission, tab: true, keepAliveName },
});

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginPage, meta: { public: true, title: '登录' } },
    {
      path: '/',
      component: AdminLayout,
      children: [
        // 首页
        {
          path: '',
          name: 'dashboard',
          component: DashboardPage,
          meta: {
            title: '首页',
            permission: PERMISSIONS.dashboard.view,
            tab: true,
            keepAliveName: 'DashboardPage',
          },
        },
        // 系统管理
        page(
          'system/users',
          'system-users',
          '用户管理',
          UsersPage,
          PERMISSIONS.system.users.view,
          'UsersPage',
        ),
        page(
          'system/roles',
          'system-roles',
          '角色管理',
          RolesPage,
          PERMISSIONS.system.roles.view,
          'RolesPage',
        ),
        page(
          'system/user-candidates',
          'system-user-candidates',
          '业务人员配置',
          SystemUserCandidates,
          PERMISSIONS.system.userCandidates.view,
          'SystemUserCandidates',
        ),
        page(
          'system/permissions',
          'system-permissions',
          '权限管理',
          PermissionsPage,
          PERMISSIONS.system.permissions.view,
          'PermissionsPage',
        ),
        page(
          'system/logs',
          'system-logs',
          '操作日志',
          LogsPage,
          PERMISSIONS.system.logs.view,
          'LogsPage',
        ),

        page(
          'system/templates',
          'system-templates',
          '模板管理',
          TemplatesPage,
          PERMISSIONS.system.templates.view,
          'TemplatesPage',
        ),

        // 审批中心
        page(
          'approval/inbox',
          'approval-inbox',
          '审批待办',
          ApprovalInboxPage,
          [
            PERMISSIONS.approval.view,
            PERMISSIONS.approval.decide,
            PERMISSIONS.approval.configure,
            PERMISSIONS.product.products.manageBom,
            PERMISSIONS.production.materials.correctDemand,
            PERMISSIONS.production.tasks.terminate,
            PERMISSIONS.production.tasks.manageOutput,
          ],
          'ApprovalInboxPage',
        ),
        page(
          'approval/flows',
          'approval-flows',
          '审批流程配置',
          ApprovalFlowsPage,
          PERMISSIONS.approval.configure,
          'ApprovalFlowsPage',
        ),

        // 产品资料
        page(
          'product/products',
          'product-products',
          '产品与物料',
          ProductsPage,
          PERMISSIONS.product.products.view,
          'ProductsPage',
        ),
        page(
          'product/categories',
          'product-categories',
          '分类配置',
          ProductCategoriesPage,
          PERMISSIONS.product.categories.view,
          'ProductCategoriesPage',
        ),
        page(
          'product/processes',
          'product-processes',
          '工序管理',
          ProcessesPage,
          PERMISSIONS.product.processes.view,
          'ProcessesPage',
        ),
        page(
          'product/process-routes',
          'product-process-routes',
          '工艺路线',
          ProcessRoutesPage,
          PERMISSIONS.product.routes.view,
          'ProcessRoutesPage',
        ),
        {
          path: 'product/material-variants',
          redirect: { name: 'product-products', query: { tab: 'materials' } },
        },

        // 采购管理
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
        page(
          'quality/inbound-inspections',
          'quality-inbound-inspections',
          '来料检验',
          InboundInspectionsPage,
          PERMISSIONS.quality.inboundInspections.view,
          'InboundInspectionsPage',
        ),

        page(
          'quality/finished-inspections',
          'quality-finished-inspections',
          '成品质检',
          FinishedInspectionsPage,
          PERMISSIONS.quality.finishedInspections.view,
          'FinishedInspectionsPage',
        ),

        page(
          'quality/process-inspections',
          'quality-process-inspections',
          '工序专检',
          ProcessInspectionsPage,
          PERMISSIONS.quality.processInspections.view,
          'ProcessInspectionsPage',
        ),

        // 生产管理
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

        // 仓储管理
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

        {
          path: 'no-permission',
          name: 'no-permission',
          component: NoPermissionPage,
          meta: { title: '无权限' },
        },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (to.meta.public) {
    if (auth.authenticated) return { name: 'dashboard' };
    return true;
  }
  if (!auth.authenticated) {
    try {
      await auth.restore();
    } catch {
      return { name: 'login', query: { redirect: to.fullPath } };
    }
  }
  // 旧入库链接仍按真实来源定位；分类各自保留查看权限。
  if (
    to.name === 'warehouse-inbound' &&
    typeof to.query.inboundId === 'string' &&
    to.query.inboundId &&
    to.query.sourceType !== 'purchased'
  )
    return { name: 'warehouse-inbound-finished', query: to.query, hash: to.hash, replace: true };

  // 通用菜单地址允许最小查看角色进入自己可见的分类，不扩大原分类准入。
  if (!auth.can(to.meta.permission)) {
    if (
      to.name === 'warehouse-inbound' &&
      !to.query.inboundId &&
      !to.query.receiptLineId &&
      auth.can(PERMISSIONS.warehouse.otherInbounds.view)
    )
      return { name: 'warehouse-other-inbounds', query: to.query, hash: to.hash, replace: true };
    if (
      to.name === 'warehouse-outbound' &&
      !to.query.outboundId &&
      auth.can(PERMISSIONS.warehouse.otherOutbounds.view)
    )
      return { name: 'warehouse-other-outbounds', query: to.query, hash: to.hash, replace: true };
    return { name: 'no-permission' };
  }
  return true;
});

router.afterEach((to, _from, failure) => {
  if (!failure) useTabsStore().visit(to, router);
});
