export const PRODUCT_ITEM_KINDS = ['material', 'semi_finished', 'finished_product'] as const;

export const PRODUCT_ACQUIRE_METHODS = ['self_made', 'outsourced', 'purchased'] as const;

export const PROCESS_ROUTE_STATUSES = ['draft', 'enabled', 'disabled', 'archived'] as const;

export const PRODUCT_BOM_VERSION_STATUSES = ['draft', 'published', 'superseded'] as const;

export const PRODUCT_BOM_VERSION_STATUS_LABELS = {
  draft: '草稿',
  published: '已发布',
  superseded: '历史版本',
} as const;

export const TECHNICAL_FILE_STORAGE_PROVIDERS = ['s3'] as const;

export const TECHNICAL_FILE_TYPES = ['sop'] as const;
