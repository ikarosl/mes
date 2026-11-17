import type { PageQuery } from './common.js';

export type AttachmentStorageProvider = 's3';
export type AttachmentFileType = 'sop' | 'specification';

export type AttachmentCleanupStatus = 'retained' | 'processing' | 'failed' | 'completed';
export type AttachmentLifecycle = 'active' | 'trashed' | 'processing' | 'failed' | 'completed';
export type AttachmentReferenceState = 'referenced' | 'unreferenced';
export type AttachmentOwnerType =
  | 'product_process_step'
  | 'product_route_step'
  | 'product'
  | 'material_variant'
  | 'production_batch_step';
export type AttachmentReferenceSlot = 'default_sop' | 'sop' | 'specification' | 'actual_sop';
export type AttachmentCleanupErrorCode = 'STORAGE_UNAVAILABLE' | 'VERSIONED_BUCKET_UNSUPPORTED';

/** 附件模块元数据，与现有技术文件目录契约保持结构兼容。 */
export interface AttachmentFile {
  id: string;
  fileName: string;
  originalName: string;
  storageProvider: AttachmentStorageProvider;
  bucket: string | null;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  fileType: AttachmentFileType;
  /** 业务用途决定版本含义；当前 SOP 有版本、规格书为 null。 */
  versionNo: string | null;
  status: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AttachmentQuery extends PageQuery {
  keyword?: string;
  fileType?: AttachmentFileType;
  referenceState?: AttachmentReferenceState;
  /** 省略时返回全部生命周期。 */
  lifecycle?: AttachmentLifecycle;
}

export interface AttachmentListItem extends AttachmentFile {
  version: number;
  lifecycle: AttachmentLifecycle;
  cleanupStatus: AttachmentCleanupStatus;
  cleanupStartedAt: string | null;
  cleanupCompletedAt: string | null;
  cleanupErrorCode: AttachmentCleanupErrorCode | null;
  referenceCount: number;
  createdBy: string | null;
  createdByName: string | null;
  deletedAt: string | null;
  canTrash: boolean;
  canPurge: boolean;
  canDownload: boolean;
}

export interface AttachmentReferenceItem {
  attachmentId: string;
  ownerType: AttachmentOwnerType;
  ownerId: string;
  slot: AttachmentReferenceSlot;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface AttachmentLifecyclePayload {
  version: number;
}

/** 清理失败亦返回持久化后的状态，调用方须根据 cleanupStatus 展示逐项结果。 */
export interface AttachmentLifecycleResult {
  id: string;
  version: number;
  lifecycle: AttachmentLifecycle;
  cleanupStatus: AttachmentCleanupStatus;
  cleanupErrorCode: AttachmentCleanupErrorCode | null;
}

export const ATTACHMENT_API = {
  list: '/attachments',
  references: (id: string) => `/attachments/${id}/references`,
  content: (id: string) => `/attachments/${id}/content`,
  trash: (id: string) => `/attachments/${id}/trash`,
  purge: (id: string) => `/attachments/${id}/purge`,
} as const;
