import { describe, expect, it, vi } from 'vitest';
import { MysqlProductionExecutionRepository } from '../mysql-production-execution.repository.js';

describe('MysqlProductionExecutionRepository SOP snapshots', () => {
  it('reads a frozen SOP locator without filtering a soft-deleted technical-file record', async () => {
    const query = vi.fn().mockResolvedValue([
      [
        {
          file_id: 5,
          file_name: 'SOP-v1.pdf',
          version_no: 'V1',
          object_key: 'sop/2026/v1.pdf',
        },
      ],
      [],
    ]);
    const repository = new MysqlProductionExecutionRepository({ query } as never);

    await expect(repository.getStepSopSnapshot('1', '9')).resolves.toEqual({
      fileId: '5',
      fileName: 'SOP-v1.pdf',
      versionNo: 'V1',
      objectKey: 'sop/2026/v1.pdf',
    });

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('FROM batch_step_records step');
    expect(sql).not.toContain('technical_files');
  });

  it('enforces current assignee ownership for employee SOP downloads', async () => {
    const query = vi.fn().mockResolvedValue([[], []]);
    const repository = new MysqlProductionExecutionRepository({ query } as never);

    await expect(repository.getStepSopSnapshot('1', '9', '7')).rejects.toMatchObject({
      code: 'NOT_STEP_ASSIGNEE',
    });

    expect(String(query.mock.calls[0]?.[0])).toContain('step.responsible_user_id=?');
    expect(query.mock.calls[0]?.[1]).toEqual(['1', '9', '7']);
  });
});
