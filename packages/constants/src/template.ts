export const BUSINESS_TEMPLATE_STATUS = {
  enabled: 'enabled',
  disabled: 'disabled',
} as const;

export const BUSINESS_TEMPLATE_STATUSES = Object.values(BUSINESS_TEMPLATE_STATUS);

export const BUSINESS_TEMPLATE_STATUS_LABELS = {
  [BUSINESS_TEMPLATE_STATUS.enabled]: '启用',
  [BUSINESS_TEMPLATE_STATUS.disabled]: '停用',
} as const;

export const BUSINESS_TEMPLATE_COLUMN_MODE = {
  fixed: 'fixed',
  required: 'required',
  optional: 'optional',
} as const;

export const BUSINESS_TEMPLATE_COLUMN_MODES = Object.values(BUSINESS_TEMPLATE_COLUMN_MODE);

export const BUSINESS_TEMPLATE_COLUMN_MODE_LABELS = {
  [BUSINESS_TEMPLATE_COLUMN_MODE.fixed]: '固定内容',
  [BUSINESS_TEMPLATE_COLUMN_MODE.required]: '必填',
  [BUSINESS_TEMPLATE_COLUMN_MODE.optional]: '可空',
} as const;

export const BUSINESS_TEMPLATE_SCENE = {
  qualityIncomingInspection: 'quality_incoming_inspection',
} as const;

export const BUSINESS_TEMPLATE_SCENES = Object.values(BUSINESS_TEMPLATE_SCENE);

export const BUSINESS_TEMPLATE_SCENE_LABELS = {
  [BUSINESS_TEMPLATE_SCENE.qualityIncomingInspection]: '来料检验',
} as const;
