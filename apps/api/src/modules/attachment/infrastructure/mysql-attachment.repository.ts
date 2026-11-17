import { Inject, Injectable } from '@nestjs/common';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withActiveConnection, withTransaction } from '@company/database';
import type {
  AttachmentListItem,
  AttachmentOwnerType,
  AttachmentQuery,
  AttachmentReferenceItem,
  AttachmentReferenceSlot,
  PageQuery,
  PageResult,
  TechnicalFileListItem,
  TechnicalFileQuery,
  TechnicalFileType,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { AttachmentRepository } from '../application/ports/attachment.repository.js';
import type {
  AttachmentLocator,
  StoredAttachment,
} from '../application/ports/attachment.storage.js';
import { AttachmentError } from '../domain/attachment.errors.js';
import {
  ATTACHMENT_COLUMNS,
  mapAttachmentFile,
  mapManagedAttachment,
  type AttachmentRow,
} from './attachment-record.js';
import { writeAttachmentAudit } from './attachment-audit.js';

@Injectable()
export class MysqlAttachmentRepository implements AttachmentRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listTechnicalFiles(query: TechnicalFileQuery): Promise<PageResult<TechnicalFileListItem>> {
    const conditions = ['is_deleted=0', "cleanup_status='retained'", 'file_type=?'];
    const parameters: unknown[] = [query.fileType ?? 'sop'];
    this.keyword(query.keyword, conditions, parameters);
    if (query.status !== undefined) {
      conditions.push('status=?');
      parameters.push(query.status);
    }
    if (query.storageProvider) {
      conditions.push('storage_provider=?');
      parameters.push(query.storageProvider);
    }
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where = conditions.join(' AND ');
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM attachments WHERE ${where}`,
      parameters,
    );
    const [rows] = await this.pool.query<AttachmentRow[]>(
      `SELECT ${ATTACHMENT_COLUMNS} FROM attachments WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
      [...parameters, pageSize, (page - 1) * pageSize],
    );
    return { items: rows.map(mapAttachmentFile), total: Number(count?.total ?? 0), page, pageSize };
  }

  async getCurrent(id: string): Promise<TechnicalFileListItem> {
    return this.readOne(
      id,
      "status=1 AND is_deleted=0 AND cleanup_status='retained'",
      '附件不存在或已不可用',
    );
  }

  async getManyForDisplay(ids: string[]): Promise<TechnicalFileListItem[]> {
    if (ids.length === 0) return [];
    return withActiveConnection(this.pool, async (db) => {
      const [rows] = await db.query<AttachmentRow[]>(
        `SELECT ${ATTACHMENT_COLUMNS} FROM attachments WHERE id IN (?)`,
        [ids],
      );
      return rows.map(mapAttachmentFile);
    });
  }

  getHistorical(id: string): Promise<TechnicalFileListItem> {
    return this.readOne(id, "cleanup_status='retained'", '历史附件不存在或已进入清理流程');
  }
  getForManagementDownload(id: string): Promise<TechnicalFileListItem> {
    return this.readOne(id, "cleanup_status='retained'", '附件不存在或已进入清理流程');
  }

  async create(file: StoredAttachment, audit: CommandContext): Promise<{ id: string }> {
    return withTransaction(this.pool, async (db) => {
      const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO attachments(file_name,original_name,storage_provider,bucket,object_key,mime_type,size_bytes,checksum_sha256,file_type,version_no,status,created_by,updated_by)
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
      await writeAttachmentAudit(db, audit, 'attachment.upload', id, null, file);
      return { id };
    });
  }

  async canRemoveUnregisteredObject(locator: AttachmentLocator): Promise<boolean> {
    // 当前 S3 上传必有 bucket，完整非空 locator 才受对象唯一键保护。
    if (locator.storageProvider !== 's3' || !locator.bucket) return false;
    return withActiveConnection(this.pool, async (active) => {
      // 嵌套调用仍可能由最外层提交，不能在其结束前删除对象或读取独立结果。
      if (active !== this.pool) return false;
      try {
        return await withTransaction(this.pool, async (db) => {
          // 锁定读不使用 RR 快照，并等待该随机 locator 的原插入事务最终提交或回滚。
          const [[registered]] = await db.query<RowDataPacket[]>(
            `SELECT id FROM attachments
             WHERE storage_provider=? AND bucket=? AND object_key=? FOR UPDATE`,
            [locator.storageProvider, locator.bucket, locator.objectKey],
          );
          return !registered;
        });
      } catch {
        // 查询或本次只读事务的提交也可能结果未知，不能据此允许补偿删除。
        return false;
      }
    });
  }

  async requireAvailable(
    ids: string[],
    fileType: TechnicalFileType,
  ): Promise<TechnicalFileListItem[]> {
    return withActiveConnection(this.pool, async (db) => {
      if (db === this.pool) throw new Error('附件写入资格必须在业务事务中校验');
      if (ids.length === 0) return [];
      const sorted = [...new Set(ids)].sort((a, b) => {
        if (BigInt(a) === BigInt(b)) return 0;
        return BigInt(a) < BigInt(b) ? -1 : 1;
      });
      const [rows] = await db.query<AttachmentRow[]>(
        `SELECT ${ATTACHMENT_COLUMNS} FROM attachments WHERE id IN (?) ORDER BY id FOR SHARE`,
        [sorted],
      );
      if (
        rows.length !== sorted.length ||
        rows.some(
          (row) =>
            row.file_type !== fileType ||
            row.status !== 1 ||
            row.is_deleted !== 0 ||
            row.cleanup_status !== 'retained' ||
            (fileType === 'sop' && !row.version_no),
        )
      ) {
        throw new AttachmentError(
          'ATTACHMENT_NOT_AVAILABLE',
          '附件不存在、用途不符或已不可用于绑定',
        );
      }
      return rows.map(mapAttachmentFile);
    });
  }

  async list(query: AttachmentQuery): Promise<PageResult<AttachmentListItem>> {
    const conditions = ['1=1'];
    const parameters: unknown[] = [];
    this.keyword(query.keyword, conditions, parameters);
    if (query.fileType) {
      conditions.push('file_type=?');
      parameters.push(query.fileType);
    }
    if (query.referenceState)
      conditions.push(
        `${query.referenceState === 'unreferenced' ? 'NOT ' : ''}EXISTS(SELECT 1 FROM attachment_references r WHERE r.attachment_id=attachments.id)`,
      );
    if (query.lifecycle === 'active') conditions.push("is_deleted=0 AND cleanup_status='retained'");
    else if (query.lifecycle === 'trashed')
      conditions.push("is_deleted=1 AND cleanup_status='retained'");
    else if (query.lifecycle) {
      conditions.push('cleanup_status=?');
      parameters.push(query.lifecycle);
    }
    const where = conditions.join(' AND ');
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM attachments WHERE ${where}`,
      parameters,
    );
    const [rows] = await this.pool.query<AttachmentRow[]>(
      `SELECT ${ATTACHMENT_COLUMNS},(SELECT COUNT(*) FROM attachment_references r WHERE r.attachment_id=attachments.id) reference_count FROM attachments WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
      [...parameters, pageSize, (page - 1) * pageSize],
    );
    return {
      items: rows.map(mapManagedAttachment),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }

  async listReferences(id: string, query: PageQuery): Promise<PageResult<AttachmentReferenceItem>> {
    const [[exists]] = await this.pool.query<RowDataPacket[]>(
      'SELECT id FROM attachments WHERE id=?',
      [id],
    );
    if (!exists) throw new AttachmentError('NOT_FOUND', '附件不存在');
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM attachment_references WHERE attachment_id=?',
      [id],
    );
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        attachment_id: string | number;
        owner_type: AttachmentOwnerType;
        owner_id: string | number;
        slot: AttachmentReferenceSlot;
        created_by: string | number | null;
        created_at: Date;
      })[]
    >(
      'SELECT attachment_id,owner_type,owner_id,slot,created_by,created_at FROM attachment_references WHERE attachment_id=? ORDER BY created_at DESC,owner_type,owner_id,slot LIMIT ? OFFSET ?',
      [id, pageSize, (page - 1) * pageSize],
    );
    return {
      items: rows.map((row) => ({
        attachmentId: String(row.attachment_id),
        ownerType: row.owner_type,
        ownerId: String(row.owner_id),
        slot: row.slot,
        createdBy: row.created_by === null ? null : String(row.created_by),
        createdByName: null,
        createdAt: toBeijingISOString(row.created_at),
      })),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }

  private async readOne(
    id: string,
    conditions: string,
    message: string,
  ): Promise<TechnicalFileListItem> {
    return withActiveConnection(this.pool, async (db) => {
      const [[row]] = await db.query<AttachmentRow[]>(
        `SELECT ${ATTACHMENT_COLUMNS} FROM attachments WHERE id=? AND ${conditions}`,
        [id],
      );
      if (!row) throw new AttachmentError('NOT_FOUND', message);
      return mapAttachmentFile(row);
    });
  }

  private keyword(keyword: string | undefined, conditions: string[], parameters: unknown[]): void {
    if (!keyword) return;
    conditions.push('(file_name LIKE ? OR original_name LIKE ? OR version_no LIKE ?)');
    parameters.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
}
