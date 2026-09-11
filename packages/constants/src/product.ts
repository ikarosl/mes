// A semi-finished item is a material category, not a separate business identity.
// Keep the kind set aligned with product_categories.chk_product_categories_kind.
export const PRODUCT_ITEM_KINDS = ['material', 'finished_product'] as const;

export const PRODUCT_ACQUIRE_METHODS = ['self_made', 'outsourced', 'purchased'] as const;

export const PROCESS_ROUTE_STATUSES = ['draft', 'enabled', 'disabled', 'archived'] as const;

export const TECHNICAL_FILE_STORAGE_PROVIDERS = ['s3'] as const;

export const TECHNICAL_FILE_TYPES = ['sop'] as const;

export const PRODUCT_BOM_STATUSES = ['draft', 'pending_approval', 'approved'] as const;
export const PRODUCT_BOM_STATUS_LABELS = {
  draft: '未送审',
  pending_approval: '审批中',
  approved: '已批准',
} as const;
