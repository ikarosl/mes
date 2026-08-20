import { describe, expect, it, vi } from 'vitest';
import { ProductionReportingService } from '../production-reporting.service.js';

const context = {
  actorId: '7',
  requestId: 'req-report-1',
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
  ip: null,
  userAgent: null,
};

describe('ProductionReportingService', () => {
  it('returns the execution batch summary projection without per-row enrichment', async () => {
    const result = { items: [{ id: '1', pendingAbnormalCount: 2 }], total: 1 };
    const reporting = { listExecutionBatches: vi.fn().mockResolvedValue(result) };
    const service = new ProductionReportingService(
      reporting as never,
      { listUserReferencesByIds: vi.fn() } as never,
      { execute: vi.fn() } as never,
    );
    await expect(service.listExecutionBatches({ page: 1, pageSize: 20 })).resolves.toBe(result);
    expect(reporting.listExecutionBatches).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });

  it('normalizes and executes report creation through the stable idempotency scope', async () => {
    const reporting = { createReport: vi.fn().mockResolvedValue({ ok: true }) };
    const idempotency = {
      execute: vi.fn(async (command) => ({ result: await command.handler(), isReplay: false })),
    };
    const service = new ProductionReportingService(
      reporting as never,
      { listUserReferencesByIds: vi.fn() } as never,
      idempotency as never,
    );
    await service.createReport(
      '1',
      '2',
      { version: 3, normalQuantity: 2, abnormalQuantity: 1, remark: '  note  ' },
      context,
    );
    expect(idempotency.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'production.step-report.create.v3',
        key: context.idempotencyKey,
      }),
    );
    expect(reporting.createReport).toHaveBeenCalledWith(
      '1',
      '2',
      {
        version: 3,
        normalQuantity: 2,
        abnormalQuantity: 1,
        abnormalOrigin: null,
        remark: 'note',
      },
      expect.not.objectContaining({ idempotencyKey: expect.anything() }),
    );
  });

  it('uses a separate correction scope and normalized reason', async () => {
    const reporting = { correctReport: vi.fn().mockResolvedValue({ ok: true }) };
    const idempotency = {
      execute: vi.fn(async (command) => ({ result: await command.handler(), isReplay: false })),
    };
    const service = new ProductionReportingService(
      reporting as never,
      { listUserReferencesByIds: vi.fn() } as never,
      idempotency as never,
    );
    await service.correctReport(
      '1',
      '2',
      '9',
      { version: 4, normalQuantity: 2, abnormalQuantity: 0, reason: '  修正  ' },
      context,
    );
    expect(idempotency.execute).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'production.step-report.correct.v3' }),
    );
    expect(reporting.correctReport).toHaveBeenCalledWith(
      '1',
      '2',
      '9',
      {
        version: 4,
        normalQuantity: 2,
        abnormalQuantity: 0,
        abnormalOrigin: null,
        reason: '修正',
      },
      expect.not.objectContaining({ idempotencyKey: expect.anything() }),
    );
  });
});
