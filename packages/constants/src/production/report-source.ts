/** 仅为只读报工投影分类，不是持久化状态或命令类型。 */
export const BATCH_STEP_REPORT_SOURCE_KINDS = [
  'direct_normal',
  'direct_abnormal',
  'direct_mixed',
  'rework_completion',
  'reversal',
] as const;

export const BATCH_STEP_REPORT_SOURCE_KIND_LABELS = {
  direct_normal: '正常报工',
  direct_abnormal: '异常报工',
  direct_mixed: '混合报工',
  rework_completion: '返工完成',
  reversal: '冲销',
} as const;

/** 完成返工后由同一返工单明确引用的两类结果。 */
export const BATCH_STEP_REWORK_RESULT_LABELS = {
  normal: '返工正常',
  abnormal: '返工异常',
} as const;
