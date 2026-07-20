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
