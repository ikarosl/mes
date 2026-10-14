import { describe, expect, it, vi } from 'vitest';
import { MysqlProductionAbnormalRepository } from '../mysql-production-abnormal.repository.js';

describe('MysqlProductionAbnormalRepository rejection', () => {
  it('reverses a direct pure-abnormal report in the same transaction without creating scrap authorization', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[{ production_batch_id: 21 }], []])
      .mockResolvedValueOnce([[{ id: 21, status: 'doing' }], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[pendingDirectAbnormal], []])
      .mockResolvedValueOnce([
        [{ ...pendingDirectAbnormal, review_status: 'rejected', version: 4 }],
        [],
      ]);
    connection.execute
      .mockResolvedValueOnce([{ insertId: 92, affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ insertId: 100, affectedRows: 1 }, []]);
    const repository = new MysqlProductionAbnormalRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(
      repository.rejectDisposition('31', { version: 3, reason: '异常来源混填' }, audit),
    ).resolves.toMatchObject({ dispositionId: '31', reviewStatus: 'rejected' });

    const reversalSql = String(connection.execute.mock.calls[0]?.[0]);
    expect(reversalSql).toContain('INSERT INTO batch_step_reports');
    expect(reversalSql).toContain("'reversal'");
    expect(connection.execute.mock.calls[0]?.[1]).toEqual([
      expect.stringMatching(/^SR-/),
      21,
      41,
      51,
      '3.0000',
      '0.0000',
      '3.0000',
      'current_step',
      '件',
      '异常来源混填',
      '7',
    ]);
    const allSql = connection.execute.mock.calls.map((call) => String(call[0])).join('\n');
    expect(allSql).not.toContain('batch_step_scrap_records');
    expect(allSql).not.toContain('batch_step_scrap_reproduction_authorization');
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('rejects a mixed or rework-completion source instead of silently reversing it', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[{ production_batch_id: 21 }], []])
      .mockResolvedValueOnce([[{ id: 21, status: 'doing' }], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([
        [{ ...pendingDirectAbnormal, normal_quantity: '1.0000', is_direct_report: 0 }],
        [],
      ]);
    const repository = new MysqlProductionAbnormalRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(
      repository.rejectDisposition('31', { version: 3, reason: '需要复核' }, audit),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });
});

const transactionConnection = () => ({
  beginTransaction: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
});

const pendingDirectAbnormal = {
  id: 31,
  disposition_no: 'BAD-31',
  production_batch_id: 21,
  batch_step_record_id: 41,
  batch_step_report_id: 51,
  review_status: 'pending_review',
  disposition_type: null,
  remark: null,
  version: 3,
  created_at: new Date('2026-08-25T00:00:00Z'),
  reported_quantity: '3.0000',
  normal_quantity: '0.0000',
  abnormal_quantity: '3.0000',
  abnormal_origin: 'current_step',
  unit_snapshot: '件',
  report_type: 'normal',
  is_effective: 1,
  is_direct_report: 1,
  responsible_user_id: 9,
};

const audit = { actorId: '7', ip: null, requestId: 'test-request', userAgent: null };
