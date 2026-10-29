import type { RouteRecordRaw } from 'vue-router';
import { PERMISSIONS } from '@company/constants';
import ApprovalInboxPage from '../../views/approval/ApprovalInboxPage.vue';
import ApprovalFlowsPage from '../../views/approval/ApprovalFlowsPage.vue';
import { page } from '../page';

export const approvalRoutes: RouteRecordRaw[] = [
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
];
