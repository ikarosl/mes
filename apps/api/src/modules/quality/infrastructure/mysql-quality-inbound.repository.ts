import { Inject, Injectable } from '@nestjs/common';
import type {
  PageQuery,
  PageResult,
  QualityIncomingInspectionReportItem,
  QualityIncomingInspectionReportSummary,
} from '@company/contracts';
import { withActiveConnection } from '@company/database';
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
  correction.id corrected_by_record_id,report.inspected_at,report.result_note,report.created_by,report.created_at`;
const REPORT_FROM = `FROM quality_incoming_inspection_report report
  LEFT JOIN quality_incoming_inspection_report correction ON correction.previous_record_id=report.id`;
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
      if (normalized.previousRecordId !== null) {
        const [[previous]] = await db.query<(RowDataPacket & { receipt_line_id: string })[]>(
          'SELECT receipt_line_id FROM quality_incoming_inspection_report WHERE id=? FOR UPDATE',
          [normalized.previousRecordId],
        );
        if (!previous || String(previous.receipt_line_id) !== normalized.source.receiptLineId) {
          throw new QualityCommandError('INVALID_INPUT', '原检验报告与本次到货明细不一致');
        }
        const [[correction]] = await db.query<RowDataPacket[]>(
          'SELECT id FROM quality_incoming_inspection_report WHERE previous_record_id=? FOR SHARE',
          [normalized.previousRecordId],
        );
        if (correction) {
          throw new QualityCommandError(
            'CONCURRENT_MODIFICATION',
            '原报告已有更正记录，请核对后更正最新记录',
          );
        }
      }
      const reportNo = await allocateBusinessNumber(db, 'incoming_inspection_report');
      const source = normalized.source;
      const [insert] = await db.execute<ResultSetHeader>(
        `INSERT INTO quality_incoming_inspection_report (
          report_no,receipt_line_id,receipt_id,receipt_no_snapshot,purchase_no_snapshot,
          item_code_snapshot,item_name_snapshot,material_variant_code_snapshot,unit_snapshot,
          supplier_name_snapshot,specification,batch_no,expires_on,inspection_method,
          qualified_quantity,unqualified_quantity,inspected_at,result_note,evidence_reference,
          inspection_details,previous_record_id,correction_reason,created_by
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
          source.specification,
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
  ): Promise<PageResult<QualityIncomingInspectionReportSummary>> {
    requireInspectionIdentifier(receiptLineId, '到货明细');
    const { page = 1, pageSize = 10 } = query;
    return withActiveConnection(this.pool, async (db) => {
      const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
        'SELECT COUNT(*) total FROM quality_incoming_inspection_report WHERE receipt_line_id=?',
        [receiptLineId],
      );
      const [rows] = await db.query<InspectionReportSummaryRow[]>(
        `SELECT ${SUMMARY_COLUMNS} ${REPORT_FROM}
         WHERE report.receipt_line_id=? ORDER BY report.created_at DESC,report.id DESC LIMIT ? OFFSET ?`,
        [receiptLineId, pageSize, (page - 1) * pageSize],
      );
      return {
        items: rows.map(mapInspectionReportSummary),
        total: Number(count?.total ?? 0),
        page,
        pageSize,
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
    `SELECT ${REPORT_COLUMNS} ${REPORT_FROM} WHERE report.id=?`,
    [id],
  );
  return row ? mapInspectionReport(row) : null;
}
