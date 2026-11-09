import type { RouteRecordRaw } from 'vue-router';
import { PERMISSIONS } from '@company/constants';
import InboundInspectionsPage from '../../views/quality/InboundInspectionsPage.vue';
import { page } from '../page';

export const qualityRoutes: RouteRecordRaw[] = [
  page(
    'quality/inbound-inspections',
    'quality-inbound-inspections',
    '来料检验',
    InboundInspectionsPage,
    PERMISSIONS.quality.inboundInspections.view,
    'InboundInspectionsPage',
  ),
];
