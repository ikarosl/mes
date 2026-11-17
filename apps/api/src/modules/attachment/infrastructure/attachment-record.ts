import type { RowDataPacket } from 'mysql2/promise';
import { ATTACHMENT_CLEANUP_RETRY_LEASE_MS } from '@company/constants';
import type {
  AttachmentCleanupErrorCode,
  AttachmentCleanupStatus,
  AttachmentLifecycle,
  AttachmentListItem,
  TechnicalFileListItem,
  TechnicalFileStorageProvider,
  TechnicalFileType,
} from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';

export type AttachmentRow = RowDataPacket & {
  id: string | number;
  file_name: string;
  original_name: string;
  storage_provider: TechnicalFileStorageProvider;
  bucket: string | null;
  object_key: string;
  mime_type: string;
  size_bytes: number | string;
  checksum_sha256: string;
  file_type: TechnicalFileType;
  version_no: string | null;
  status: number;
  created_by: string | number | null;
  created_at: Date;
  updated_at: Date;
  is_deleted: number;
  deleted_at: Date | null;
  version: number;
  cleanup_status: AttachmentCleanupStatus;
  cleanup_started_at: Date | null;
  cleanup_completed_at: Date | null;
  cleanup_error_code: AttachmentCleanupErrorCode | null;
  reference_count?: number | string;
};

export const ATTACHMENT_COLUMNS = `id,file_name,original_name,storage_provider,bucket,object_key,mime_type,size_bytes,
  checksum_sha256,file_type,version_no,status,created_by,created_at,updated_at,is_deleted,deleted_at,version,
  cleanup_status,cleanup_started_at,cleanup_completed_at,cleanup_error_code`;

export const attachmentLifecycle = (row: AttachmentRow): AttachmentLifecycle => {
  if (row.cleanup_status !== 'retained') return row.cleanup_status;
  return row.is_deleted ? 'trashed' : 'active';
};

export const cleanupLeaseExpired = (row: AttachmentRow): boolean =>
  row.cleanup_started_at !== null &&
  Date.now() - row.cleanup_started_at.getTime() >= ATTACHMENT_CLEANUP_RETRY_LEASE_MS;

export const mapAttachmentFile = (row: AttachmentRow): TechnicalFileListItem => ({
  id: String(row.id),
  fileName: row.file_name,
  originalName: row.original_name,
  storageProvider: row.storage_provider,
  bucket: row.bucket,
  objectKey: row.object_key,
  mimeType: row.mime_type,
  sizeBytes: Number(row.size_bytes),
  checksumSha256: row.checksum_sha256,
  fileType: row.file_type,
  versionNo: row.version_no,
  status: row.status,
  createdAt: toBeijingISOString(row.created_at),
  updatedAt: toBeijingISOString(row.updated_at),
});

export const mapManagedAttachment = (row: AttachmentRow): AttachmentListItem => {
  const referenceCount = Number(row.reference_count ?? 0);
  return {
    ...mapAttachmentFile(row),
    version: row.version,
    lifecycle: attachmentLifecycle(row),
    cleanupStatus: row.cleanup_status,
    cleanupStartedAt: row.cleanup_started_at ? toBeijingISOString(row.cleanup_started_at) : null,
    cleanupCompletedAt: row.cleanup_completed_at
      ? toBeijingISOString(row.cleanup_completed_at)
      : null,
    cleanupErrorCode: row.cleanup_error_code,
    referenceCount,
    createdBy: row.created_by === null ? null : String(row.created_by),
    createdByName: null,
    deletedAt: row.deleted_at ? toBeijingISOString(row.deleted_at) : null,
    canTrash: row.is_deleted === 0 && row.cleanup_status === 'retained' && referenceCount === 0,
    canPurge:
      row.is_deleted === 1 &&
      referenceCount === 0 &&
      (row.cleanup_status === 'retained' ||
        row.cleanup_status === 'failed' ||
        (row.cleanup_status === 'processing' && cleanupLeaseExpired(row))),
    canDownload: row.cleanup_status === 'retained',
  };
};
