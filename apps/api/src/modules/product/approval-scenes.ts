import { APPROVAL_SCENE_CODES } from '@company/constants';
import type { ApprovalSceneDefinition } from '../approval/public.js';

export const PRODUCT_BOM_APPROVAL_SCENE = {
  code: APPROVAL_SCENE_CODES.bom,
  module: 'product',
  name: 'BOM 审批',
  description: '核对成品技术定义和 BOM；全部节点通过后永久锁定',
  subjectType: 'product',
} as const satisfies ApprovalSceneDefinition;
