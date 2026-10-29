import type { RouteRecordRaw } from 'vue-router';
import { PERMISSIONS } from '@company/constants';
import ProductsPage from '../../views/product/ProductsPage.vue';
import ProductCategoriesPage from '../../views/product/ProductCategoriesPage.vue';
import ProcessesPage from '../../views/product/ProcessesPage.vue';
import ProcessRoutesPage from '../../views/product/ProcessRoutesPage.vue';
import { page } from '../page';

export const productRoutes: RouteRecordRaw[] = [
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
];
