import { describe, expect, it, vi } from 'vitest';
import { selectWorkerTasks } from '../mysql-production-worker-task.projection.js';

describe('worker task short-batch startability projection', () => {
  it('queries startability once for deduplicated batches and only applies it to the first step', async () => {
    const workerRows = [
      {
        step_record_id: 101,
        production_batch_id: 11,
        batch_no: 'PB-011',
        batch_status: 'material_partially_outbound',
        work_order_id: 21,
        work_order_no: 'WO-021',
        product_id: 31,
        product_code: 'P-031',
        product_name: '测试产品',
        planned_quantity: '10.0000',
        step_order: 1,
        step_code: 'S-01',
        step_name: '首工序',
        sop_file_name: null,
        sop_version_no: null,
        step_status: 'assigned',
        need_record: 0,
        unit_snapshot: '件',
        effective_reported: '0.0000',
        effective_direct_reported: '0.0000',
        effective_normal: '0.0000',
        effective_abnormal: '0.0000',
        started_at: null,
        version: 0,
      },
      {
        step_record_id: 102,
        production_batch_id: 11,
        batch_no: 'PB-011',
        batch_status: 'material_partially_outbound',
        work_order_id: 21,
        work_order_no: 'WO-021',
        product_id: 31,
        product_code: 'P-031',
        product_name: '测试产品',
        planned_quantity: '10.0000',
        step_order: 2,
        step_code: 'S-02',
        step_name: '后续工序',
        sop_file_name: null,
        sop_version_no: null,
        step_status: 'assigned',
        need_record: 0,
        unit_snapshot: '件',
        effective_reported: '0.0000',
        effective_direct_reported: '0.0000',
        effective_normal: '0.0000',
        effective_abnormal: '0.0000',
        started_at: null,
        version: 0,
      },
    ];
    const quantityRows = workerRows.map((row) => ({
      id: row.step_record_id,
      production_batch_id: row.production_batch_id,
      step_order_snapshot: row.step_order,
      need_record_snapshot: row.need_record,
      status: row.step_status,
      effective_direct_reported: row.effective_direct_reported,
      effective_normal: row.effective_normal,
    }));
    const query = vi.fn().mockImplementation((sqlValue: unknown, params: unknown[]) => {
      const sql = String(sqlValue);
      if (sql.includes('SELECT current.id step_record_id'))
        return Promise.resolve([workerRows, []]);
      if (sql.includes('FROM batch_step_records step_record'))
        return Promise.resolve([quantityRows, []]);
      if (sql.includes('FROM batch_step_scrap_reproduction_authorization authorization'))
        return Promise.resolve([[], []]);
      if (sql.includes('SELECT b.id production_batch_id')) {
        expect(params).toEqual(['11']);
        return Promise.resolve([[{ production_batch_id: 11, short_batch_startable: 1 }], []]);
      }
      throw new Error(`unexpected SQL: ${sql}`);
    });

    const result = await selectWorkerTasks({ query } as never, '7');

    const mainSql = String(query.mock.calls[0]?.[0]);
    expect(mainSql).not.toContain('production_short_batch_authorization');
    expect(mainSql).not.toContain('outbound_detail');
    const startabilityCalls = query.mock.calls.filter(([sql]) =>
      String(sql).includes('SELECT b.id production_batch_id'),
    );
    expect(startabilityCalls).toHaveLength(1);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ stepRecordId: '101', canStart: true });
    expect(result[1]).toMatchObject({ stepRecordId: '102', canStart: false });
  });
});
