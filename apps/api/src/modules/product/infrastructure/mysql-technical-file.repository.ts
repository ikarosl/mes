import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '@company/database';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductDomainError } from '../domain/product.errors.js';

type Db = Pool | PoolConnection;
import type {
  PageResult,
  TechnicalFileListItem,
  TechnicalFileQuery,
  TechnicalFileStorageProvider,
} from '@company/contracts';
import {
  type TechnicalFileRepository,
  type StoredTechnicalFile,
} from '../application/ports/technical-file.repository.js';

type TechnicalFileRow = RowDataPacket & {
  id: number;
  file_name: string;
  original_name: string;
  storage_provider: TechnicalFileStorageProvider;
  bucket: string | null;
  object_key: string;
  mime_type: string;
  size_bytes: number | string;
  checksum_sha256: string;
  file_type: 'sop';
  version_no: string;
  status: number;
  created_at: Date | null;
  updated_at: Date | null;
};

@Injectable()
export class MysqlTechnicalFileRepository implements TechnicalFileRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listTechnicalFiles(query: TechnicalFileQuery): Promise<PageResult<TechnicalFileListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const conditions = ['is_deleted=0', "file_type='sop'"];
    const parameters: unknown[] = [];
    if (query.keyword) {
      conditions.push('(file_name LIKE ? OR original_name LIKE ? OR version_no LIKE ?)');
      const keyword = `%${query.keyword}%`;
      parameters.push(keyword, keyword, keyword);
    }
    if (query.status !== undefined) {
      conditions.push('status=?');
      parameters.push(query.status);
    }
    if (query.storageProvider) {
      conditions.push('storage_provider=?');
      parameters.push(query.storageProvider);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM technical_files ${where}`,
      parameters,
    );
    const [rows] = await this.pool.query<TechnicalFileRow[]>(
      `SELECT id,file_name,original_name,storage_provider,bucket,object_key,mime_type,size_bytes,
              checksum_sha256,file_type,version_no,status,created_at,updated_at
         FROM technical_files ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...parameters, pageSize, (page - 1) * pageSize],
    );
    return {
      items: rows.map((row) => this.mapTechnicalFile(row)),
      total: count?.total ?? 0,
      page,
      pageSize,
    };
  }

  async getTechnicalFile(id: string): Promise<TechnicalFileListItem> {
    // 通用文件读取只面向当前有效技术文件，因此保留 status/is_deleted 过滤。
    // 历史生产任务不能调用本入口；后续应按 batch_step_records 冻结的对象定位快照读取。
    const [[row]] = await this.pool.query<TechnicalFileRow[]>(
      `SELECT id,file_name,original_name,storage_provider,bucket,object_key,mime_type,size_bytes,
              checksum_sha256,file_type,version_no,status,created_at,updated_at
         FROM technical_files WHERE id=? AND file_type='sop' AND status=1 AND is_deleted=0`,
      [id],
    );
    if (!row) throw new ProductDomainError('NOT_FOUND', '技术文件不存在或已停用');
    return this.mapTechnicalFile(row);
  }

  async getHistoricalTechnicalFileLocator(id: string) {
    const [[row]] = await this.pool.query<
      (RowDataPacket & {
        storage_provider: TechnicalFileStorageProvider;
        bucket: string | null;
        object_key: string;
        mime_type: string;
        size_bytes: number;
      })[]
    >(
      `SELECT storage_provider,bucket,object_key,mime_type,size_bytes
         FROM technical_files WHERE id=? AND file_type='sop'`,
      [id],
    );
    if (!row) throw new ProductDomainError('NOT_FOUND', '历史技术文件记录不存在');
    return {
      storageProvider: row.storage_provider,
      bucket: row.bucket,
      objectKey: row.object_key,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
    };
  }

  async createTechnicalFile(file: StoredTechnicalFile, audit: CommandContext) {
    return withTransaction(this.pool, async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO technical_files (file_name,original_name,storage_provider,bucket,object_key,mime_type,size_bytes,checksum_sha256,file_type,version_no,status,created_by,updated_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)`,
        [
          file.fileName,
          file.originalName,
          file.storageProvider,
          file.bucket,
          file.objectKey,
          file.mimeType,
          file.sizeBytes,
          file.checksumSha256,
          file.fileType,
          file.versionNo,
          audit.actorId,
          audit.actorId,
        ],
      );
      const id = String(result.insertId);
      await this.audit(connection, audit, 'technical-file.upload', id, null, {
        fileName: file.fileName,
        storageProvider: file.storageProvider,
        bucket: file.bucket,
        objectKey: file.objectKey,
        sizeBytes: file.sizeBytes,
        checksumSha256: file.checksumSha256,
      });
      return { id };
    });
  }

  async deleteTechnicalFile(id: string, audit: CommandContext) {
    // 当前没有 HTTP 删除入口。本实现仅保留未来恢复删除能力时的软删除基础语义；
    // 历史任务已通过 batch_step_records 快照独立下载；开放删除前仍须补齐引用与并发删除测试。
    await withTransaction(this.pool, async (connection) => {
      const file = await this.technicalFileRecord(connection, id, true);
      await this.assertTechnicalFileUnreferenced(connection, id);
      await connection.execute(
        `UPDATE technical_files SET status=0,is_deleted=1,deleted_by=?,deleted_at=NOW(),updated_by=?
          WHERE id=? AND is_deleted=0`,
        [audit.actorId, audit.actorId, id],
      );
      await this.audit(
        connection,
        audit,
        'technical-file.delete',
        id,
        {
          fileName: file.file_name,
          storageProvider: file.storage_provider,
          bucket: file.bucket,
          objectKey: file.object_key,
          status: file.status,
        },
        { status: 0, isDeleted: 1 },
      );
    });
  }

  private async audit(
    db: Db,
    audit: CommandContext,
    action: string,
    targetId: string,
    beforeData: unknown,
    afterData: unknown,
  ) {
    await writeTransactionalAudit(db, {
      logType: 'business',
      module: 'product',
      action,
      userId: audit.actorId,
      targetId,
      targetType: 'product-master-data',
      result: 'success',
      beforeData,
      afterData,
      ip: audit.ip,
      requestId: audit.requestId,
      userAgent: audit.userAgent,
    });
  }
  private async technicalFileRecord(db: Db, id: string, lock = false) {
    const [[row]] = await db.query<
      (RowDataPacket & {
        file_name: string;
        storage_provider: TechnicalFileStorageProvider;
        bucket: string | null;
        object_key: string;
        status: number;
      })[]
    >(
      `SELECT file_name,storage_provider,bucket,object_key,status FROM technical_files
        WHERE id=? AND file_type='sop' AND is_deleted=0${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!row) throw new ProductDomainError('NOT_FOUND', '技术文件不存在');
    return row;
  }
  private async assertTechnicalFileUnreferenced(db: Db, id: string) {
    const [[usage]] = await db.query<(RowDataPacket & { total: number })[]>(
      `SELECT
        (SELECT COUNT(*) FROM process_steps WHERE default_sop_file_id=? AND is_deleted=0) +
        (SELECT COUNT(*) FROM process_route_steps WHERE sop_file_id=? AND is_deleted=0) total`,
      [id, id],
    );
    if ((usage?.total ?? 0) > 0) {
      throw new ProductDomainError('CONFLICT', '技术文件仍被工序或工艺路线步骤引用，不能删除');
    }
  }
  private mapTechnicalFile(row: TechnicalFileRow): TechnicalFileListItem {
    return {
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
      createdAt: this.date(row.created_at),
      updatedAt: this.date(row.updated_at),
    };
  }
  private date(value: Date | null) {
    return value ? toBeijingISOString(value) : null;
  }
}
