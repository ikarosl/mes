import { describe, expect, it, vi } from 'vitest';
import { ProductionService } from '../production.service.js';

const audit = { userId: '1', ip: '127.0.0.1' };

describe('ProductionService first-stage commands', () => {
  it('forwards the client version when releasing a work order', async () => {
    const repository = {
      transitionWorkOrder: vi.fn().mockResolvedValue({ id: '11', status: 'released' }),
    };
    const service = new ProductionService(repository as never, {} as never, {} as never);

    await service.releaseWorkOrder('11', 4, audit);

    expect(repository.transitionWorkOrder).toHaveBeenCalledWith('11', 'release', 4, audit);
  });

  it('forwards the client version when generating immutable material demands', async () => {
    const repository = {
      getBatchProductId: vi.fn().mockResolvedValue('8'),
      generateMaterialDemands: vi.fn().mockResolvedValue({ id: '6', status: 'material_pending' }),
    };
    const products = {
      getBomSnapshot: vi.fn().mockResolvedValue({
        product: { id: '8' },
        lines: [
          {
            productMaterialId: '3',
            materialProductId: '5',
            quantityPerUnit: '2.0000',
            unit: 'pcs',
            isKeyMaterial: true,
            needBatchRecord: true,
          },
        ],
      }),
    };
    const service = new ProductionService(repository as never, products as never, {} as never);

    await service.generateMaterialDemands('6', 2, audit);

    expect(repository.generateMaterialDemands).toHaveBeenCalledWith(
      '6',
      2,
      expect.any(Object),
      audit,
    );
  });

  it('rejects a production batch plan whose end date precedes its start date', async () => {
    const repository = { updateBatch: vi.fn() };
    const service = new ProductionService(repository as never, {} as never, {} as never);

    await expect(
      service.updateBatch(
        '6',
        {
          version: 2,
          planStartDate: '2026-08-02',
          planEndDate: '2026-08-01',
        },
        audit,
      ),
    ).rejects.toThrow('计划完工日期不能早于计划开始日期');

    expect(repository.updateBatch).not.toHaveBeenCalled();
  });

  it('forwards batch plan dates as a versioned update', async () => {
    const repository = { updateBatch: vi.fn().mockResolvedValue({ id: '6' }) };
    const service = new ProductionService(repository as never, {} as never, {} as never);
    const payload = { version: 2, planStartDate: '2026-08-01', planEndDate: '2026-08-02' };

    await service.updateBatch('6', payload, audit);

    expect(repository.updateBatch).toHaveBeenCalledWith('6', payload, audit);
  });

  it('only accepts creation-time execution overrides for steps in the selected route', async () => {
    const repository = { getDefaultRouteId: vi.fn().mockResolvedValue(null) };
    const products = {
      getRouteSnapshot: vi.fn().mockResolvedValue({
        id: '9',
        steps: [{ routeStepId: '41' }],
      }),
    };
    const service = new ProductionService(repository as never, products as never, {} as never);

    await expect(
      service.createBatch(
        '6',
        {
          routeId: '9',
          plannedQuantity: 1,
          stepOverrides: [{ routeStepId: '42', responsibleUserId: null }],
        },
        audit,
      ),
    ).rejects.toThrow('工序覆盖项不属于所选工艺路线');
  });

  it('resolves the actual SOP snapshot before updating a step execution override', async () => {
    const repository = { updateBatchStepExecution: vi.fn().mockResolvedValue({ id: '6' }) };
    const products = {
      getEnabledSopFileSnapshot: vi
        .fn()
        .mockResolvedValue({
          id: '8',
          fileName: '现场作业.pdf',
          objectKey: 'sop/8.pdf',
          versionNo: 'V2',
        }),
    };
    const service = new ProductionService(repository as never, products as never, {} as never);

    await service.updateBatchStepExecution('6', '7', { version: 3, actualSopFileId: '8' }, audit);

    expect(repository.updateBatchStepExecution).toHaveBeenCalledWith(
      '6',
      '7',
      { version: 3, actualSopFileId: '8' },
      expect.objectContaining({ id: '8', versionNo: 'V2' }),
      audit,
    );
  });
});
