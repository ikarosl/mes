import { normalizeIncomingInspectionQuantities } from '../domain/inspection-quantity.policy.js';
import { Inject, Injectable } from '@nestjs/common';
import { QUALITY_INBOUND_CASE_TYPES } from '@company/constants';
import type {
  PageResult,
  QualityInboundCaseItem,
  QualityInboundCaseQuery,
  QualityInboundInspectionItem,
} from '@company/contracts';
import { withActiveConnection } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import {
  QualityInboundCommand,
  type StartQualityInboundCaseInput,
  type CompleteQualityInboundCaseInput,
} from '../application/quality-inbound.command.js';
import type {
  QualityInboundQuery,
  QualityInboundReleaseBasis,
} from '../application/quality-inbound.query.js';
import { requireQualityText, requireQuantity } from '../domain/inbound-inspection.policy.js';
import { QualityCommandError } from '../quality-command.error.js';
import {
  mapCase,
  mapInspection,
  type CaseRow,
  type InspectionRow,
} from './mysql-quality-inbound.mapper.js';

type Db = Pool | PoolConnection;

@Injectable()
export class MysqlQualityInboundRepository
  extends QualityInboundCommand
  implements QualityInboundQuery
{
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  private inTransaction<T>(run: (db: PoolConnection) => Promise<T>): Promise<T> {
    return withActiveConnection(this.pool, async (db) => {
      if (db === this.pool || !('release' in db))
        throw new QualityCommandError('INVALID_STATE', '检验命令必须位于来源业务事务中');
      return run(db as PoolConnection);
    });
  }

  startCase(
    input: StartQualityInboundCaseInput,
    context: CommandContext,
  ): Promise<QualityInboundCaseItem> {
    requireQuantity(input.coveredQuantity, '来源申报数量');
    const reason = requireQualityText(input.reason, '检验原因');
    if (
      !QUALITY_INBOUND_CASE_TYPES.includes(input.caseType) ||
      input.coveredQuantity <= 0 ||
      !input.roundId
    ) {
      throw new QualityCommandError('INVALID_INPUT', '检验类型、申报数量和来源轮次不一致');
    }
    return this.inTransaction(async (db) => {
      const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO quality_inspection_case(receipt_line_id,receipt_revision_id,incoming_round_id,
          source_kind,case_type,declared_quantity,reason,created_by,updated_by) VALUES(?,?,?,'incoming',?,?,?,?,?)`,
        [
          input.receiptLineId,
          input.receiptRevisionId,
          input.roundId,
          input.caseType,
          input.coveredQuantity,
          reason,
          context.actorId,
          context.actorId,
        ],
      );
      const after = mapCase(await this.requireCase(db, String(result.insertId)));
      await audit(db, context, 'inbound-case.start', after.id, null, after);
      return after;
    });
  }

  completeCase(
    input: CompleteQualityInboundCaseInput,
    context: CommandContext,
  ): Promise<QualityInboundInspectionItem> {
    return this.inTransaction(async (db) => {
      const row = await this.requireCase(db, input.caseId, 'FOR UPDATE');
      if (row.version !== input.version)
        throw new QualityCommandError('CONCURRENT_MODIFICATION', '检验办理已变化，请刷新');
      if (row.status !== 'reviewing')
        throw new QualityCommandError('INVALID_STATE', '检验已完成或已因来源重办、拒收失效');
      if (
        String(row.receipt_line_id) !== input.receiptLineId ||
        String(row.receipt_revision_id) !== input.receiptRevisionId ||
        String(row.incoming_round_id) !== input.roundId
      ) {
        throw new QualityCommandError('INVALID_INPUT', '检验引用与已锁定到货范围不一致');
      }
      const quantities = normalizeIncomingInspectionQuantities(input);
      const inspectedAt = new Date(input.inspectedAt);
      if (!Number.isFinite(inspectedAt.getTime()))
        throw new QualityCommandError('INVALID_INPUT', '检验时间无效');
      const remark = requireQualityText(input.remark, '检验说明');
      const evidence = requireQualityText(input.evidence, '检验凭据');
      if (input.previousRecordId) {
        const [[previous]] = await db.query<InspectionRow[]>(
          'SELECT * FROM quality_inspection_record WHERE id=? AND receipt_line_id=? FOR SHARE',
          [input.previousRecordId, input.receiptLineId],
        );
        if (!previous) throw new QualityCommandError('INVALID_INPUT', '前驱检验记录与到货不匹配');
      }
      const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO quality_inspection_record(case_id,receipt_line_id,receipt_revision_id,covered_quantity,
          inspection_method,qualified_quantity,unqualified_quantity,release_decision,previous_record_id,
          inspected_at,result_note,evidence_reference,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          input.caseId,
          input.receiptLineId,
          input.receiptRevisionId,
          null,
          quantities.inspectionMethod,
          quantities.qualifiedQuantity,
          quantities.unqualifiedQuantity,
          quantities.releaseDecision,
          input.previousRecordId ?? null,
          inspectedAt,
          remark,
          evidence,
          context.actorId,
        ],
      );
      await db.execute(
        `UPDATE quality_inspection_case SET status='completed',completed_by=?,completed_at=NOW(),updated_by=?,version=version+1 WHERE id=?`,
        [context.actorId, context.actorId, input.caseId],
      );
      const [[inspection]] = await db.query<InspectionRow[]>(
        'SELECT * FROM quality_inspection_record WHERE id=?',
        [result.insertId],
      );
      const after = mapInspection(inspection!);
      await audit(db, context, 'inbound-case.complete', input.caseId, mapCase(row), after);
      return after;
    });
  }

  supersedeCases(
    input: { receiptLineId: string; roundId: string; supersededByRoundId: string; reason: string },
    context: CommandContext,
  ): Promise<void> {
    return this.inTransaction(async (db) => {
      const [rows] = await db.query<CaseRow[]>(
        `SELECT * FROM quality_inspection_case WHERE receipt_line_id=? AND incoming_round_id=? AND status='reviewing' ORDER BY id FOR UPDATE`,
        [input.receiptLineId, input.roundId],
      );
      for (const row of rows) {
        const id = String(row.id);
        if (row.status !== 'reviewing' || String(row.receipt_line_id) !== input.receiptLineId) {
          throw new QualityCommandError('INVALID_STATE', '仅能使本到货尚未完成的检验办理失效');
        }
        await db.execute(
          `UPDATE quality_inspection_case SET status='superseded',superseded_by_round_id=?,superseded_reason=?,updated_by=?,version=version+1 WHERE id=?`,
          [
            input.supersededByRoundId,
            requireQualityText(input.reason, '失效原因'),
            context.actorId,
            id,
          ],
        );
        await audit(db, context, 'inbound-case.supersede', id, mapCase(row), {
          supersededByRoundId: input.supersededByRoundId,
          reason: input.reason,
        });
      }
    });
  }

  requireReleaseBasis(input: QualityInboundReleaseBasis): Promise<QualityInboundInspectionItem> {
    return this.inTransaction(async (db) => {
      const row = await this.requireCase(db, input.caseId, 'FOR SHARE');
      const [[inspection]] = await db.query<InspectionRow[]>(
        'SELECT * FROM quality_inspection_record WHERE id=? FOR SHARE',
        [input.inspectionId],
      );
      if (
        row.status !== 'completed' ||
        !inspection ||
        String(inspection.case_id) !== input.caseId ||
        String(inspection.receipt_line_id) !== input.receiptLineId ||
        String(inspection.receipt_revision_id) !== String(row.receipt_revision_id) ||
        String(row.receipt_line_id) !== input.receiptLineId ||
        inspection.release_decision !== 'released'
      ) {
        throw new QualityCommandError('INVALID_STATE', '当前范围缺少明确有效的质检放行依据');
      }
      return mapInspection(inspection);
    });
  }

  listCases(query: QualityInboundCaseQuery): Promise<PageResult<QualityInboundCaseItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const clauses: string[] = ["source_kind='incoming'"];
    const parameters: Array<string | number> = [];
    if (query.status) {
      clauses.push('status=?');
      parameters.push(query.status);
    }
    if (query.caseType) {
      clauses.push('case_type=?');
      parameters.push(query.caseType);
    }
    if (query.receiptLineIds) {
      if (!query.receiptLineIds.length)
        return Promise.resolve({ items: [], total: 0, page, pageSize });
      clauses.push(`receipt_line_id IN (${query.receiptLineIds.map(() => '?').join(',')})`);
      parameters.push(...query.receiptLineIds);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return withActiveConnection(this.pool, async (db) => {
      const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
        `SELECT COUNT(*) total FROM quality_inspection_case ${where}`,
        parameters,
      );
      const [rows] = await db.query<CaseRow[]>(
        `SELECT * FROM quality_inspection_case ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...parameters, pageSize, (page - 1) * pageSize],
      );
      return {
        items: await this.attachInspections(db, rows),
        total: Number(count?.total ?? 0),
        page,
        pageSize,
      };
    });
  }

  async getCaseByInspection(inspectionId: string) {
    return withActiveConnection(this.pool, async (db) => {
      const [[record]] = await db.query<(RowDataPacket & { case_id: number })[]>(
        'SELECT case_id FROM quality_inspection_record WHERE id=? AND receipt_line_id IS NOT NULL',
        [inspectionId],
      );
      return record ? this.getCase(String(record.case_id)) : null;
    });
  }
  getCase(caseId: string): Promise<QualityInboundCaseItem | null> {
    return withActiveConnection(this.pool, async (db) => {
      const [rows] = await db.query<CaseRow[]>(
        `SELECT * FROM quality_inspection_case WHERE source_kind='incoming' AND id=?${db === this.pool ? '' : ' FOR SHARE'}`,
        [caseId],
      );
      return (await this.attachInspections(db, rows, db !== this.pool))[0] ?? null;
    });
  }
  getCases(caseIds: string[]): Promise<QualityInboundCaseItem[]> {
    const ids = [...new Set(caseIds)];
    if (!ids.length) return Promise.resolve([]);
    if (ids.length > 100)
      throw new QualityCommandError('INVALID_INPUT', '一次最多读取 100 个检验办理');
    return withActiveConnection(this.pool, async (db) => {
      const [rows] = await db.query<CaseRow[]>(
        `SELECT * FROM quality_inspection_case WHERE source_kind='incoming' AND id IN (${ids.map(() => '?').join(',')}) ORDER BY id`,
        ids,
      );
      return this.attachInspections(db, rows);
    });
  }
  private async attachInspections(
    db: Db,
    rows: CaseRow[],
    current = false,
  ): Promise<QualityInboundCaseItem[]> {
    if (!rows.length) return [];
    const [facts] = await db.query<InspectionRow[]>(
      `SELECT * FROM quality_inspection_record WHERE case_id IN (${rows.map(() => '?').join(',')}) ORDER BY id${current ? ' FOR SHARE' : ''}`,
      rows.map((r) => r.id),
    );
    const byCase = new Map(facts.map((r) => [String(r.case_id), mapInspection(r)]));
    return rows.map((r) => mapCase(r, byCase.get(String(r.id)) ?? null));
  }
  listOpenCases(input: { receiptLineIds: string[] }): Promise<QualityInboundCaseItem[]> {
    const ids = [...new Set(input.receiptLineIds)];
    if (ids.length > 100)
      throw new QualityCommandError('INVALID_INPUT', '一次最多核对 100 个到货明细');
    return this.inTransaction(async (db) => {
      if (!ids.length) return [];
      const [rows] = await db.query<CaseRow[]>(
        `SELECT * FROM quality_inspection_case WHERE receipt_line_id IN (${ids.map(() => '?').join(',')}) AND status='reviewing' ORDER BY id FOR SHARE`,
        ids,
      );
      return rows.map((row) => mapCase(row));
    });
  }
  private async requireCase(db: Db, id: string, lock = ''): Promise<CaseRow> {
    const [[row]] = await db.query<CaseRow[]>(
      `SELECT * FROM quality_inspection_case WHERE source_kind='incoming' AND id=? ${lock}`,
      [id],
    );
    if (!row) throw new QualityCommandError('NOT_FOUND', '检验办理不存在');
    return row;
  }
}

async function audit(
  db: PoolConnection,
  context: CommandContext,
  action: string,
  id: string,
  beforeData: unknown,
  afterData: unknown,
) {
  await writeTransactionalAudit(db, {
    logType: 'business',
    module: 'quality',
    action,
    userId: context.actorId,
    targetId: id,
    targetType: 'quality-inbound-case',
    result: 'success',
    beforeData,
    afterData,
    ip: context.ip,
    requestId: context.requestId,
    userAgent: context.userAgent,
  });
}
