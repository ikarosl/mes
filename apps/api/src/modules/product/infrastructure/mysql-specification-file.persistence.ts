import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { TechnicalFileListItem } from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { ProductDomainError } from '../domain/product.errors.js';

type Db = Pool | PoolConnection;

type SpecificationFileRow = RowDataPacket & {
  id: number;
  file_name: string;
  original_name: string;
  storage_provider: TechnicalFileListItem['storageProvider'];
  bucket: string | null;
  object_key: string;
  mime_type: string;
  size_bytes: number | string;
  checksum_sha256: string;
  file_type: TechnicalFileListItem['fileType'];
  version_no: null;
  status: number;
  created_at: Date | null;
  updated_at: Date | null;
};

/** 持有文件共享锁直到主数据绑定与审计提交，和文件软删除串行化。 */
export async function requireSpecificationFile(db: PoolConnection, id: string): Promise<void> {
  if (!id || !/^\d+$/.test(id)) {
    throw new ProductDomainError('INVALID_INPUT', '请选择规格书文件');
  }
  const [[file]] = await db.query<(RowDataPacket & { id: number })[]>(
    `SELECT id FROM technical_files
      WHERE id=? AND file_type='specification' AND status=1 AND is_deleted=0 FOR SHARE`,
    [id],
  );
  if (!file) {
    throw new ProductDomainError('INVALID_INPUT', '规格书文件不存在、已停用或用途不符');
  }
}

/** 仅补齐当前结果集关联的元数据，不逐行读取、不改变父列表分页。 */
export async function readSpecificationFiles(
  db: Db,
  fileIds: Array<number | string | null>,
): Promise<Map<string, TechnicalFileListItem>> {
  const ids = [...new Set(fileIds.filter((id): id is number | string => id !== null).map(String))];
  if (!ids.length) return new Map();
  const [rows] = await db.query<SpecificationFileRow[]>(
    `SELECT id,file_name,original_name,storage_provider,bucket,object_key,mime_type,size_bytes,
            checksum_sha256,file_type,version_no,status,created_at,updated_at
       FROM technical_files WHERE id IN (${ids.map(() => '?').join(',')}) AND file_type='specification'`,
    ids,
  );
  return new Map(
    rows.map((row) => [
      String(row.id),
      {
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
        createdAt: row.created_at ? toBeijingISOString(row.created_at) : null,
        updatedAt: row.updated_at ? toBeijingISOString(row.updated_at) : null,
      },
    ]),
  );
}
