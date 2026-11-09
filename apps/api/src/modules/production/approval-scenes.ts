import { APPROVAL_SCENE_CODES } from '@company/constants';
import type { ApprovalSceneDefinition } from '../approval/public.js';

export const DEMAND_CORRECTION_APPROVAL_SCENE = {
  code: APPROVAL_SCENE_CODES.demandCorrection,
  module: 'production',
  name: '需求更正与关闭',
  description: '审核原需求、累计领料、替代数量及补料影响；末级通过后关闭旧剩余并生成替代需求',
  subjectType: 'production_demand_correction',
  businessAssigneeSources: [],
  requiredFinalAssigneeSourceCode: null,
} as const satisfies ApprovalSceneDefinition;
