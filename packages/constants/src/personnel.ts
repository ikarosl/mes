export const PERSONNEL_STATUSES = ['active', 'inactive'] as const;
export const PERSONNEL_STATUS_LABELS = { active: '启用', inactive: '停用' } as const;
export const PERSONNEL_STATUS_OPTIONS = PERSONNEL_STATUSES.map((value) => ({
  value,
  label: PERSONNEL_STATUS_LABELS[value],
}));
