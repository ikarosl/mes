import type {
  PageResult,
  TechnicalFileListItem,
  TechnicalFileQuery,
  TechnicalFileStorageProvider,
} from '@company/contracts';
import type { AuditContext } from '../../../../common/audit/audit.types.js';

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

export abstract class TechnicalFileRepository {
  abstract listTechnicalFiles(
    query: TechnicalFileQuery,
  ): Promise<PageResult<TechnicalFileListItem>>;
  abstract getTechnicalFile(id: string): Promise<TechnicalFileListItem>;
  abstract createTechnicalFile(
    file: StoredTechnicalFile,
    audit: AuditContext,
  ): Promise<{ id: string }>;
  abstract prepareTechnicalFileDelete(
    id: string,
    audit: AuditContext,
  ): Promise<TechnicalFileLocator>;
  abstract finalizeTechnicalFileDelete(id: string, audit: AuditContext): Promise<void>;
}
