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
import {
  requireQualityText,
  requireQuantity,
  resolveInboundInspection,
} from '../domain/inbound-inspection.policy.js';
import { QualityCommandError } from '../quality-command.error.js';
import {
  mapCase,
  mapInspection,
  type CaseRow,
  type InspectionRow,
} from './mysql-quality-inbound.mapper.js';

type Db = Pool | PoolConnection;
const numericIds = (ids: string[]) =>
  [...new Set(ids)].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));

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
    requireQuantity(input.coveredQuantity, '覆盖数量');
    const reason = requireQualityText(input.reason, '检验原因');
    if (
      !QUALITY_INBOUND_CASE_TYPES.includes(input.caseType) ||
      (input.coveredQuantity === 0 &&
        (input.caseType !== 'receipt_correction' || input.targetScopeId !== null)) ||
      (input.coveredQuantity > 0 && !input.targetScopeId) ||
      (!input.sourceScopeId && input.caseType !== 'receipt_correction')
    ) {
      throw new QualityCommandError('INVALID_INPUT', '检验类型、数量和来源范围不一致');
    }
    return this.inTransaction(async (db) => {
      const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO quality_inbound_case(receipt_line_id,receipt_revision_id,source_scope_id,target_scope_id,
          case_type,covered_quantity,reason,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?)`,
        [
          input.receiptLineId,
          input.receiptRevisionId,
          input.sourceScopeId,
          input.targetScopeId,
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
        throw new QualityCommandError('INVALID_STATE', '检验已完成或已由更正替代');
      if (
        String(row.receipt_line_id) !== input.receiptLineId ||
        String(row.receipt_revision_id) !== input.receiptRevisionId ||
        (row.target_scope_id === null ? null : String(row.target_scope_id)) !== input.targetScopeId
      ) {
        throw new QualityCommandError('INVALID_INPUT', '检验引用与已锁定到货范围不一致');
      }
      const split = resolveInboundInspection(Number(row.covered_quantity), row.case_type, input);
      const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO quality_inbound_inspection(case_id,receipt_line_id,receipt_revision_id,covered_quantity,
          inspection_method,qualified_quantity,unqualified_quantity,sample_quantity,sample_unqualified_quantity,
          removed_defect_quantity,inbound_approved,disposition,approved_quantity,quality_return_quantity,
          undetermined_quantity,remark,evidence,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          input.caseId,
          input.receiptLineId,
          input.receiptRevisionId,
          row.covered_quantity,
          input.inspectionMethod,
          input.qualifiedQuantity,
          input.unqualifiedQuantity,
          input.sampleQuantity,
          input.sampleUnqualifiedQuantity,
          input.removedDefectQuantity,
          input.inboundApproved ? 1 : 0,
          input.disposition,
          split.approvedQuantity,
          split.qualityReturnQuantity,
          split.undeterminedQuantity,
          input.remark.trim(),
          input.evidence.trim(),
          context.actorId,
        ],
      );
      await db.execute(
        `UPDATE quality_inbound_case SET status='completed',completed_by=?,completed_at=NOW(),updated_by=?,version=version+1 WHERE id=?`,
        [context.actorId, context.actorId, input.caseId],
      );
      const [[inspection]] = await db.query<InspectionRow[]>(
        'SELECT * FROM quality_inbound_inspection WHERE id=?',
        [result.insertId],
      );
      const after = mapInspection(inspection!);
      await audit(db, context, 'inbound-case.complete', input.caseId, mapCase(row), after);
      return after;
    });
  }

  supersedeCases(
    input: { caseIds: string[]; receiptLineId: string; receiptRevisionId: string },
    context: CommandContext,
  ): Promise<void> {
    return this.inTransaction(async (db) => {
      for (const id of numericIds(input.caseIds)) {
        const row = await this.requireCase(db, id, 'FOR UPDATE');
        if (row.status !== 'reviewing' || String(row.receipt_line_id) !== input.receiptLineId) {
          throw new QualityCommandError('INVALID_STATE', '仅能替代本次实收更正影响的未完成检验');
        }
        await db.execute(
          `UPDATE quality_inbound_case SET status='superseded',superseded_by_receipt_revision_id=?,updated_by=?,version=version+1 WHERE id=?`,
          [input.receiptRevisionId, context.actorId, id],
        );
        await audit(db, context, 'inbound-case.supersede', id, mapCase(row), {
          receiptRevisionId: input.receiptRevisionId,
        });
      }
    });
  }

  requireReleaseBasis(input: QualityInboundReleaseBasis): Promise<QualityInboundInspectionItem> {
    return this.inTransaction(async (db) => {
      const row = await this.requireCase(db, input.caseId, 'FOR SHARE');
      const [[inspection]] = await db.query<InspectionRow[]>(
        'SELECT * FROM quality_inbound_inspection WHERE id=? FOR SHARE',
        [input.inspectionId],
      );
      if (
        row.status !== 'completed' ||
        !inspection ||
        String(inspection.case_id) !== input.caseId ||
        String(inspection.receipt_line_id) !== input.receiptLineId ||
        String(inspection.receipt_revision_id) !== input.receiptRevisionId ||
        String(row.receipt_line_id) !== input.receiptLineId ||
        String(row.receipt_revision_id) !== input.receiptRevisionId ||
        inspection.inbound_approved !== 1 ||
        inspection.disposition !== 'release' ||
        Number(inspection.approved_quantity) <= 0
      ) {
        throw new QualityCommandError('INVALID_STATE', '当前范围缺少明确有效的质检放行依据');
      }
      return mapInspection(inspection);
    });
  }

  listCases(query: QualityInboundCaseQuery): Promise<PageResult<QualityInboundCaseItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const clauses: string[] = [];
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
        `SELECT COUNT(*) total FROM quality_inbound_case ${where}`,
        parameters,
      );
      const [rows] = await db.query<CaseRow[]>(
        `SELECT * FROM quality_inbound_case ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
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

  getCase(caseId: string): Promise<QualityInboundCaseItem | null> {
    return withActiveConnection(this.pool, async (db) => {
      const [rows] = await db.query<CaseRow[]>(
        `SELECT * FROM quality_inbound_case WHERE id=?${db === this.pool ? '' : ' FOR SHARE'}`,
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
        `SELECT * FROM quality_inbound_case WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`,
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
      `SELECT * FROM quality_inbound_inspection WHERE case_id IN (${rows.map(() => '?').join(',')}) ORDER BY id${current ? ' FOR SHARE' : ''}`,
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
        `SELECT * FROM quality_inbound_case WHERE receipt_line_id IN (${ids.map(() => '?').join(',')}) AND status='reviewing' ORDER BY id FOR SHARE`,
        ids,
      );
      return rows.map((row) => mapCase(row));
    });
  }
  private async requireCase(db: Db, id: string, lock = ''): Promise<CaseRow> {
    const [[row]] = await db.query<CaseRow[]>(
      `SELECT * FROM quality_inbound_case WHERE id=? ${lock}`,
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
