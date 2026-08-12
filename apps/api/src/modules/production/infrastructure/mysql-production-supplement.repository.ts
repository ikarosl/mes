import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  ApproveScrapSupplementPayload,
  ApproveScrapSupplementResult,
  BatchStepAbnormalDispositionItem,
  ProductionMaterialSupplementDetailItem,
  ProductionSupplementCandidateItem,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/beijing-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionSupplementRepository } from '../application/ports/production-supplement.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { findBatch } from './mysql-production.shared.js';

type SourceRow = RowDataPacket & {
  id: number;
  disposition_no: string;
  production_batch_id: number;
  batch_step_record_id: number;
  batch_step_report_id: number;
  review_status: BatchStepAbnormalDispositionItem['reviewStatus'];
  disposition_type: BatchStepAbnormalDispositionItem['dispositionType'];
  remark: string | null;
  version: number;
  created_at: Date;
  report_type: 'normal' | 'reversal';
  abnormal_quantity: string;
  unit_snapshot: string;
  is_effective: number;
  route_step_id: number;
};

type CandidateRow = RowDataPacket & {
  id: number;
  production_batch_id: number;
  product_material_id: number;
  item_id: number;
  quantity_per_unit_snapshot: string;
  unit_snapshot: string;
  is_key_material_snapshot: number;
  need_batch_record_snapshot: number;
  planned_output_quantity_snapshot: string;
  need_number: string;
};

