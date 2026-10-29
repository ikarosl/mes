import type { RouteRecordRaw } from 'vue-router';
import { PERMISSIONS } from '@company/constants';
import TemplatesPage from '../../views/template/TemplatesPage.vue';
import { page } from '../page';

export const templateRoutes: RouteRecordRaw[] = [
  page(
    'system/templates',
    'system-templates',
    '模板管理',
    TemplatesPage,
    PERMISSIONS.system.templates.view,
    'TemplatesPage',
  ),
];
