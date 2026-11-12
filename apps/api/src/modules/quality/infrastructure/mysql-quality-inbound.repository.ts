import { Inject, Injectable } from '@nestjs/common';
import type {
  PageQuery,
  QualityIncomingInspectionReportItem,
  QualityIncomingInspectionReportPage,
} from '@company/contracts';
import { withActiveConnection, withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { allocateBusinessNumber } from '../../../infrastructure/numbering/mysql-business-number.js';
import {
  QualityInboundCommand,
  type RecordIncomingInspectionReportInput,
} from '../application/quality-inbound.command.js';
import type { QualityInboundQuery } from '../application/quality-inbound.query.js';
import {
  normalizeIncomingInspectionReport,
  requireInspectionIdentifier,
} from '../domain/incoming-inspection-report.policy.js';
import { QualityCommandError } from '../quality-command.error.js';
import {
  mapInspectionReport,
  mapInspectionReportSummary,
  type InspectionReportRow,
  type InspectionReportSummaryRow,
} from './mysql-quality-inbound.mapper.js';

const SUMMARY_COLUMNS = `report.id,report.report_no,report.receipt_line_id,report.inspection_method,
  report.qualified_quantity,report.unqualified_quantity,report.previous_record_id,
  report.inspected_at,report.result_note,report.created_by,report.created_at`;
const REPORT_COLUMNS = `${SUMMARY_COLUMNS},report.receipt_id,report.receipt_no_snapshot,
  report.purchase_no_snapshot,report.item_code_snapshot,report.item_name_snapshot,
  report.material_variant_code_snapshot,report.unit_snapshot,report.supplier_name_snapshot,
  report.specification,report.batch_no,report.expires_on,report.evidence_reference,
  report.correction_reason,report.inspection_details`;

@Injectable()
export class MysqlQualityInboundRepository
  extends QualityInboundCommand
  implements QualityInboundQuery
{
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  recordIncomingInspectionReport(
    input: RecordIncomingInspectionReportInput,
    context: CommandContext,
  ): Promise<QualityIncomingInspectionReportItem> {
    const normalized = normalizeIncomingInspectionReport(input.source, input.report);
    if (context.actorId === null)
      throw new QualityCommandError('INVALID_STATE', '检验报告须由已认证人员登记');
    return this.inTransaction(async (db) => {
      // A locking read sees the committed head after waiting for Procurement's source lock.
      const [[current]] = await db.query<(RowDataPacket & { id: string })[]>(
        `SELECT id FROM quality_incoming_inspection_report WHERE receipt_line_id=?
         ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE`,
        [normalized.source.receiptLineId],
      );
      if (!current && normalized.previousRecordId !== null) {
        throw new QualityCommandError('INVALID_INPUT', '当前到货明细尚无检验报告，请先登记报告');
      }
      if (current && normalized.previousRecordId !== String(current.id)) {
        throw new QualityCommandError(
          'CONCURRENT_MODIFICATION',
          '该到货明细的检验报告已更新，请刷新后修订当前报告',
        );
      }
      const reportNo = await allocateBusinessNumber(db, 'incoming_inspection_report');
      const source = normalized.source;
      const [insert] = await db.execute<ResultSetHeader>(
        `INSERT INTO quality_incoming_inspection_report (
          report_no,receipt_line_id,receipt_id,receipt_no_snapshot,purchase_no_snapshot,
          item_code_snapshot,item_name_snapshot,material_variant_code_snapshot,unit_snapshot,
          supplier_name_snapshot,batch_no,expires_on,inspection_method,
          qualified_quantity,unqualified_quantity,inspected_at,result_note,evidence_reference,
          inspection_details,previous_record_id,correction_reason,created_by
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          reportNo,
          source.receiptLineId,
          source.receiptId,
          source.receiptNo,
          source.purchaseNo,
          source.itemCode,
          source.itemName,
          source.materialVariantCode,
          source.unit,
          source.supplierName,
          source.batchNo,
          normalized.expiresOn,
          normalized.inspectionMethod,
          normalized.qualifiedQuantity,
          normalized.unqualifiedQuantity,
          new Date(normalized.inspectedAt),
          normalized.remark,
          normalized.evidence,
          JSON.stringify(normalized.inspectionDetails),
          normalized.previousRecordId,
          normalized.correctionReason,
          context.actorId,
        ],
      );
      const report = await readReport(db, String(insert.insertId));
      if (!report) throw new Error('新建检验报告无法读取');
      await writeTransactionalAudit(db, {
        logType: 'business',
        module: 'quality',
        action:
          normalized.previousRecordId === null
            ? 'incoming-inspection-report.record'
            : 'incoming-inspection-report.correct',
        userId: context.actorId,
        targetId: report.id,
        targetType: 'incoming-inspection-report',
        result: 'success',
        afterData: {
          id: report.id,
          reportNo,
          receiptLineId: source.receiptLineId,
          inspectionMethod: report.inspectionMethod,
          qualifiedQuantity: report.qualifiedQuantity,
          unqualifiedQuantity: report.unqualifiedQuantity,
          inspectedAt: report.inspectedAt,
          previousRecordId: report.previousRecordId,
        },
        ip: context.ip,
        requestId: context.requestId,
        userAgent: context.userAgent,
      });
      return report;
    });
  }

  listReports(
    receiptLineId: string,
    query: PageQuery,
  ): Promise<QualityIncomingInspectionReportPage> {
    requireInspectionIdentifier(receiptLineId, '到货明细');
    const { page = 1, pageSize = 10 } = query;
    // The current report identity and history page must share the same read snapshot.
    return withTransaction(this.pool, async (db) => {
      const [[summary]] = await db.query<
        (RowDataPacket & { total: number; current_report_id: string | null })[]
      >(
        `SELECT COUNT(*) total,
           (SELECT id FROM quality_incoming_inspection_report WHERE receipt_line_id=?
            ORDER BY created_at DESC,id DESC LIMIT 1) current_report_id
         FROM quality_incoming_inspection_report WHERE receipt_line_id=?`,
        [receiptLineId, receiptLineId],
      );
      const [rows] = await db.query<InspectionReportSummaryRow[]>(
        `SELECT ${SUMMARY_COLUMNS} FROM quality_incoming_inspection_report report
         WHERE report.receipt_line_id=? ORDER BY report.created_at DESC,report.id DESC LIMIT ? OFFSET ?`,
        [receiptLineId, pageSize, (page - 1) * pageSize],
      );
      return {
        items: rows.map(mapInspectionReportSummary),
        total: Number(summary?.total ?? 0),
        page,
        pageSize,
        currentReportId:
          summary?.current_report_id == null ? null : String(summary.current_report_id),
      };
    });
  }

  getReport(reportId: string): Promise<QualityIncomingInspectionReportItem | null> {
    requireInspectionIdentifier(reportId, '检验报告');
    return withActiveConnection(this.pool, (db) => readReport(db, reportId));
  }

  private inTransaction<T>(run: (db: PoolConnection) => Promise<T>): Promise<T> {
    return withActiveConnection(this.pool, (db) => {
      if (db === this.pool || !('release' in db)) {
        throw new QualityCommandError('INVALID_STATE', '检验命令必须位于来源业务事务中');
      }
      return run(db as PoolConnection);
    });
  }
}

async function readReport(
  db: Pool | PoolConnection,
  id: string,
): Promise<QualityIncomingInspectionReportItem | null> {
  const [[row]] = await db.query<InspectionReportRow[]>(
    `SELECT ${REPORT_COLUMNS} FROM quality_incoming_inspection_report report WHERE report.id=?`,
    [id],
  );
  return row ? mapInspectionReport(row) : null;
}
