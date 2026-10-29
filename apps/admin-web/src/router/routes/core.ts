import type { RouteRecordRaw } from 'vue-router';
import LoginPage from '../../views/LoginPage.vue';
import { PERMISSIONS } from '@company/constants';
import DashboardPage from '../../views/DashboardPage.vue';
import NoPermissionPage from '../../views/NoPermissionPage.vue';
import NotFoundPage from '../../views/NotFoundPage.vue';

export const publicRoutes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: LoginPage, meta: { public: true, title: '登录' } },
];

export const dashboardRoutes: RouteRecordRaw[] = [
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
];

export const fallbackRoutes: RouteRecordRaw[] = [
  {
    path: 'no-permission',
    name: 'no-permission',
    component: NoPermissionPage,
    meta: { title: '无权限' },
  },
  {
    path: ':pathMatch(.*)*',
    name: 'not-found',
    component: NotFoundPage,
    meta: { title: '页面不存在' },
  },
];
