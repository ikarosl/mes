import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withActiveConnection, withTransaction } from '@company/database';
import type { AttachmentCleanupErrorCode, AttachmentLifecycleResult } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import {
  AttachmentLifecycleRepository,
  type AttachmentPurgeAttempt,
} from '../application/ports/attachment.repository.js';
import { AttachmentError } from '../domain/attachment.errors.js';
import {
  ATTACHMENT_COLUMNS,
  attachmentLifecycle,
  cleanupLeaseExpired,
  type AttachmentRow,
} from './attachment-record.js';
import { writeAttachmentAudit } from './attachment-audit.js';

@Injectable()
export class MysqlAttachmentLifecycleRepository implements AttachmentLifecycleRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async trash(
    id: string,
    version: number,
    audit: CommandContext,
  ): Promise<AttachmentLifecycleResult> {
    return withTransaction(this.pool, async (db) => {
      const row = await this.lock(db, id);
      this.requireVersion(row, version);
      if (row.is_deleted || row.cleanup_status !== 'retained') {
        throw new AttachmentError('INVALID_ATTACHMENT_STATE', '只有正常附件可以移入回收站');
      }
      await this.requireUnreferenced(db, id);
      await db.execute(
        `UPDATE attachments SET is_deleted=1,deleted_by=?,deleted_at=CURRENT_TIMESTAMP,updated_by=?,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?`,
        [audit.actorId, audit.actorId, id],
      );
      const result = {
        id,
        version: row.version + 1,
        lifecycle: 'trashed' as const,
        cleanupStatus: 'retained' as const,
        cleanupErrorCode: null,
      };
      await writeAttachmentAudit(db, audit, 'attachment.trash', id, this.result(row), result);
      return result;
    });
  }

  async beginPurge(
    id: string,
    version: number,
    audit: CommandContext,
  ): Promise<AttachmentPurgeAttempt> {
    await withActiveConnection(this.pool, async (db) => {
      if (db !== this.pool)
        throw new AttachmentError('INVALID_ATTACHMENT_STATE', '附件清理不能嵌入其他业务事务');
    });
    return withTransaction(this.pool, async (db) => {
      const row = await this.lock(db, id);
      this.requireVersion(row, version);
      if (!row.is_deleted || row.cleanup_status === 'completed')
        throw new AttachmentError(
          'INVALID_ATTACHMENT_STATE',
          '只有回收站中尚未完成清理的附件可以清理',
        );
      if (row.cleanup_status === 'processing' && !cleanupLeaseExpired(row)) {
        throw new AttachmentError(
          'ATTACHMENT_CLEANUP_IN_PROGRESS',
          '附件正在清理，请稍后刷新查看结果',
        );
      }
      await this.requireUnreferenced(db, id);
      const attemptVersion = row.version + 1;
      await db.execute(
        `UPDATE attachments SET cleanup_status='processing',cleanup_started_at=CURRENT_TIMESTAMP,cleanup_completed_at=NULL,cleanup_error_code=NULL,version=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [attemptVersion, audit.actorId, id],
      );
      await writeAttachmentAudit(db, audit, 'attachment.purge-start', id, this.result(row), {
        version: attemptVersion,
        cleanupStatus: 'processing',
      });
      return {
        id,
        version: attemptVersion,
        locator: {
          storageProvider: row.storage_provider,
          bucket: row.bucket,
          objectKey: row.object_key,
        },
      };
    });
  }

  async finishPurge(
    attempt: AttachmentPurgeAttempt,
    errorCode: AttachmentCleanupErrorCode | null,
    audit: CommandContext,
  ): Promise<AttachmentLifecycleResult> {
    return withTransaction(this.pool, async (db) => {
      const row = await this.lock(db, attempt.id);
      // 到期重试产生新版本后，旧对象请求的迟到结果不能改写较新的尝试。
      if (row.version !== attempt.version || row.cleanup_status !== 'processing')
        return this.result(row);
      const status = errorCode ? 'failed' : 'completed';
      await db.execute(
        `UPDATE attachments SET cleanup_status=?,cleanup_completed_at=${errorCode ? 'NULL' : 'CURRENT_TIMESTAMP'},cleanup_error_code=?,version=version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=? AND cleanup_status='processing'`,
        [status, errorCode, audit.actorId, attempt.id, attempt.version],
      );
      const result: AttachmentLifecycleResult = {
        id: attempt.id,
        version: row.version + 1,
        lifecycle: status,
        cleanupStatus: status,
        cleanupErrorCode: errorCode,
      };
      await writeAttachmentAudit(
        db,
        audit,
        errorCode ? 'attachment.purge-failed' : 'attachment.purge-completed',
        attempt.id,
        this.result(row),
        result,
        errorCode ? 'failed' : 'success',
      );
      return result;
    });
  }

  private async lock(db: PoolConnection, id: string): Promise<AttachmentRow> {
    const [[row]] = await db.query<AttachmentRow[]>(
      `SELECT ${ATTACHMENT_COLUMNS} FROM attachments WHERE id=? FOR UPDATE`,
      [id],
    );
    if (!row) throw new AttachmentError('NOT_FOUND', '附件不存在');
    return row;
  }

  private requireVersion(row: AttachmentRow, version: number): void {
    if (row.version !== version)
      throw new AttachmentError('CONFLICT', '附件已发生变化，请刷新后重试');
    if (row.version >= 2147483646)
      throw new AttachmentError('CONFLICT', '附件版本已达上限，请联系管理员');
  }

  private async requireUnreferenced(db: PoolConnection, id: string): Promise<void> {
    // 读当前引用而非 RR 快照；绑定与解绑均先取得此附件共享锁。
    const [[reference]] = await db.query<RowDataPacket[]>(
      'SELECT attachment_id FROM attachment_references WHERE attachment_id=? LIMIT 1 FOR SHARE',
      [id],
    );
    if (reference)
      throw new AttachmentError(
        'ATTACHMENT_REFERENCED',
        '附件仍被业务资料或生产历史引用，不能删除',
      );
  }

  private result(row: AttachmentRow): AttachmentLifecycleResult {
    return {
      id: String(row.id),
      version: row.version,
      lifecycle: attachmentLifecycle(row),
      cleanupStatus: row.cleanup_status,
      cleanupErrorCode: row.cleanup_error_code,
    };
  }
}
