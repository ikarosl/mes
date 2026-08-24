import type {
  PageResult,
  TechnicalFileListItem,
  TechnicalFileQuery,
  TechnicalFileStorageProvider,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export interface StoredTechnicalFile {
  fileName: string;
  originalName: string;
  storageProvider: TechnicalFileStorageProvider;
  bucket: string | null;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  fileType: 'sop';
  versionNo: string;
}

export type TechnicalFileLocator = Pick<
  StoredTechnicalFile,
  'storageProvider' | 'bucket' | 'objectKey'
>;

export interface HistoricalTechnicalFileLocator extends TechnicalFileLocator {
  mimeType: string;
  sizeBytes: number;
}

export abstract class TechnicalFileRepository {
  abstract listTechnicalFiles(
    query: TechnicalFileQuery,
  ): Promise<PageResult<TechnicalFileListItem>>;
  abstract getTechnicalFile(id: string): Promise<TechnicalFileListItem>;
  abstract getHistoricalTechnicalFileLocator(id: string): Promise<HistoricalTechnicalFileLocator>;
  abstract createTechnicalFile(
    file: StoredTechnicalFile,
    audit: CommandContext,
  ): Promise<{ id: string }>;
  /**
   * 软删除：停用（status=0）并标记删除（is_deleted=1），保留数据库记录与对象存储内容，
   * 供历史路线和生产记录追溯。对象永不物理删除。
   */
  abstract deleteTechnicalFile(id: string, audit: CommandContext): Promise<void>;
}
