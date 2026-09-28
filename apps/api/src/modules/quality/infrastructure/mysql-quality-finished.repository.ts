import { Inject, Injectable } from '@nestjs/common';
import { withActiveConnection, withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  FinishedInspectionCommandResult,
  StartFinishedInspectionResult,
  FinishedInspectionTaskDetail,
  FinishedInspectionTaskQuery,
  PageQuery,
  PageResult,
  ProductionOutputInspection,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import {
  FinishedInspectionRepository,
  type RecordFinishedInspectionInput,
} from '../application/ports/finished-inspection.repository.js';
import type { QualityFinishedInspectionQuery } from '../application/quality-finished-inspection.query.js';
import { QualityFinishedInspectionSourceRegistry } from '../application/quality-finished-inspection-source.registry.js';
import { QualityCommandError } from '../quality-command.error.js';
import { evaluateOutputInspection } from '../domain/finished-inspection.policy.js';
import { mapFinishedInspection, type InspectionRow } from './mysql-quality-finished.mapper.js';
import {
  listFinishedInspectionTasks,
  readFinishedInspectionTask,
} from './queries/finished-inspection-tasks.query.js';
import { finishedInspectionSelect as SELECT } from './queries/finished-inspection-round.sql.js';
@Injectable()
export class MysqlQualityFinishedRepository
  extends FinishedInspectionRepository
  implements QualityFinishedInspectionQuery
{
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly sources: QualityFinishedInspectionSourceRegistry,
  ) {
    super();
  }
  listTasks(query: FinishedInspectionTaskQuery) {
    return withActiveConnection(this.pool, (db) => listFinishedInspectionTasks(db, query));
  }
  detail(batchId: string): Promise<FinishedInspectionTaskDetail | null> {
    return withActiveConnection(this.pool, async (db) => {
      const task = await readFinishedInspectionTask(db, batchId);
      if (!task) return null;
      let latestInspection: ProductionOutputInspection | null = null;
      if (task.item.latestInspectionId) {
        const [[row]] = await db.query<InspectionRow[]>(
          `${SELECT} WHERE r.id=? AND r.production_batch_id=?`,
          [task.item.latestInspectionId, batchId],
        );
        latestInspection = row ? mapFinishedInspection(row) : null;
      }
      return { ...task.item, declared: task.declared, latestInspection };
    });
  }
  listRecords(batchId: string, query: PageQuery): Promise<PageResult<ProductionOutputInspection>> {
    return withActiveConnection(this.pool, async (db) => {
      const page = query.page ?? 1,
        pageSize = query.pageSize ?? 10;
      const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
        'SELECT COUNT(*) total FROM quality_inspection_record WHERE production_batch_id=?',
        [batchId],
      );
      const [rows] = await db.query<InspectionRow[]>(
        `${SELECT} WHERE r.production_batch_id=? ORDER BY r.id DESC LIMIT ? OFFSET ?`,
        [batchId, pageSize, (page - 1) * pageSize],
      );
      return {
        items: rows.map(mapFinishedInspection),
        total: Number(count?.total ?? 0),
        page,
        pageSize,
      };
    });
  }
  readForCloseout(
    closeoutId: string,
    batchId: string,
    lock: boolean,
  ): Promise<ProductionOutputInspection[]> {
    return withActiveConnection(this.pool, async (db) => {
      if (lock && !('release' in db))
        throw new QualityCommandError('INVALID_STATE', '检验当前读要求来源活动事务');
      const [rows] = await db.query<InspectionRow[]>(
        `${SELECT} WHERE r.closeout_id=? AND r.production_batch_id=? ORDER BY r.id${lock ? ' FOR SHARE OF r,c' : ''}`,
        [closeoutId, batchId],
      );
      return rows.map(mapFinishedInspection);
    });
  }
  start(
    batchId: string,
    version: number,
    context: CommandContext,
  ): Promise<StartFinishedInspectionResult> {
    return withTransaction(this.pool, () =>
      this.sources.require().start(batchId, version, context),
    );
  }
  record(
    batchId: string,
    payload: RecordFinishedInspectionInput,
    context: CommandContext,
  ): Promise<FinishedInspectionCommandResult> {
    return withTransaction(this.pool, async (db) => {
      if (!context.actorId) throw new QualityCommandError('INVALID_INPUT', '缺少当前操作人');
      evaluateOutputInspection(payload);
      const inspectedAt = new Date(payload.inspectedAt);
      if (
        !Number.isFinite(inspectedAt.getTime()) ||
        !payload.resultNote.trim() ||
        payload.resultNote.length > 5000 ||
        !payload.evidenceReference.trim() ||
        payload.evidenceReference.length > 5000
      )
        throw new QualityCommandError('INVALID_INPUT', '请填写检验时间、结论及凭据');
      const source = await this.sources.require().prepare(batchId, payload.version);
      const records = await this.readForCloseout(source.closeoutId, batchId, true);
      if (records.some((record) => record.roundId === source.roundId))
        throw new QualityCommandError('INVALID_STATE', '本轮检验已完成，请明确发起下一轮复检');
      const previousId = records.at(-1)?.id ?? null;
      const [createdCase] = await db.execute<ResultSetHeader>(
        `INSERT INTO quality_inspection_case(source_kind,closeout_id,production_batch_id,finished_round_id,declared_version,
          declared_available_quantity,declared_extra_quantity,declared_scrap_quantity,declared_quantity,
          case_type,status,reason,completed_by,completed_at,created_by,updated_by)
          VALUES('finished',?,?,?,?,?,?,?,?,?,'completed',?,?,NOW(),?,?)`,
        [
          source.closeoutId,
          batchId,
          source.roundId,
          source.version,
          source.declared.availableQuantity,
          source.declared.extraQuantity,
          source.declared.additionalScrapQuantity,
          source.declared.availableQuantity + source.declared.extraQuantity,
          previousId ? 'reinspection' : 'initial',
          payload.resultNote,
          context.actorId,
          context.actorId,
          context.actorId,
        ],
      );
      const [created] = await db.execute<ResultSetHeader>(
        `INSERT INTO quality_inspection_record(case_id,closeout_id,production_batch_id,inspection_method,
          covered_quantity,qualified_quantity,unqualified_quantity,release_decision,inspected_at,
          result_note,evidence_reference,previous_record_id,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          createdCase.insertId,
          source.closeoutId,
          batchId,
          payload.inspectionMethod,
          payload.coveredQuantity,
          payload.inspectedQuantity - payload.unqualifiedQuantity,
          payload.unqualifiedQuantity,
          payload.releaseDecision,
          inspectedAt,
          payload.resultNote,
          payload.evidenceReference,
          previousId,
          context.actorId,
        ],
      );
      await this.sources.require().advance(source, context);
      const result = {
        batchId,
        inspectionId: String(created.insertId),
        version: source.version + 1,
      };
      await audit(db, context, result.inspectionId, {
        ...payload,
        ...result,
        declaredVersion: source.version,
        closeoutId: source.closeoutId,
        declared: source.declared,
        previousInspectionId: previousId,
      });
      return result;
    });
  }
}
function audit(db: PoolConnection, context: CommandContext, id: string, after: object) {
  return writeTransactionalAudit(db, {
    logType: 'business',
    module: 'quality',
    action: 'finished-inspection.record',
    userId: context.actorId,
    targetId: id,
    targetType: 'quality-finished-inspection',
    result: 'success',
    beforeData: null,
    afterData: after,
    ip: context.ip,
    requestId: context.requestId,
    userAgent: context.userAgent,
  });
}
