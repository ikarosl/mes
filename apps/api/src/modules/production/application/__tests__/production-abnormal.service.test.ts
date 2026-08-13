import { describe, expect, it, vi } from 'vitest';
import { ProductionAbnormalService } from '../production-abnormal.service.js';

const rework = {
  reworkId: '5',
  reworkNo: 'RW-5',
  abnormalDispositionId: '4',
  productionBatchId: '1',
  stepRecordId: '2',
  sourceReportId: '3',
  responsibleUserId: '7',
  responsibleUserName: null,
  reworkQuantity: '2.0000',
  unit: '件',
  status: 'pending' as const,
  completedReportId: null,
  startedAt: null,
  completedAt: null,
  version: 0,
  remark: null,
  createdAt: '2026-08-13T00:00:00+08:00',
};

describe('ProductionAbnormalService', () => {
  it('normalizes approval and resolves the responsible employee through the public directory', async () => {
    const repository = { approveRework: vi.fn().mockResolvedValue(rework) };
    const identity = {
      listUserReferencesByIds: vi.fn().mockResolvedValue([{ id: '7', displayName: '返工员工' }]),
    };
    const service = new ProductionAbnormalService(
      repository as never,
      identity as never,
      {} as never,
    );
    const result = await service.approveRework(
      '4',
      { version: 0, remark: '  同意返工  ' },
      { actorId: '9', requestId: 'req', ip: null, userAgent: null },
    );
    expect(repository.approveRework).toHaveBeenCalledWith(
      '4',
      { version: 0, remark: '同意返工' },
      { actorId: '9', requestId: 'req', ip: null, userAgent: null },
    );
    expect(result.responsibleUserName).toBe('返工员工');
  });

  it('runs completion under the registered idempotency scope with a narrow context', async () => {
    const completed = {
      rework: { ...rework, status: 'completed' as const, completedReportId: '8' },
      report: {},
      abnormalDisposition: null,
    };
    const repository = { completeRework: vi.fn().mockResolvedValue(completed) };
    const identity = { listUserReferencesByIds: vi.fn().mockResolvedValue([]) };
    const idempotency = {
      execute: vi.fn(async (command) => ({ result: await command.handler(), isReplay: false })),
    };
    const service = new ProductionAbnormalService(
      repository as never,
      identity as never,
      idempotency as never,
    );
    await service.completeRework(
      '5',
      { version: 1, normalQuantity: 2, abnormalQuantity: 0, remark: ' 完成 ' },
      {
        actorId: '7',
        requestId: 'req',
        idempotencyKey: 'key',
        ip: '127.0.0.1',
        userAgent: null,
      },
    );
    expect(idempotency.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'production.rework.complete.v1',
        key: 'key',
        request: expect.objectContaining({
          params: { reworkId: '5' },
          body: { version: 1, normalQuantity: 2, abnormalQuantity: 0, remark: '完成' },
        }),
      }),
    );
    expect(repository.completeRework).toHaveBeenCalledWith(
      '5',
      { version: 1, normalQuantity: 2, abnormalQuantity: 0, remark: '完成' },
      { actorId: '7', requestId: 'req', ip: '127.0.0.1', userAgent: null },
    );
  });
});
