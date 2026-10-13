import { type RowDataPacket } from '../../../../apps/api/node_modules/mysql2/promise.js';
import { expect, it } from 'vitest';
import {
  insert,
  type DispositionRow,
  type ProductionPersistenceContext,
} from './production-persistence-fixture.js';

export const registerProductionReportFactCases = (
  getContext: () => ProductionPersistenceContext,
): void => {
  it('stores immutable report facts and derives the compatibility totals after reversal and correction', async () => {
    const { pool, repository, fixture } = getContext();

    const token = `report-${Date.now()}-${process.pid}`;
    const originalId = await insert(
      pool,
      `INSERT INTO batch_step_reports
        (report_no,production_batch_id,batch_step_record_id,report_type,reported_quantity,normal_quantity,abnormal_quantity,unit_snapshot,created_by)
       VALUES (?,?,?,'normal',?,?,?,?,?)`,
      [
        `${token}-original`,
        fixture.batchId,
        fixture.batchStepRecordId,
        '4.0000',
        '4.0000',
        '0.0000',
        'pcs',
        fixture.actorId,
      ],
    );
    await insert(
      pool,
      `INSERT INTO batch_step_reports
        (report_no,production_batch_id,batch_step_record_id,report_type,reported_quantity,normal_quantity,abnormal_quantity,unit_snapshot,created_by)
       VALUES (?,?,?,'normal',?,?,?,?,?)`,
      [
        `${token}-first`,
        fixture.batchId,
        fixture.batchStepRecordId,
        '6.0000',
        '5.0000',
        '1.0000',
        'pcs',
        fixture.actorId,
      ],
    );
    await insert(
      pool,
      `INSERT INTO batch_step_reports
        (report_no,production_batch_id,batch_step_record_id,report_type,reversal_of_report_id,reported_quantity,normal_quantity,abnormal_quantity,unit_snapshot,created_by)
       VALUES (?,?,?,'reversal',?,?,?,?,?,?)`,
      [
        `${token}-reversal`,
        fixture.batchId,
        fixture.batchStepRecordId,
        originalId,
        '4.0000',
        '4.0000',
        '0.0000',
        'pcs',
        fixture.actorId,
      ],
    );
    await insert(
      pool,
      `INSERT INTO batch_step_reports
        (report_no,production_batch_id,batch_step_record_id,report_type,replaces_report_id,reported_quantity,normal_quantity,abnormal_quantity,unit_snapshot,created_by)
       VALUES (?,?,?,'normal',?,?,?,?,?,?)`,
      [
        `${token}-replacement`,
        fixture.batchId,
        fixture.batchStepRecordId,
        originalId,
        '3.0000',
        '2.0000',
        '1.0000',
        'pcs',
        fixture.actorId,
      ],
    );

    await expect(
      pool.execute(
        `INSERT INTO batch_step_reports
          (report_no,production_batch_id,batch_step_record_id,report_type,reversal_of_report_id,reported_quantity,normal_quantity,abnormal_quantity,unit_snapshot,created_by)
         VALUES (?,?,?,'reversal',?,?,?,?,?,?)`,
        [
          `${token}-duplicate-reversal`,
          fixture.batchId,
          fixture.batchStepRecordId,
          originalId,
          '4.0000',
          '4.0000',
          '0.0000',
          'pcs',
          fixture.actorId,
        ],
      ),
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });

    const detail = await repository.get(String(fixture.batchId));
    expect(detail.stepRecords).toHaveLength(1);
    expect(detail.stepRecords[0]).toMatchObject({
      outputQuantity: '9.0000',
      qualifiedQuantity: '7.0000',
      abnormalQuantity: '2.0000',
      reworkQuantity: '0.0000',
    });

    const [legacyColumns] = await pool.query<RowDataPacket[]>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema=DATABASE() AND table_name='batch_step_records'
         AND column_name IN ('output_quantity','qualified_quantity','abnormal_quantity','rework_quantity')`,
    );
    expect(legacyColumns).toHaveLength(0);
  });

  it('enforces abnormal disposition identity, review state and separated step status', async () => {
    const { pool, fixture } = getContext();

    const token = `disposition-${Date.now()}-${process.pid}`;
    const reportId = await insert(
      pool,
      `INSERT INTO batch_step_reports
        (report_no,production_batch_id,batch_step_record_id,report_type,reported_quantity,normal_quantity,abnormal_quantity,unit_snapshot,created_by)
       VALUES (?,?,?,'normal',?,?,?,?,?)`,
      [
        `${token}-report`,
        fixture.batchId,
        fixture.batchStepRecordId,
        '2.0000',
        '1.0000',
        '1.0000',
        'pcs',
        fixture.actorId,
      ],
    );
    const dispositionId = await insert(
      pool,
      `INSERT INTO batch_step_abnormal_dispositions
        (disposition_no,production_batch_id,batch_step_record_id,batch_step_report_id,created_by,updated_by)
       VALUES (?,?,?,?,?,?)`,
      [
        `${token}-disposition`,
        fixture.batchId,
        fixture.batchStepRecordId,
        reportId,
        fixture.actorId,
        fixture.actorId,
      ],
    );

    await expect(
      pool.execute(
        `INSERT INTO batch_step_abnormal_dispositions
          (disposition_no,production_batch_id,batch_step_record_id,batch_step_report_id,created_by,updated_by)
         VALUES (?,?,?,?,?,?)`,
        [
          `${token}-duplicate`,
          fixture.batchId,
          fixture.batchStepRecordId,
          reportId,
          fixture.actorId,
          fixture.actorId,
        ],
      ),
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });

    await expect(
      pool.execute(
        "UPDATE batch_step_abnormal_dispositions SET review_status='approved' WHERE id=?",
        [dispositionId],
      ),
    ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });

    await pool.execute(
      `UPDATE batch_step_abnormal_dispositions
       SET review_status='approved',disposition_type='scrap',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,
           version=version+1,updated_by=?
       WHERE id=? AND version=0`,
      [fixture.actorId, fixture.actorId, dispositionId],
    );
    const [[disposition]] = await pool.query<DispositionRow[]>(
      `SELECT review_status,disposition_type,reviewed_by,version
       FROM batch_step_abnormal_dispositions WHERE id=?`,
      [dispositionId],
    );
    expect(disposition).toMatchObject({
      review_status: 'approved',
      disposition_type: 'scrap',
      reviewed_by: fixture.actorId,
      version: 1,
    });

    await expect(
      pool.execute("UPDATE batch_step_records SET status='abnormal' WHERE id=?", [
        fixture.batchStepRecordId,
      ]),
    ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
  });
};
