import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { ProductDomainError } from '../domain/product.errors.js';

type Db = Pool | PoolConnection;

/** 防止技术文件删除与新持久化的产品引用发生并发竞态。 */
export const lockTechnicalFileSnapshot = async (
  db: Db,
  fileId: string,
): Promise<{ file_name: string; object_key: string; version_no: string }> => {
  const [[file]] = await db.query<
    (RowDataPacket & { file_name: string; object_key: string; version_no: string })[]
  >(
    `SELECT file_name,object_key,version_no FROM technical_files
      WHERE id=? AND file_type='sop' AND is_deleted=0 AND status=1 FOR UPDATE`,
    [fileId],
  );
  if (!file) {
    throw new ProductDomainError(
      'NOT_FOUND',
      'Referenced SOP does not exist, is disabled, or is pending deletion',
    );
  }
  return file;
};
