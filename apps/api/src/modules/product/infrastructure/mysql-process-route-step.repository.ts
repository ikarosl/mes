import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '@company/database';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductDomainError } from '../domain/product.errors.js';
import { lockTechnicalFileSnapshot } from './mysql-product-reference-locks.js';
import type {
  ProcessRouteStatus,
  ProcessRouteStepItem,
  ProcessRouteStepPayload,
} from '@company/contracts';
import { type ProcessRouteStepRepository } from '../application/ports/process-route-step.repository.js';

type Db = Pool | PoolConnection;

@Injectable()
export class MysqlProcessRouteStepRepository implements ProcessRouteStepRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listRouteSteps(routeId: string): Promise<ProcessRouteStepItem[]> {
    await this.routeRecord(this.pool, routeId);
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        process_step_id: number;
        step_order: number;
        step_code_snapshot: string;
        step_name_snapshot: string;
        description_snapshot: string | null;
        default_owner_id: number | null;
        sop_file_id: number | null;
        sop_file_name_snapshot: string | null;
        need_inspection: number;
        need_record: number;
        status: number;
        remark: string | null;
      })[]
    >(
      `SELECT rs.id,rs.process_step_id,rs.step_order,rs.step_code_snapshot,rs.step_name_snapshot,rs.description_snapshot,
                    rs.default_owner_id,rs.sop_file_id,rs.sop_file_name_snapshot,
                    rs.need_inspection,rs.need_record,rs.status,rs.remark
             FROM process_route_steps rs
             WHERE rs.route_id=? AND rs.is_deleted=0 ORDER BY rs.step_order`,
      [routeId],
    );
    return rows.map((row) => ({
      id: String(row.id),
      processStepId: String(row.process_step_id),
      stepOrder: row.step_order,
      stepCode: row.step_code_snapshot,
      stepName: row.step_name_snapshot,
      description: row.description_snapshot,
      defaultOwnerId: row.default_owner_id === null ? null : String(row.default_owner_id),
      defaultOwnerName: null,
      sopFileId: row.sop_file_id === null ? null : String(row.sop_file_id),
      sopFileName: row.sop_file_name_snapshot,
      needInspection: Boolean(row.need_inspection),
      needRecord: Boolean(row.need_record),
      status: row.status,
      remark: row.remark,
    }));
  }

  async replaceRouteSteps(
    routeId: string,
    items: ProcessRouteStepPayload[],
    audit: CommandContext,
  ) {
    await withTransaction(this.pool, async (connection) => {
      const route = await this.routeRecord(connection, routeId, true);
      if (route.status !== 'draft')
        throw new ProductDomainError(
          'IMMUTABLE_ROUTE',
          '路线启用后步骤和 SOP 快照不可原地修改，请创建新版本',
        );
      const before = await this.listRouteStepRecords(connection, routeId);
      const snapshots: Array<
        ProcessRouteStepPayload & {
          stepCode: string;
          stepName: string;
          description: string | null;
          sopFileId: string | null;
          sopFileName: string | null;
          sopObjectKey: string | null;
          sopVersionNo: string | null;
        }
      > = [];
      for (const item of items) {
        const [[step]] = await connection.query<
          (RowDataPacket & {
            step_code: string;
            step_name: string;
            description: string | null;
            default_sop_file_id: number | null;
          })[]
        >(
          `SELECT ps.step_code,ps.step_name,ps.description,ps.default_sop_file_id
                FROM process_steps ps
                WHERE ps.id=? AND ps.is_deleted=0 AND ps.status=1`,
          [item.processStepId],
        );
        if (!step) throw new ProductDomainError('NOT_FOUND', '路线引用的工序不存在或已停用');
        const resolvedSopFileId =
          item.sopFileId ??
          (step.default_sop_file_id === null ? null : String(step.default_sop_file_id));
        const sop = resolvedSopFileId
          ? await lockTechnicalFileSnapshot(connection, resolvedSopFileId)
          : null;
        snapshots.push({
          ...item,
          stepCode: step.step_code,
          stepName: step.step_name,
          description: step.description,
          sopFileId: resolvedSopFileId,
          sopFileName: sop?.file_name ?? null,
          sopObjectKey: sop?.object_key ?? null,
          sopVersionNo: sop?.version_no ?? null,
        });
      }
      await connection.execute(
        'UPDATE process_route_steps SET is_deleted=1,deleted_by=?,deleted_at=NOW(),updated_by=? WHERE route_id=? AND is_deleted=0',
        [audit.actorId, audit.actorId, routeId],
      );
      for (const item of snapshots) {
        await connection.execute(
          `INSERT INTO process_route_steps (route_id,process_step_id,step_order,step_code_snapshot,step_name_snapshot,description_snapshot,default_owner_id,sop_file_id,sop_file_name_snapshot,sop_object_key_snapshot,sop_version_no_snapshot,need_inspection,need_record,status,remark,created_by,updated_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE process_step_id=VALUES(process_step_id),step_code_snapshot=VALUES(step_code_snapshot),step_name_snapshot=VALUES(step_name_snapshot),
             description_snapshot=VALUES(description_snapshot),default_owner_id=VALUES(default_owner_id),sop_file_id=VALUES(sop_file_id),
             sop_file_name_snapshot=VALUES(sop_file_name_snapshot),sop_object_key_snapshot=VALUES(sop_object_key_snapshot),sop_version_no_snapshot=VALUES(sop_version_no_snapshot),need_inspection=VALUES(need_inspection),
             need_record=VALUES(need_record),status=VALUES(status),remark=VALUES(remark),updated_by=VALUES(updated_by),is_deleted=0,deleted_by=NULL,deleted_at=NULL`,
          [
            routeId,
            item.processStepId,
            item.stepOrder,
            item.stepCode,
            item.stepName,
            item.description,
            item.defaultOwnerId || null,
            item.sopFileId,
            item.sopFileName,
            item.sopObjectKey,
            item.sopVersionNo,
            Number(item.needInspection),
            Number(item.needRecord),
            item.status ?? 1,
            item.remark ?? null,
            audit.actorId,
            audit.actorId,
          ],
        );
      }
      await this.audit(
        connection,
        audit,
        'route.steps.replace',
        routeId,
        before,
        snapshots.map(({ sopObjectKey: _secret, ...item }) => item),
      );
    });
  }

  private async routeRecord(db: Db, id: string, lock = false) {
    const [[row]] = await db.query<
      (RowDataPacket & {
        id: number;
        route_code: string;
        route_name: string;
        product_id: number;
        version_no: string;
        status: ProcessRouteStatus;
      })[]
    >(
      `SELECT id,route_code,route_name,product_id,version_no,status FROM process_routes WHERE id=? AND is_deleted=0${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!row) throw new ProductDomainError('NOT_FOUND', '工艺路线不存在');
    return row;
  }
  private async listRouteStepRecords(db: Db, routeId: string) {
    const [rows] = await db.query<
      (RowDataPacket & {
        id: number;
        process_step_id: number;
        step_order: number;
        step_code_snapshot: string;
        step_name_snapshot: string;
      })[]
    >(
      'SELECT id,process_step_id,step_order,step_code_snapshot,step_name_snapshot FROM process_route_steps WHERE route_id=? AND is_deleted=0 ORDER BY step_order',
      [routeId],
    );
    return rows;
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
}
