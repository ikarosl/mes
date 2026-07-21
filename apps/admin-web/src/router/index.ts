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
import PermissionsPage from '../views/system/PermissionsPage.vue';
import LogsPage from '../views/system/LogsPage.vue';
import NoPermissionPage from '../views/NoPermissionPage.vue';

// 产品资料
import ProductsPage from '../views/product/ProductsPage.vue';
import ProductCategoriesPage from '../views/product/ProductCategoriesPage.vue';
import ProcessesPage from '../views/product/ProcessesPage.vue';
import ProcessRoutesPage from '../views/product/ProcessRoutesPage.vue';

// 生产管理
import ProductionOrdersPage from '../views/production/ProductionOrdersPage.vue';
import ProductionTasksPage from '../views/production/ProductionTasksPage.vue';

// 仓储管理
import InboundOrdersPage from '../views/warehouse/InboundOrdersPage.vue';
import OutboundOrdersPage from '../views/warehouse/OutboundOrdersPage.vue';
import ReturnOrdersPage from '../views/warehouse/ReturnOrdersPage.vue';
import ScrapsPage from '../views/warehouse/ScrapsPage.vue';
import StockChecksPage from '../views/warehouse/StockChecksPage.vue';
import WarehouseInventoryPage from '../views/warehouse/WarehouseInventoryPage.vue';

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    title?: string;
    permission?: string;
    tab?: boolean;
    keepAliveName?: string;
  }
}

const page = (
  path: string,
  name: string,
  title: string,
  component: Component,
  permission: string,
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

        // 产品资料
        page(
          'product/products',
          'product-products',
          '产品管理',
          ProductsPage,
          PERMISSIONS.product.products.view,
          'ProductsPage',
        ),
        page(
          'product/categories',
          'product-categories',
          '产品分类',
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

        // 仓储管理
        page(
          'warehouse/inventory',
          'warehouse-inventory',
          '库存查询',
          WarehouseInventoryPage,
          PERMISSIONS.warehouse.inventory.view,
          'WarehouseInventoryPage',
        ),
        page(
          'warehouse/inbound-orders',
          'warehouse-inbound',
          '入库管理',
          InboundOrdersPage,
          PERMISSIONS.warehouse.inbound.view,
          'InboundOrdersPage',
        ),
        page(
          'warehouse/outbound-orders',
          'warehouse-outbound',
          '出库管理',
          OutboundOrdersPage,
          PERMISSIONS.warehouse.outbound.view,
          'OutboundOrdersPage',
        ),
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
          '报废管理',
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
  if (!auth.can(to.meta.permission)) return { name: 'no-permission' };
  return true;
});

router.afterEach((to) => useTabsStore().visit(to));