@Injectable()
export class MysqlProductionSupplementRepository extends ProductionSupplementRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  async getCandidateContext(dispositionId: string): Promise<{
    routeStepId: string;
    candidates: ProductionSupplementCandidateItem[];
  }> {
    const source = await selectSource(this.pool, dispositionId);
    if (source.review_status !== 'pending_review')
      throw new ProductionDomainError('INVALID_STATE', '仅待处置异常可以选择报废补料');
    const rows = await selectCandidates(this.pool, String(source.production_batch_id));
    return { routeStepId: String(source.route_step_id), candidates: rows.map(mapCandidate) };
  }

  approve(
    dispositionId: string,
    payload: ApproveScrapSupplementPayload,
    context: CommandContext,
  ): Promise<ApproveScrapSupplementResult> {
    return withTransaction(this.pool, async (connection) => {
      const actorId = requireActor(context);
      const sourceIdentity = await selectSource(connection, dispositionId);
      const batch = await findBatch(connection, String(sourceIdentity.production_batch_id), true);
      if (batch.status !== 'doing')
        throw new ProductionDomainError('INVALID_STATE', '仅生产执行中的异常可以批准报废补料');
      await connection.query(
        'SELECT id FROM batch_step_records WHERE production_batch_id=? ORDER BY step_order_snapshot,id FOR UPDATE',
        [sourceIdentity.production_batch_id],
      );
      const source = await selectSource(connection, dispositionId, true);
      if (source.review_status !== 'pending_review')
        throw new ProductionDomainError('INVALID_STATE', '仅待处置异常可以批准报废补料');
      if (source.version !== payload.version)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '异常处置单已变化，请刷新后重试',
        );
      if (
        source.report_type !== 'normal' ||
        !source.is_effective ||
        Number(source.abnormal_quantity) <= 0
      )
        throw new ProductionDomainError('INVALID_STATE', '来源异常报工已失效或没有异常数量');
      const ids = payload.details.map((line) => line.originalDemandId);
      if (new Set(ids).size !== ids.length)
        throw new ProductionDomainError('INVALID_INPUT', '同一原始需求只能提交一条补料明细');
      const candidates = await selectCandidates(
        connection,
        String(source.production_batch_id),
        ids,
        true,
      );
      if (candidates.length !== ids.length)
        throw new ProductionDomainError('INVALID_INPUT', '补料物料不属于当前批次的有效正常需求');
      const byId = new Map(candidates.map((row) => [String(row.id), row]));

      const [updated] = await connection.execute<ResultSetHeader>(
        `UPDATE batch_step_abnormal_dispositions
         SET review_status='approved',disposition_type='scrap',reviewed_by=?,reviewed_at=NOW(),remark=?,version=version+1,updated_by=?
         WHERE id=? AND review_status='pending_review' AND version=?`,
        [actorId, payload.remark ?? null, actorId, dispositionId, payload.version],
      );
      if (updated.affectedRows !== 1)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '异常处置单已变化，请刷新后重试',
        );
      const [scrap] = await connection.execute<ResultSetHeader>(
        `INSERT INTO batch_step_scrap_records
         (abnormal_disposition_id,production_batch_id,batch_step_record_id,source_report_id,scrap_quantity,unit_snapshot,created_by)
         VALUES (?,?,?,?,?,?,?)`,
        [
          dispositionId,
          source.production_batch_id,
          source.batch_step_record_id,
          source.batch_step_report_id,
          source.abnormal_quantity,
          source.unit_snapshot,
          actorId,
        ],
      );
      const supplementNo = `SUP-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const [supplement] = await connection.execute<ResultSetHeader>(
        `INSERT INTO production_material_supplement
         (supplement_no,scrap_record_id,production_batch_id,batch_step_record_id,status,remark,created_by)
         VALUES (?,?,?,?,'approved',?,?)`,
        [
          supplementNo,
          scrap.insertId,
          source.production_batch_id,
          source.batch_step_record_id,
          payload.remark ?? null,
          actorId,
        ],
      );
      const details: ProductionMaterialSupplementDetailItem[] = [];
      for (const line of payload.details) {
        const original = byId.get(line.originalDemandId)!;
        const [detail] = await connection.execute<ResultSetHeader>(
          `INSERT INTO production_material_supplement_detail
           (supplement_id,production_batch_id,product_material_id,item_id,original_demand_id,supplement_quantity,unit_snapshot,created_by)
           VALUES (?,?,?,?,?,?,?,?)`,
          [
            supplement.insertId,
            source.production_batch_id,
            original.product_material_id,
            original.item_id,
            original.id,
            line.supplementQuantity,
            original.unit_snapshot,
            actorId,
          ],
        );
        const [demand] = await connection.execute<ResultSetHeader>(
          `INSERT INTO production_item_demand
           (production_batch_id,product_material_id,item_id,quantity_per_unit_snapshot,unit_snapshot,is_key_material_snapshot,need_batch_record_snapshot,planned_output_quantity_snapshot,need_number,demand_type,idempotency_key,parent_demand_id,source_supplement_detail_id,reason_type,business_status,remark,created_by,updated_by)
           VALUES (?,?,?,?,?,?,?,?,?,'scrap_supplement',?,?,?,'step_scrap','active',?,?,?)`,
          [
            source.production_batch_id,
            original.product_material_id,
            original.item_id,
            original.quantity_per_unit_snapshot,
            original.unit_snapshot,
            original.is_key_material_snapshot,
            original.need_batch_record_snapshot,
            original.planned_output_quantity_snapshot,
            line.supplementQuantity,
            `SCRAPSUP:${detail.insertId}`,
            original.id,
            detail.insertId,
            payload.remark ?? null,
            actorId,
            actorId,
          ],
        );
        details.push({
          detailId: String(detail.insertId),
          originalDemandId: String(original.id),
          demandId: String(demand.insertId),
          productMaterialId: String(original.product_material_id),
          itemId: String(original.item_id),
          itemCode: '',
          itemName: '',
          supplementQuantity: fixed(line.supplementQuantity),
          unit: original.unit_snapshot,
        });
      }
      await writeTransactionalAudit(connection, {
        logType: 'business',
        action: 'production-abnormal.approve-scrap-supplement',
        module: 'production',
        userId: context.actorId,
        targetType: 'abnormal_disposition',
        targetId: dispositionId,
        result: 'success',
        beforeData: null,
        afterData: {
          scrapRecordId: String(scrap.insertId),
          supplementId: String(supplement.insertId),
          demandIds: details.map((line) => line.demandId),
        },
        requestId: context.requestId,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      const [[created]] = await connection.query<(RowDataPacket & { created_at: Date })[]>(
        'SELECT created_at FROM production_material_supplement WHERE id=?',
        [supplement.insertId],
      );
      return {
        disposition: mapDisposition(await selectSource(connection, dispositionId)),
        scrapRecord: {
          scrapRecordId: String(scrap.insertId),
          sourceReportId: String(source.batch_step_report_id),
          scrapQuantity: source.abnormal_quantity,
          unit: source.unit_snapshot,
        },
        supplement: {
          supplementId: String(supplement.insertId),
          supplementNo,
          scrapRecordId: String(scrap.insertId),
          productionBatchId: String(source.production_batch_id),
          stepRecordId: String(source.batch_step_record_id),
          status: 'approved',
          remark: payload.remark ?? null,
          createdAt: toBeijingISOString(created!.created_at),
          details,
        },
      };
    });
  }
}

const selectSource = async (
  connection: Pool | PoolConnection,
  dispositionId: string,
  lock = false,
): Promise<SourceRow> => {
  const [rows] = await connection.query<SourceRow[]>(
    `SELECT d.id,d.disposition_no,d.production_batch_id,d.batch_step_record_id,d.batch_step_report_id,
      d.review_status,d.disposition_type,d.remark,d.version,d.created_at,r.report_type,r.abnormal_quantity,
      r.unit_snapshot,s.route_step_id,
      NOT EXISTS(SELECT 1 FROM batch_step_reports rv WHERE rv.reversal_of_report_id=r.id) is_effective
     FROM batch_step_abnormal_dispositions d JOIN batch_step_reports r ON r.id=d.batch_step_report_id
     JOIN batch_step_records s ON s.id=d.batch_step_record_id
     WHERE d.id=?${lock ? ' FOR UPDATE' : ''}`,
    [dispositionId],
  );
  if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '异常处置单不存在');
  return rows[0];
};

const selectCandidates = async (
  connection: Pool | PoolConnection,
  batchId: string,
  ids: string[] = [],
  lock = false,
): Promise<CandidateRow[]> => {
  const filter = ids.length ? ` AND id IN (${ids.map(() => '?').join(',')})` : '';
  const [rows] = await connection.query<CandidateRow[]>(
    `SELECT id,production_batch_id,product_material_id,item_id,quantity_per_unit_snapshot,unit_snapshot,
      is_key_material_snapshot,need_batch_record_snapshot,planned_output_quantity_snapshot,need_number
     FROM production_item_demand
     WHERE production_batch_id=? AND demand_type='normal' AND business_status='active'${filter}
     ORDER BY id${lock ? ' FOR UPDATE' : ''}`,
    [batchId, ...ids],
  );
  return rows;
};

const mapCandidate = (row: CandidateRow): ProductionSupplementCandidateItem => ({
  originalDemandId: String(row.id),
  productionBatchId: String(row.production_batch_id),
  productMaterialId: String(row.product_material_id),
  itemId: String(row.item_id),
  itemCode: '',
  itemName: '',
  unit: row.unit_snapshot,
  normalDemandQuantity: row.need_number,
});

const mapDisposition = (row: SourceRow): BatchStepAbnormalDispositionItem => ({
  dispositionId: String(row.id),
  dispositionNo: row.disposition_no,
  productionBatchId: String(row.production_batch_id),
  stepRecordId: String(row.batch_step_record_id),
  sourceReportId: String(row.batch_step_report_id),
  reviewStatus: row.review_status,
  dispositionType: row.disposition_type,
  remark: row.remark,
  version: row.version,
  createdAt: toBeijingISOString(row.created_at),
});

const requireActor = (context: CommandContext): string => {
  if (!context.actorId) throw new ProductionDomainError('INVALID_STATE', '缺少当前操作人');
  return context.actorId;
};

const fixed = (value: number): string => value.toFixed(4);
