import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '@company/database';
import type { AuditContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/beijing-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductDomainError } from '../domain/product.errors.js';
import { mapProductWriteError } from './mysql-product.shared.js';

type Db = Pool | PoolConnection;
import type { ProcessStepListItem, ProcessStepPayload } from '@company/contracts';
import { type ProcessStepRepository } from '../application/ports/process-step.repository.js';
import type { StoredTechnicalFile } from '../application/ports/technical-file.repository.js';

@Injectable()
export class MysqlProcessStepRepository implements ProcessStepRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listProcessSteps(): Promise<ProcessStepListItem[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        step_code: string;
        step_name: string;
        description: string | null;
        default_sop_file_id: number | null;
        sop_file_name: string | null;
        status: number;
        remark: string | null;
        updated_at: Date | null;
      })[]
    >(`SELECT ps.id,ps.step_code,ps.step_name,ps.description,ps.default_sop_file_id,tf.file_name sop_file_name,
                    ps.status,ps.remark,ps.updated_at
             FROM process_steps ps LEFT JOIN technical_files tf ON tf.id=ps.default_sop_file_id AND tf.is_deleted=0
             WHERE ps.is_deleted=0 ORDER BY ps.step_code`);
    return rows.map((row) => ({
      id: String(row.id),
      stepCode: row.step_code,
      stepName: row.step_name,
      description: row.description,
      defaultSopFileId: row.default_sop_file_id === null ? null : String(row.default_sop_file_id),
      sopFileName: row.sop_file_name,
      status: row.status,
      remark: row.remark,
      updatedAt: this.date(row.updated_at),
    }));
  }

  async createProcessStep(payload: ProcessStepPayload, audit: AuditContext) {
    return withTransaction(this.pool, async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO process_steps (step_code,step_name,description,status,remark,created_by,updated_by) VALUES (?,?,?,?,?,?,?)`,
        [
          payload.stepCode,
          payload.stepName,
          payload.description ?? null,
          payload.status,
          payload.remark ?? null,
          audit.userId,
          audit.userId,
        ],
      );
      await this.audit(
        connection,
        audit,
        'process-step.create',
        String(result.insertId),
        null,
        payload,
      );
      return { id: String(result.insertId) };
    }).catch((error) =>
      mapProductWriteError(error, '编码或版本已存在，软删除记录的自然键也不能复用'),
    );
  }

  async updateProcessStep(id: string, payload: ProcessStepPayload, audit: AuditContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.processStepRecord(connection, id);
      await connection.execute(
        `UPDATE process_steps SET step_code=?,step_name=?,description=?,status=?,remark=?,updated_by=? WHERE id=? AND is_deleted=0`,
        [
          payload.stepCode,
          payload.stepName,
          payload.description ?? null,
          payload.status,
          payload.remark ?? null,
          audit.userId,
          id,
        ],
      );
      await this.audit(connection, audit, 'process-step.update', id, before, payload);
    }).catch((error) =>
      mapProductWriteError(error, '编码或版本已存在，软删除记录的自然键也不能复用'),
    );
  }

  async setProcessStepStatus(id: string, status: number, audit: AuditContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.processStepRecord(connection, id);
      await connection.execute(
        'UPDATE process_steps SET status=?,updated_by=? WHERE id=? AND is_deleted=0',
        [status, audit.userId, id],
      );
      await this.audit(
        connection,
        audit,
        'process-step.status',
        id,
        { status: before.status },
        { status },
      );
    });
  }

  async attachProcessStepSop(id: string, file: StoredTechnicalFile, audit: AuditContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.processStepRecord(connection, id);
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
          audit.userId,
          audit.userId,
        ],
      );
      await connection.execute(
        'UPDATE process_steps SET default_sop_file_id=?,updated_by=? WHERE id=? AND is_deleted=0',
        [result.insertId, audit.userId, id],
      );
      await this.audit(
        connection,
        audit,
        'process-step.upload-sop',
        id,
        { defaultSopFileId: before.default_sop_file_id },
        { defaultSopFileId: String(result.insertId), fileName: file.fileName },
      );
    });
  }

  async setProcessStepDefaultSop(id: string, fileId: string | null, audit: AuditContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.processStepRecord(connection, id);
      if (fileId) {
        const [[file]] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM technical_files
            WHERE id=? AND file_type='sop' AND status=1 AND is_deleted=0 FOR UPDATE`,
          [fileId],
        );
        if (!file) throw new ProductDomainError('NOT_FOUND', '可关联的 SOP 技术文件不存在');
      }
      await connection.execute(
        'UPDATE process_steps SET default_sop_file_id=?,updated_by=? WHERE id=? AND is_deleted=0',
        [fileId, audit.userId, id],
      );
      await this.audit(
        connection,
        audit,
        'process-step.default-sop',
        id,
        { defaultSopFileId: before.default_sop_file_id },
        { defaultSopFileId: fileId },
      );
    });
  }

  private async processStepRecord(db: Db, id: string) {
    const [[row]] = await db.query<
      (RowDataPacket & {
        id: number;
        step_code: string;
        step_name: string;
        status: number;
        default_sop_file_id: number | null;
      })[]
    >(
      'SELECT id,step_code,step_name,status,default_sop_file_id FROM process_steps WHERE id=? AND is_deleted=0',
      [id],
    );
    if (!row) throw new ProductDomainError('NOT_FOUND', '标准工序不存在');
    return row;
  }
  private async audit(
    db: Db,
    audit: AuditContext,
    action: string,
    targetId: string,
    beforeData: unknown,
    afterData: unknown,
  ) {
    await writeTransactionalAudit(db, {
      logType: 'business',
      module: 'product',
      action,
      userId: audit.userId,
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
  private date(value: Date | null) {
    return value ? toBeijingISOString(value) : null;
  }
}
