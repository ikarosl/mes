/** 已开放的业务人员候选场景；配置只选择角色，不承载业务模块规则。 */
export const USER_CANDIDATE_SCENES = {
  workOrderOwner: 'production.work_order_owner',
  taskOwner: 'production.task_owner',
} as const;

export type UserCandidateSceneCode =
  (typeof USER_CANDIDATE_SCENES)[keyof typeof USER_CANDIDATE_SCENES];

export const USER_CANDIDATE_SCENE_LABELS = {
  [USER_CANDIDATE_SCENES.workOrderOwner]: '工单负责人',
  [USER_CANDIDATE_SCENES.taskOwner]: '任务负责人',
} as const satisfies Record<UserCandidateSceneCode, string>;

export const USER_CANDIDATE_SCENE_CATALOG: readonly {
  readonly code: UserCandidateSceneCode;
  readonly name: string;
}[] = Object.values(USER_CANDIDATE_SCENES).map((code) => ({
  code,
  name: USER_CANDIDATE_SCENE_LABELS[code],
}));
