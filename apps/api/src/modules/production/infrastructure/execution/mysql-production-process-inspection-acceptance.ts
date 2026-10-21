import type { Pool, ResultSetHeader } from 'mysql2/promise';
import { withTransaction } from '@company/database';
import type {
  AcceptProcessInspectionPayload,
  BatchStepAbnormalDispositionItem,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { allocateBusinessNumber } from '../../../../infrastructure/numbering/mysql-business-number.js';
import { QualityCommandError, QualityProcessInspectionCommand } from '../../../quality/public.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import { writeProductionAudit } from '../shared/mysql-production-audit.js';
import { lockProcessInspectionStep } from './mysql-production-process-inspection-source.js';
import { DISPOSITION_SELECT } from './mysql-production-reporting.persistence.js';
import { mapDisposition, type DispositionRow } from './mysql-production-reporting.projection.js';

/** 处理明细复用异常处置单；Quality 在相同事务内维护根的累计已处理量。 */
export async function acceptProcessInspection(
  pool: Pool,
  quality: QualityProcessInspectionCommand,
  batchId: string,
  stepId: string,
  payload: AcceptProcessInspectionPayload,
  context: CommandContext,
): Promise<BatchStepAbnormalDispositionItem> {
  try {
    return await withTransaction(pool, async (db) => {
      if (!context.actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人身份');
      const step = await lockProcessInspectionStep(db, batchId, stepId);
      await quality.accept(
        {
          inspectionId: payload.inspectionId,
          recordId: payload.recordId,
          version: payload.version,
          batchId,
          stepId,
          quantity: payload.quantity,
        },
        context,
      );
      const [created] = await db.execute<ResultSetHeader>(
        `INSERT INTO batch_step_abnormal_dispositions
         (disposition_no,production_batch_id,batch_step_record_id,source_type,batch_step_report_id,
          process_inspection_id,process_inspection_record_id,inspection_quantity,unit_snapshot,
          review_status,remark,created_by,updated_by)
         VALUES (?,?,?,'process_inspection',NULL,?,?,?,?,'pending_review',?,?,?)`,
        [
          await allocateBusinessNumber(db, 'abnormal_disposition'),
          batchId,
          stepId,
          payload.inspectionId,
          payload.recordId,
          payload.quantity,
          step.unit,
          payload.remark ?? null,
          context.actorId,
          context.actorId,
        ],
      );
      await db.execute('UPDATE batch_step_records SET version=version+1,updated_by=? WHERE id=?', [
        context.actorId,
        stepId,
      ]);
      const id = String(created.insertId);
      await writeProductionAudit(
        db,
        context,
        'production-process-inspection.accept',
        'abnormal_disposition',
        id,
        null,
        {
          batchId,
          stepId,
          inspectionId: payload.inspectionId,
          recordId: payload.recordId,
          quantity: payload.quantity,
        },
      );
      const [[row]] = await db.query<DispositionRow[]>(`${DISPOSITION_SELECT} WHERE d.id=?`, [id]);
      if (!row) throw new ProductionDomainError('NOT_FOUND', '处理异常处置单不存在');
      return mapDisposition(row);
    });
  } catch (error) {
    if (error instanceof QualityCommandError)
      throw new ProductionDomainError(error.code, error.message);
    throw error;
  }
}
