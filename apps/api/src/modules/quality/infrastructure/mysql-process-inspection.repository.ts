import { Inject, Injectable } from '@nestjs/common';
import { withActiveConnection, withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  CreateProcessInspectionPayload,
  CorrectProcessInspectionPayload,
  ReverseProcessInspectionPayload,
  RecordProcessInspectionPayload,
  PageQuery,
  PageResult,
  ProcessInspectionEntry,
  ProcessInspectionRecord,
  ProcessInspectionQuery,
  ProcessInspectionStepSummary,
  ProcessInspectionCommandResult,
} from '@company/contracts';
import { PRODUCTION_OUTPUT_QUANTITY_MAX } from '@company/constants';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProcessInspectionRepository } from '../application/ports/process-inspection.repository.js';
import type {
  QualityProcessInspectionCommand,
  AcceptProcessInspectionInput,
  AcceptedProcessInspection,
  ProcessInspectionSource,
} from '../application/quality-process-inspection.command.js';
import { QualityProcessInspectionSourceRegistry } from '../application/quality-process-inspection-source.registry.js';
import { QualityCommandError } from '../quality-command.error.js';
import {
  normalizeProcessInspection,
  requireProcessInspectionText,
} from '../domain/process-inspection.policy.js';
import {
  mapProcessInspectionRecord,
  PROCESS_INSPECTION_ROOT_COLUMNS,
  PROCESS_INSPECTION_RECORD_COLUMNS,
  type ProcessInspectionRootRow,
  type ProcessInspectionRecordRow,
} from './mysql-process-inspection.mapper.js';
import {
  listProcessInspectionSteps,
  listProcessInspectionEntries,
  listPendingProcessInspectionEntries,
  readProcessInspectionStep,
  readProcessInspectionEntries,
} from './queries/process-inspections.query.js';
import { readQualitySnapshot } from './mysql-quality-read-snapshot.js';
@Injectable()
export class MysqlProcessInspectionRepository
  extends ProcessInspectionRepository
  implements QualityProcessInspectionCommand
{
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly sources: QualityProcessInspectionSourceRegistry,
  ) {
    super();
  }
  list(query: ProcessInspectionQuery): Promise<PageResult<ProcessInspectionStepSummary>> {
    return readQualitySnapshot(this.pool, (db) => listProcessInspectionSteps(db, query));
  }
  step(stepId: string): Promise<ProcessInspectionStepSummary | null> {
    return readQualitySnapshot(this.pool, (db) => readProcessInspectionStep(db, stepId));
  }
  entries(stepId: string, query: PageQuery): Promise<PageResult<ProcessInspectionEntry>> {
    return readQualitySnapshot(this.pool, async (db) => {
      if (!(await readProcessInspectionStep(db, stepId)))
        throw new QualityCommandError('NOT_FOUND', '工序专检办理入口不存在');
      return listProcessInspectionEntries(db, stepId, query);
    });
  }
  detail(id: string): Promise<ProcessInspectionEntry | null> {
    return readQualitySnapshot(
      this.pool,
      async (db) => (await readProcessInspectionEntries(db, [id]))[0] ?? null,
    );
  }
  pendingForStep(
    source: ProcessInspectionSource,
    query: PageQuery,
  ): Promise<PageResult<ProcessInspectionEntry>> {
    return readQualitySnapshot(this.pool, (db) =>
      listPendingProcessInspectionEntries(db, source, query),
    );
  }
  detailForStep(
    source: ProcessInspectionSource,
    inspectionId: string,
  ): Promise<ProcessInspectionEntry | null> {
    return readQualitySnapshot(
      this.pool,
      async (db) => (await readProcessInspectionEntries(db, [inspectionId], source))[0] ?? null,
    );
  }
  records(id: string, query: PageQuery): Promise<PageResult<ProcessInspectionRecord>> {
    return readQualitySnapshot(this.pool, async (db) => {
      const page = query.page ?? 1,
        pageSize = query.pageSize ?? 10;
      const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
        'SELECT COUNT(*) total FROM quality_process_inspection_record WHERE inspection_id=?',
        [id],
      );
      const [rows] = await db.query<ProcessInspectionRecordRow[]>(
        `SELECT ${PROCESS_INSPECTION_RECORD_COLUMNS} FROM quality_process_inspection_record WHERE inspection_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
        [id, pageSize, (page - 1) * pageSize],
      );
      return {
        items: rows.map(mapProcessInspectionRecord),
        total: Number(count?.total ?? 0),
        page,
        pageSize,
      };
    });
  }
  getSource(id: string): Promise<ProcessInspectionSource | null> {
    return withActiveConnection(this.pool, async (db) => {
      const [[row]] = await db.query<ProcessInspectionRootRow[]>(
        'SELECT production_batch_id,batch_step_record_id FROM quality_process_inspection WHERE id=?',
        [id],
      );
      return row
        ? { batchId: String(row.production_batch_id), stepId: String(row.batch_step_record_id) }
        : null;
    });
  }
  create(
    payload: CreateProcessInspectionPayload,
    context: CommandContext,
  ): Promise<ProcessInspectionCommandResult> {
    const facts = normalizeProcessInspection(payload);
    return withTransaction(this.pool, async (db) => {
      requireActor(context);
      await this.sources.require().prepare(payload.batchId, payload.stepId, 'create');
      const [created] = await db.execute<ResultSetHeader>(
        'INSERT INTO quality_process_inspection(production_batch_id,batch_step_record_id,created_by,updated_by) VALUES(?,?,?,?)',
        [payload.batchId, payload.stepId, context.actorId, context.actorId],
      );
      const id = String(created.insertId);
      const recordId = await insertRecord(db, id, facts, 'normal', null, null, null, context);
      await db.execute('UPDATE quality_process_inspection SET current_record_id=? WHERE id=?', [
        recordId,
        id,
      ]);
      const result = { inspectionId: id, recordId, version: 0 };
      await audit(db, context, 'process-inspection.create', id, null, {
        ...result,
        ...payload,
        ...facts,
      });
      return result;
    });
  }
  correct(
    id: string,
    payload: CorrectProcessInspectionPayload,
    context: CommandContext,
  ): Promise<ProcessInspectionCommandResult> {
    const facts = normalizeProcessInspection(payload),
      reason = requireProcessInspectionText(payload.reason, '更正原因');
    return withTransaction(this.pool, async (db) => {
      requireActor(context);
      const root = await this.prepareRoot(db, id, payload.version, 'correct');
      const previous = await currentRecord(db, root);
      if (facts.unqualifiedQuantity < Number(root.accepted_quantity))
        throw new QualityCommandError(
          'INVALID_STATE',
          `已有${root.accepted_quantity}件被产线处理，不合格数量不能低于该数量`,
        );
      await insertRecord(
        db,
        id,
        mapProcessInspectionRecord(previous),
        'reversal',
        String(previous.id),
        null,
        reason,
        context,
      );
      const recordId = await insertRecord(
        db,
        id,
        facts,
        'normal',
        null,
        String(previous.id),
        reason,
        context,
      );
      await updateRoot(db, id, payload.version, recordId, context);
      const result = { inspectionId: id, recordId, version: payload.version + 1 };
      await audit(
        db,
        context,
        'process-inspection.correct',
        id,
        mapProcessInspectionRecord(previous),
        { ...result, ...facts, reason, acceptedQuantity: Number(root.accepted_quantity) },
      );
      return result;
    });
  }
  reverse(
    id: string,
    payload: ReverseProcessInspectionPayload,
    context: CommandContext,
  ): Promise<ProcessInspectionCommandResult> {
    const reason = requireProcessInspectionText(payload.reason, '冲销原因');
    return withTransaction(this.pool, async (db) => {
      requireActor(context);
      const root = await this.prepareRoot(db, id, payload.version, 'reverse');
      const previous = await currentRecord(db, root);
      if (Number(root.accepted_quantity) !== 0)
        throw new QualityCommandError('INVALID_STATE', '该专检单已有产线处理，不能整单冲销');
      const recordId = await insertRecord(
        db,
        id,
        mapProcessInspectionRecord(previous),
        'reversal',
        String(previous.id),
        null,
        reason,
        context,
      );
      await updateRoot(db, id, payload.version, null, context);
      const result = { inspectionId: id, recordId, version: payload.version + 1 };
      await audit(
        db,
        context,
        'process-inspection.reverse',
        id,
        mapProcessInspectionRecord(previous),
        { ...result, reason },
      );
      return result;
    });
  }
  accept(
    input: AcceptProcessInspectionInput,
    context: CommandContext,
  ): Promise<AcceptedProcessInspection> {
    requireActor(context);
    if (
      !Number.isInteger(input.quantity) ||
      input.quantity < 1 ||
      input.quantity > PRODUCTION_OUTPUT_QUANTITY_MAX
    )
      throw new QualityCommandError('INVALID_INPUT', '处理数量必须为有效正整数');
    return withActiveConnection(this.pool, async (db) => {
      if (!('release' in db))
        throw new QualityCommandError('INVALID_STATE', '专检处理必须位于来源生产事务中');
      const root = await lockRoot(db, input.inspectionId, input.version);
      if (
        String(root.production_batch_id) !== input.batchId ||
        String(root.batch_step_record_id) !== input.stepId
      )
        throw new QualityCommandError('INVALID_INPUT', '专检与当前生产任务工序不一致');
      const current = await currentRecord(db, root);
      if (String(current.id) !== input.recordId)
        throw new QualityCommandError('CONCURRENT_MODIFICATION', '专检结果已更正，请刷新后处理');
      const acceptedQuantity = Number(root.accepted_quantity) + input.quantity;
      if (acceptedQuantity > Number(current.unqualified_quantity))
        throw new QualityCommandError('INVALID_STATE', '处理数量超过当前专检待处理不合格数量');
      const [updated] = await db.execute<ResultSetHeader>(
        'UPDATE quality_process_inspection SET accepted_quantity=?,version=version+1,updated_by=? WHERE id=? AND version=?',
        [acceptedQuantity, context.actorId, input.inspectionId, input.version],
      );
      if (updated.affectedRows !== 1)
        throw new QualityCommandError('CONCURRENT_MODIFICATION', '专检单已变化，请刷新');
      const result = {
        inspectionId: input.inspectionId,
        recordId: input.recordId,
        batchId: input.batchId,
        stepId: input.stepId,
        acceptedQuantity,
        version: input.version + 1,
      };
      await audit(
        db,
        context,
        'process-inspection.accept',
        input.inspectionId,
        { acceptedQuantity: Number(root.accepted_quantity), version: root.version },
        { ...result, quantity: input.quantity },
      );
      return result;
    });
  }
  private async prepareRoot(
    db: PoolConnection,
    id: string,
    version: number,
    intent: 'correct' | 'reverse',
  ): Promise<ProcessInspectionRootRow> {
    // 身份只读后由 Production 锁根；不能先锁 Quality 再反向获取来源锁。
    const source = await this.getSource(id);
    if (!source) throw new QualityCommandError('NOT_FOUND', '工序专检单不存在');
    await this.sources.require().prepare(source.batchId, source.stepId, intent);
    return lockRoot(db, id, version);
  }
}
function requireActor(context: CommandContext): void {
  if (!context.actorId) throw new QualityCommandError('INVALID_INPUT', '缺少当前操作人');
}
async function lockRoot(
  db: PoolConnection,
  id: string,
  version: number,
): Promise<ProcessInspectionRootRow> {
  const [[row]] = await db.query<ProcessInspectionRootRow[]>(
    `SELECT ${PROCESS_INSPECTION_ROOT_COLUMNS} FROM quality_process_inspection WHERE id=? FOR UPDATE`,
    [id],
  );
  if (!row) throw new QualityCommandError('NOT_FOUND', '工序专检单不存在');
  if (row.version !== version)
    throw new QualityCommandError('CONCURRENT_MODIFICATION', '专检单已更正或被产线处理，请刷新');
  return row;
}
async function currentRecord(
  db: PoolConnection,
  root: ProcessInspectionRootRow,
): Promise<ProcessInspectionRecordRow> {
  if (root.current_record_id === null)
    throw new QualityCommandError('INVALID_STATE', '专检单已冲销');
  const [[row]] = await db.query<ProcessInspectionRecordRow[]>(
    `SELECT ${PROCESS_INSPECTION_RECORD_COLUMNS} FROM quality_process_inspection_record WHERE id=? AND inspection_id=? FOR SHARE`,
    [root.current_record_id, root.id],
  );
  if (!row || row.record_type !== 'normal')
    throw new QualityCommandError('INVALID_STATE', '专检当前结果无效');
  const [reversals] = await db.query<RowDataPacket[]>(
    'SELECT id FROM quality_process_inspection_record WHERE reversal_of_record_id=? FOR SHARE',
    [row.id],
  );
  if (reversals.length)
    throw new QualityCommandError('CONCURRENT_MODIFICATION', '专检当前结果已被冲销');
  return row;
}
async function insertRecord(
  db: PoolConnection,
  id: string,
  payload: RecordProcessInspectionPayload,
  type: ProcessInspectionRecord['recordType'],
  reversalId: string | null,
  replacesId: string | null,
  reason: string | null,
  context: CommandContext,
): Promise<string> {
  const [created] = await db.execute<ResultSetHeader>(
    `INSERT INTO quality_process_inspection_record(inspection_id,record_type,inspection_method,qualified_quantity,unqualified_quantity,scope_note,inspected_at,result_note,evidence_reference,reversal_of_record_id,replaces_record_id,reason,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      type,
      payload.inspectionMethod,
      payload.qualifiedQuantity,
      payload.unqualifiedQuantity,
      payload.scopeNote,
      new Date(payload.inspectedAt),
      payload.resultNote,
      payload.evidenceReference,
      reversalId,
      replacesId,
      reason,
      context.actorId,
    ],
  );
  return String(created.insertId);
}
async function updateRoot(
  db: PoolConnection,
  id: string,
  version: number,
  recordId: string | null,
  context: CommandContext,
): Promise<void> {
  const [updated] = await db.execute<ResultSetHeader>(
    'UPDATE quality_process_inspection SET current_record_id=?,updated_by=?,version=version+1 WHERE id=? AND version=?',
    [recordId, context.actorId, id, version],
  );
  if (updated.affectedRows !== 1)
    throw new QualityCommandError('CONCURRENT_MODIFICATION', '专检单已变化，请刷新');
}
function audit(
  db: PoolConnection,
  context: CommandContext,
  action: string,
  id: string,
  before: object | null,
  after: object,
): Promise<void> {
  return writeTransactionalAudit(db, {
    logType: 'business',
    module: 'quality',
    action,
    userId: context.actorId,
    targetId: id,
    targetType: 'process-inspection',
    result: 'success',
    beforeData: before,
    afterData: after,
    ip: context.ip,
    requestId: context.requestId,
    userAgent: context.userAgent,
  });
}
