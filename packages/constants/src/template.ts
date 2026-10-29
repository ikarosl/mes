export const BUSINESS_TEMPLATE_STATUS = {
  enabled: 'enabled',
  disabled: 'disabled',
} as const;

export const BUSINESS_TEMPLATE_STATUSES = Object.values(BUSINESS_TEMPLATE_STATUS);

export const BUSINESS_TEMPLATE_STATUS_LABELS = {
  [BUSINESS_TEMPLATE_STATUS.enabled]: '启用',
  [BUSINESS_TEMPLATE_STATUS.disabled]: '停用',
} as const;
