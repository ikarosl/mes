import { describe, expect, it, vi } from 'vitest';
import { ProductionService } from '../production.service.js';

const audit = { actorId: '1', ip: '127.0.0.1', requestId: 'test-request', userAgent: null };

describe('ProductionService first-stage commands', () => {
  it('maps a product public query failure to HTTP 404', async () => {
    const products = {
      getProductionProduct: vi
        .fn()
        .mockResolvedValue({ status: 'not-found', message: '产品不存在' }),
    };
    const service = new ProductionService({} as never, products as never, {} as never);

    await expect(
      service.createWorkOrder({ productId: '8', workOrderNo: 'WO-001', plannedQuantity: 1 }, audit),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: '产品不存在',
    });
  });

  it('maps a route public query failure to HTTP 404', async () => {
    const repository = {
      withBatchCreationTransaction: vi.fn(async (_workOrderId, action) => action('8')),
    };
    const products = {
      getProductionRouteSnapshot: vi
        .fn()
        .mockResolvedValue({ status: 'not-found', message: '工艺路线不可用' }),
    };
    const service = new ProductionService(repository as never, products as never, {} as never);

    await expect(service.createBatch('6', { plannedQuantity: 1 }, audit)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: '工艺路线不可用',
    });
  });

  it('maps a BOM public query failure to HTTP 400', async () => {
    const repository = { getBatchProductId: vi.fn().mockResolvedValue('8') };
    const products = {
      getBomSnapshot: vi
        .fn()
        .mockResolvedValue({ status: 'invalid-input', message: '产品不可生成 BOM' }),
    };
    const service = new ProductionService(repository as never, products as never, {} as never);

    await expect(service.generateMaterialDemands('6', 2, audit)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: '产品不可生成 BOM',
    });
  });

  it('maps an SOP public query failure to HTTP 404', async () => {
    const products = {
      getEnabledSopFileSnapshot: vi
        .fn()
        .mockResolvedValue({ status: 'not-found', message: 'SOP 文件不可用' }),
    };
    const service = new ProductionService({} as never, products as never, {} as never);

    await expect(
      service.updateBatchStepExecution('6', '7', { version: 3, actualSopFileId: '8' }, audit),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'SOP 文件不可用',
    });
  });

  it('re-reads the active product and freezes its snapshot inside the release transaction', async () => {
    const repository = {
      withWorkOrderReleaseTransaction: vi.fn(async (_id, action) => action('8')),
      releaseWorkOrder: vi.fn().mockResolvedValue({ id: '11', status: 'released', batches: [] }),
    };
    const products = {
      getProductionProduct: vi.fn().mockResolvedValue({
        status: 'success',
        value: {
          id: '8',
          itemCode: 'FG-002',
          productName: 'Current finished good',
          unit: 'box',
          defaultRouteId: null,
        },
      }),
    };
    const service = new ProductionService(repository as never, products as never, {} as never);

    await service.releaseWorkOrder('11', 4, audit);

    expect(repository.withWorkOrderReleaseTransaction).toHaveBeenCalledWith(
      '11',
      expect.any(Function),
    );
    expect(products.getProductionProduct).toHaveBeenCalledWith('8');
    expect(repository.releaseWorkOrder).toHaveBeenCalledWith(
      '11',
      4,
      expect.objectContaining({ itemCode: 'FG-002', unit: 'box' }),
      audit,
    );
  });

  it('maps an invalid product found during release to a production domain error', async () => {
    const repository = {
      withWorkOrderReleaseTransaction: vi.fn(async (_id, action) => action('8')),
    };
    const products = {
      getProductionProduct: vi
        .fn()
        .mockResolvedValue({ status: 'not-found', message: '产品已停用' }),
    };
    const service = new ProductionService(repository as never, products as never, {} as never);

    await expect(service.releaseWorkOrder('11', 4, audit)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: '产品已停用',
    });
  });

  it('preserves omitted remarks while forwarding an explicit null to clear it', async () => {
    const repository = {
      updateWorkOrder: vi.fn().mockResolvedValue({ id: '11', batches: [] }),
    };
    const service = new ProductionService(repository as never, {} as never, {} as never);

    await service.updateWorkOrder('11', { version: 4 }, audit);
    await service.updateWorkOrder('11', { version: 5, remark: null }, audit);

    expect(repository.updateWorkOrder).toHaveBeenNthCalledWith(
      1,
      '11',
      { version: 4 },
      undefined,
      audit,
    );
    expect(repository.updateWorkOrder).toHaveBeenNthCalledWith(
      2,
      '11',
      { version: 5, remark: null },
      undefined,
      audit,
    );
  });

  it('resolves an edited draft product and forwards editable quantity fields', async () => {
    const repository = {
      updateWorkOrder: vi.fn().mockResolvedValue({ id: '11', batches: [] }),
    };
    const product = {
      id: '9',
      itemCode: 'FG-009',
      productName: 'Edited product',
      unit: 'box',
      defaultRouteId: null,
    };
    const products = {
      getProductionProduct: vi.fn().mockResolvedValue({ status: 'success', value: product }),
    };
    const service = new ProductionService(repository as never, products as never, {} as never);
    const payload = { version: 4, productId: '9', plannedQuantity: 25.5 };

    await service.updateWorkOrder('11', payload, audit);

    expect(products.getProductionProduct).toHaveBeenCalledWith('9');
    expect(repository.updateWorkOrder).toHaveBeenCalledWith('11', payload, product, audit);
  });

  it('forwards the client version when generating immutable material demands', async () => {
    const repository = {
      getBatchProductId: vi.fn().mockResolvedValue('8'),
      generateMaterialDemands: vi.fn().mockResolvedValue({ id: '6', status: 'material_pending' }),
    };
    const products = {
      getBomSnapshot: vi.fn().mockResolvedValue({
        status: 'success',
        value: {
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
        },
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
    const repository = {
      withBatchCreationTransaction: vi.fn(async (_workOrderId, action) => action('8')),
    };
    const products = {
      getProductionRouteSnapshot: vi.fn().mockResolvedValue({
        status: 'success',
        value: { id: '9', steps: [{ routeStepId: '41' }] },
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

  it('resolves the default route and creates the batch inside one production transaction', async () => {
    const repository = {
      withBatchCreationTransaction: vi.fn(async (_workOrderId, action) => action('8')),
      createBatch: vi.fn().mockResolvedValue({ id: '6', ownerId: null, stepRecords: [] }),
    };
    const products = {
      getProductionRouteSnapshot: vi.fn().mockResolvedValue({
        status: 'success',
        value: { id: '9', product: { id: '8' }, steps: [] },
      }),
    };
    const service = new ProductionService(repository as never, products as never, {} as never);

    await service.createBatch('6', { plannedQuantity: 1 }, audit);

    expect(repository.withBatchCreationTransaction).toHaveBeenCalledWith('6', expect.any(Function));
    expect(products.getProductionRouteSnapshot).toHaveBeenCalledWith('8', null);
    expect(repository.createBatch).toHaveBeenCalledWith(
      '6',
      { plannedQuantity: 1, batchNo: null, remark: null },
      expect.objectContaining({ id: '9' }),
      [],
      audit,
    );
  });

  it('enriches all batch user references with one Identity directory call', async () => {
    const repository = {
      getBatch: vi.fn().mockResolvedValue({
        id: '6',
        ownerId: '7',
        ownerName: null,
        stepRecords: [
          {
            id: '10',
            defaultResponsibleUserId: '8',
            defaultResponsibleUserName: null,
            responsibleUserId: '7',
            responsibleUserName: null,
          },
        ],
      }),
    };
    const identity = {
      listUserReferencesByIds: vi.fn().mockResolvedValue([
        { id: '7', displayName: '已停用负责人' },
        { id: '8', displayName: '默认负责人' },
      ]),
    };
    const service = new ProductionService(repository as never, {} as never, identity as never);

    const result = await service.getBatch('6');

    expect(identity.listUserReferencesByIds).toHaveBeenCalledOnce();
    expect(identity.listUserReferencesByIds).toHaveBeenCalledWith(['7', '8']);
    expect(result).toMatchObject({
      ownerName: '已停用负责人',
      stepRecords: [
        {
          defaultResponsibleUserName: '默认负责人',
          responsibleUserName: '已停用负责人',
        },
      ],
    });
  });

  it('resolves the actual SOP snapshot before updating a step execution override', async () => {
    const repository = { updateBatchStepExecution: vi.fn().mockResolvedValue({ id: '6' }) };
    const products = {
      getEnabledSopFileSnapshot: vi.fn().mockResolvedValue({
        status: 'success',
        value: {
          id: '8',
          fileName: '现场作业.pdf',
          objectKey: 'sop/8.pdf',
          versionNo: 'V2',
        },
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
