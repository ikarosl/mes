import type { RouteRecordRaw } from 'vue-router';
import { PERMISSIONS } from '@company/constants';
import InboundInspectionsPage from '../../views/quality/InboundInspectionsPage.vue';
import FinishedInspectionsPage from '../../views/quality/FinishedInspectionsPage.vue';
import ProcessInspectionsPage from '../../views/quality/ProcessInspectionsPage.vue';
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
];
