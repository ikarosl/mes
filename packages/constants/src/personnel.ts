export const PERSONNEL_GROUPS = ['production', 'quality'] as const;
export const PERSONNEL_GROUP_LABELS = { production: '产线人员', quality: '质检人员' } as const;
export const PERSONNEL_GROUP_OPTIONS = PERSONNEL_GROUPS.map((value) => ({
  value,
  label: PERSONNEL_GROUP_LABELS[value],
}));
export const PERSONNEL_STATUSES = ['active', 'inactive'] as const;
export const PERSONNEL_STATUS_LABELS = { active: '启用', inactive: '停用' } as const;
export const PERSONNEL_STATUS_OPTIONS = PERSONNEL_STATUSES.map((value) => ({
  value,
  label: PERSONNEL_STATUS_LABELS[value],
}));
