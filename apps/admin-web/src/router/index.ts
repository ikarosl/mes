import { createRouter, createWebHistory } from 'vue-router';
import AdminLayout from '../layouts/AdminLayout.vue';
import './meta';
import { installRouterGuards } from './guards';
import { approvalRoutes } from './routes/approval';
import { dashboardRoutes, fallbackRoutes, publicRoutes } from './routes/core';
import { procurementRoutes } from './routes/procurement';
import { productRoutes } from './routes/product';
import { productionRoutes } from './routes/production';
import { qualityRoutes } from './routes/quality';
import { systemRoutes } from './routes/system';
import { templateRoutes } from './routes/template';
import { warehouseRoutes } from './routes/warehouse';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    ...publicRoutes,
    {
      path: '/',
      component: AdminLayout,
      children: [
        ...dashboardRoutes,
        ...systemRoutes,
        ...templateRoutes,
        ...approvalRoutes,
        ...productRoutes,
        ...procurementRoutes,
        ...qualityRoutes,
        ...productionRoutes,
        ...warehouseRoutes,
        ...fallbackRoutes,
      ],
    },
  ],
});

installRouterGuards(router);
