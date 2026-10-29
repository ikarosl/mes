import type { PageQuery } from '../common.js';

export type TechnicalFileStorageProvider = 's3';

export type TechnicalFileType = 'sop' | 'specification';

export interface TechnicalFileQuery extends PageQuery {
  keyword?: string;
  status?: number;
  storageProvider?: TechnicalFileStorageProvider;
  /** 省略时保留既有 SOP 目录语义。 */
  fileType?: TechnicalFileType;
}

/** multipart 文件用途；省略时上传 SOP。 */
export interface TechnicalFileUploadPayload {
  fileType?: TechnicalFileType;
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
  /** SOP 保留版本快照，规格书没有版本号。 */
  versionNo: string | null;
  status: number;
  createdAt: string | null;
  updatedAt: string | null;
}
