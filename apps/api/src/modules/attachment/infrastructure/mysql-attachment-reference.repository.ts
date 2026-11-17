import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withActiveConnection } from '@company/database';
import type { AttachmentOwnerType, AttachmentReferenceSlot } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { AttachmentReferenceRepository } from '../application/ports/attachment.repository.js';
import { referenceFileType } from '../domain/attachment-reference.rules.js';
import { AttachmentError } from '../domain/attachment.errors.js';
import { ATTACHMENT_COLUMNS, type AttachmentRow } from './attachment-record.js';
import { writeAttachmentAudit } from './attachment-audit.js';

@Injectable()
export class MysqlAttachmentReferenceRepository implements AttachmentReferenceRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async setReference(
    ownerType: AttachmentOwnerType,
    ownerId: string,
    slot: AttachmentReferenceSlot,
    attachmentId: string | null,
    audit: CommandContext,
  ): Promise<void> {
    return this.inBusinessTransaction(async (db) => {
      const before = await this.currentIds(db, ownerType, ownerId, slot, false);
      const ids = [...new Set([...before, ...(attachmentId ? [attachmentId] : [])])];
      const files = await this.lockAttachments(db, ids);
      if (attachmentId) this.requireAvailable(files, attachmentId, ownerType, slot);
      const current = await this.currentIds(db, ownerType, ownerId, slot, true);
      if (current.join(',') !== before.join(','))
        throw new AttachmentError('CONFLICT', '附件引用已变化，请重新提交业务资料');
      if (
        (attachmentId === null && current.length === 0) ||
        (current.length === 1 && current[0] === attachmentId)
      )
        return;
      await db.execute(
        'DELETE FROM attachment_references WHERE owner_type=? AND owner_id=? AND slot=?',
        [ownerType, ownerId, slot],
      );
      if (attachmentId) await this.insert(db, ownerType, ownerId, slot, attachmentId, audit);
      await writeAttachmentAudit(
        db,
        audit,
        'attachment.reference.replace',
        attachmentId ?? current[0],
        { ownerType, ownerId, slot, attachmentIds: current },
        { ownerType, ownerId, slot, attachmentIds: attachmentId ? [attachmentId] : [] },
      );
    });
  }

  async bindReference(
    ownerType: AttachmentOwnerType,
    ownerId: string,
    slot: AttachmentReferenceSlot,
    attachmentId: string,
    audit: CommandContext,
  ): Promise<void> {
    return this.inBusinessTransaction(async (db) => {
      const rows = await this.lockAttachments(db, [attachmentId]);
      this.requireAvailable(rows, attachmentId, ownerType, slot);
      const current = await this.currentIds(db, ownerType, ownerId, slot, true);
      if (current.includes(attachmentId)) return;
      await this.insert(db, ownerType, ownerId, slot, attachmentId, audit);
      await writeAttachmentAudit(db, audit, 'attachment.reference.bind', attachmentId, null, {
        ownerType,
        ownerId,
        slot,
        attachmentId,
      });
    });
  }

  private async inBusinessTransaction(work: (db: PoolConnection) => Promise<void>): Promise<void> {
    return withActiveConnection(this.pool, async (db) => {
      if (db === this.pool) throw new Error('附件引用必须与业务资料在同一事务中保存');
      return work(db as PoolConnection);
    });
  }

  private async lockAttachments(db: PoolConnection, ids: string[]): Promise<AttachmentRow[]> {
    if (ids.length === 0) return [];
    const sorted = [...ids].sort((a, b) => {
      if (BigInt(a) === BigInt(b)) return 0;
      return BigInt(a) < BigInt(b) ? -1 : 1;
    });
    const [rows] = await db.query<AttachmentRow[]>(
      `SELECT ${ATTACHMENT_COLUMNS} FROM attachments WHERE id IN (?) ORDER BY id FOR SHARE`,
      [sorted],
    );
    return rows;
  }

  private requireAvailable(
    rows: AttachmentRow[],
    attachmentId: string,
    ownerType: AttachmentOwnerType,
    slot: AttachmentReferenceSlot,
  ): void {
    const row = rows.find((item) => String(item.id) === attachmentId);
    const fileType = referenceFileType(ownerType, slot);
    if (
      !row ||
      row.file_type !== fileType ||
      row.status !== 1 ||
      row.is_deleted !== 0 ||
      row.cleanup_status !== 'retained' ||
      (fileType === 'sop' && !row.version_no)
    )
      throw new AttachmentError('ATTACHMENT_NOT_AVAILABLE', '附件不存在、用途不符或已不可用于绑定');
  }

  private async currentIds(
    db: PoolConnection,
    ownerType: AttachmentOwnerType,
    ownerId: string,
    slot: AttachmentReferenceSlot,
    lock: boolean,
  ): Promise<string[]> {
    const [rows] = await db.query<(RowDataPacket & { attachment_id: string | number })[]>(
      `SELECT attachment_id FROM attachment_references WHERE owner_type=? AND owner_id=? AND slot=? ORDER BY attachment_id${lock ? ' FOR UPDATE' : ''}`,
      [ownerType, ownerId, slot],
    );
    return rows.map((row) => String(row.attachment_id));
  }

  private async insert(
    db: PoolConnection,
    ownerType: AttachmentOwnerType,
    ownerId: string,
    slot: AttachmentReferenceSlot,
    attachmentId: string,
    audit: CommandContext,
  ): Promise<void> {
    await db.execute(
      'INSERT INTO attachment_references(attachment_id,owner_type,owner_id,slot,created_by) VALUES (?,?,?,?,?)',
      [attachmentId, ownerType, ownerId, slot, audit.actorId],
    );
  }
}
