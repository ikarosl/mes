import type { PageQuery } from '../common.js';
import type {
  AttachmentFile,
  AttachmentFileType,
  AttachmentStorageProvider,
} from '../attachment.js';

export type TechnicalFileStorageProvider = AttachmentStorageProvider;

export type TechnicalFileType = AttachmentFileType;

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

/** Product 的技术文件展示复用唯一附件元数据契约。 */
export type TechnicalFileListItem = AttachmentFile;
