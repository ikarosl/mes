export const ATTACHMENT_CLEANUP_STATUS = {
  retained: 'retained',
  processing: 'processing',
  failed: 'failed',
  completed: 'completed',
} as const;
export const ATTACHMENT_LIFECYCLES = [
  'active',
  'trashed',
  'processing',
  'failed',
  'completed',
] as const;
export const ATTACHMENT_LIFECYCLE = {
  active: 'active',
  trashed: 'trashed',
  processing: 'processing',
  failed: 'failed',
  completed: 'completed',
} as const;
export const ATTACHMENT_REFERENCE_STATES = ['referenced', 'unreferenced'] as const;
export const ATTACHMENT_CLEANUP_RETRY_LEASE_MS = 5 * 60 * 1000;
export const ATTACHMENT_FILE_TYPE_LABELS = { sop: '工序 SOP', specification: '规格书' } as const;
export const ATTACHMENT_LIFECYCLE_LABELS = {
  active: '正常',
  trashed: '已移入回收站',
  processing: '清理中',
  failed: '清理失败',
  completed: '已清理',
} as const;
export const ATTACHMENT_REFERENCE_STATE_LABELS = {
  referenced: '有引用',
  unreferenced: '无引用',
} as const;
export const ATTACHMENT_OWNER_TYPE_LABELS = {
  product_process_step: '工序',
  product_route_step: '路线步骤',
  product: '成品',
  material_variant: '精确物料版本',
  production_batch_step: '生产任务步骤',
} as const;
export const ATTACHMENT_REFERENCE_SLOT_LABELS = {
  default_sop: '默认 SOP',
  sop: 'SOP',
  specification: '规格书',
  actual_sop: '实际 SOP',
} as const;
export const ATTACHMENT_CLEANUP_ERROR_LABELS = {
  STORAGE_UNAVAILABLE: '对象存储暂时不可用，请稍后重试',
  VERSIONED_BUCKET_UNSUPPORTED: '存储桶启用了版本控制，当前清理不支持此配置',
} as const;
