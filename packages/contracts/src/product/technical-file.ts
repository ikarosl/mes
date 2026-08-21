import type { PageQuery } from '../common.js';

export type TechnicalFileStorageProvider = 's3';

export type TechnicalFileType = 'sop';

export interface TechnicalFileQuery extends PageQuery {
  keyword?: string;
  status?: number;
  storageProvider?: TechnicalFileStorageProvider;
}

export interface TechnicalFileListItem {
  id: string;
  fileName: string;
  originalName: string;
  storageProvider: TechnicalFileStorageProvider;
  bucket: string | null;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  fileType: TechnicalFileType;
  versionNo: string;
  status: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SetDefaultSopPayload {
  fileId: string | null;
}
