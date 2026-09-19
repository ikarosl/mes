import { APPROVAL_ASSIGNEE_SOURCES, APPROVAL_SCENE_CODES } from '@company/constants';
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
export const BATCH_CLOSEOUT_APPROVAL_SCENE = {
  code: APPROVAL_SCENE_CODES.batchCloseout,
  module: 'production',
  name: '生产任务结案',
  description: '工单负责人审核收尾、检验依据及产出清单；批准结案或产出清单更正',
  subjectType: 'production_batch_closeout',
  businessAssigneeSources: [
    {
      code: APPROVAL_ASSIGNEE_SOURCES.workOrderOwner,
      name: '工单负责人',
      description: '送审时按任务所属工单确定负责人，并固定本次审批人员',
    },
  ],
  requiredFinalAssigneeSourceCode: APPROVAL_ASSIGNEE_SOURCES.workOrderOwner,
} as const satisfies ApprovalSceneDefinition;
