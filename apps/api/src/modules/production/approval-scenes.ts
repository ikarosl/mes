import { APPROVAL_SCENE_CODES } from '@company/constants';
import type { ApprovalSceneDefinition } from '../approval/public.js';

export const DEMAND_CORRECTION_APPROVAL_SCENE = {
  code: APPROVAL_SCENE_CODES.demandCorrection,
  module: 'production',
  name: '需求更正与关闭',
  description: '审核原需求、累计领料、替代数量及补料影响；末级通过后关闭旧剩余并生成替代需求',
  subjectType: 'production_demand_correction',
} as const satisfies ApprovalSceneDefinition;
export const BATCH_CLOSEOUT_APPROVAL_SCENE = {
  code: APPROVAL_SCENE_CODES.batchCloseout,
  module: 'production',
  name: '短产 / 提前结束批次',
  description: '审核逐项收尾结果、物料安排及实际产出；末级通过后结束批次',
  subjectType: 'production_batch_closeout',
} as const satisfies ApprovalSceneDefinition;
