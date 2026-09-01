import { describe, expect, it, vi } from 'vitest';
import type { ProductionBatchDetail } from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../../common/audit/audit.types.js';
import { ProductionService } from '../production.service.js';
import { CREATE_BATCH_IDEMPOTENCY_SCOPE } from '../idempotency/production-idempotency-scopes.contract.js';

const audit: CommandContext = {
  actorId: '1',
  ip: '127.0.0.1',
  requestId: 'test-request',
  userAgent: null,
};
const idempotentAudit: IdempotentCommandContext = {
  ...audit,
  actorId: '1',
  idempotencyKey: 'test-idempotency-key',
};

/** 直通 executor：createBatch 幂等试点在单测中直接执行业务 handler 并标记非重放。 */
const executingIdempotencyExecutor = {
  execute: async (command: { handler: () => Promise<unknown> }) => ({
    result: await command.handler(),
    isReplay: false,
  }),
};

/** 满足 createBatch 幂等结果 Zod schema 的完整快照；重放路径 decode 必须通过完整嵌套校验。 */
const validBatchDetail = (
  overrides: Partial<ProductionBatchDetail> = {},
): ProductionBatchDetail => ({
  id: '6',
  workOrderId: '6',
  workOrderNo: 'WO-001',
  productId: '3',
  productCode: 'P-001',
  productName: '测试产品',
  batchNo: 'task_batch-001',
  routeId: null,
  routeCode: null,
  routeVersion: null,
  plannedQuantity: '1.0000',
  completedQuantity: '0.0000',
  qualifiedQuantity: '0.0000',
  planStartDate: null,
  planEndDate: null,
  startedAt: null,
  status: 'pending',
  materialPlanVersion: 1,
  shortBatchAuthorizationStatus: 'none',
  ownerId: null,
  ownerName: null,
  completedAt: null,
  completedBy: null,
  remark: null,
  version: 0,
  createdAt: '2026-08-01T00:00:00+08:00',
  updatedAt: '2026-08-01T00:00:00+08:00',
  stepRecords: [],
  ...overrides,
});

describe('ProductionService first-stage commands', () => {
  it('maps a product public query failure to HTTP 404', async () => {
    const products = {
      getProductionProduct: vi
        .fn()
        .mockResolvedValue({ status: 'not-found', message: '产品不存在' }),
    };
    const service = new ProductionService({} as never, products as never, {} as never, {} as never);

    await expect(
      service.createWorkOrder(
        {
          productId: '8',
          workOrderNo: 'WO-001',
          plannedQuantity: 1,
          planStartDate: '2026-08-01',
          planEndDate: '2026-08-31',
        },
        audit,
      ),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: '产品不存在',
    });
  });

  it('returns the complete work-order options result from the repository', async () => {
    const options = [
      {
        id: '11',
        workOrderNo: 'WO-002',
        productId: '8',
        productCode: 'FG-002',
        productName: 'Finished good',
        remainingQuantity: '50.0000',
        planStartDate: '2026-08-01',
        planEndDate: '2026-08-31',
      },
    ];
    const repository = { listWorkOrderOptions: vi.fn().mockResolvedValue(options) };
    const service = new ProductionService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.listWorkOrderOptions()).resolves.toEqual(options);
    expect(repository.listWorkOrderOptions).toHaveBeenCalledWith();
  });

  it('maps a route public query failure to HTTP 404', async () => {
    const repository = {
      withBatchCreationTransaction: vi.fn(async (_workOrderId, action) => action('8')),
    };
    const productDefinitions = {
      lockBomForProductionTask: vi
        .fn()
        .mockResolvedValue({ status: 'not-found', message: '工艺路线不可用' }),
    };
    const service = new ProductionService(
      repository as never,
      {} as never,
      {} as never,
      executingIdempotencyExecutor as never,
      productDefinitions as never,
    );

    await expect(
      service.createBatch('6', { plannedQuantity: 1 }, idempotentAudit),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: '工艺路线不可用',
    });
    expect(productDefinitions.lockBomForProductionTask).toHaveBeenCalledWith(
      '8',
      null,
      expect.objectContaining({ actorId: '1', requestId: 'test-request' }),
    );
  });

  it('maps a BOM public query failure to HTTP 400', async () => {
    const repository = {
      hasGeneratedNormalMaterialDemands: vi.fn().mockResolvedValue(false),
      getBatchProductId: vi.fn().mockResolvedValue('8'),
    };
    const products = {
      getBomSnapshot: vi
        .fn()
        .mockResolvedValue({ status: 'invalid-input', message: '产品不可生成 BOM' }),
    };
    const service = new ProductionService(
      repository as never,
      products as never,
      {} as never,
      {} as never,
    );

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
    const service = new ProductionService({} as never, products as never, {} as never, {} as never);

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
    const service = new ProductionService(
      repository as never,
      products as never,
      {} as never,
      {} as never,
    );

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
    const service = new ProductionService(
      repository as never,
      products as never,
      {} as never,
      {} as never,
    );

    await expect(service.releaseWorkOrder('11', 4, audit)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: '产品已停用',
    });
  });

  it('forwards semantic work-order commands and normalizes close reasons', async () => {
    const repository = {
      cancelWorkOrder: vi.fn().mockResolvedValue({ id: '11', batches: [] }),
      completeWorkOrder: vi.fn().mockResolvedValue({ id: '11', batches: [] }),
      closeWorkOrder: vi.fn().mockResolvedValue({ id: '11', batches: [] }),
    };
    const service = new ProductionService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.cancelWorkOrder('11', 2, '  计划取消  ', audit);
    await service.completeWorkOrder('11', 3, audit);
    await service.closeWorkOrder('11', 4, '  计划调整  ', audit);

    expect(repository.cancelWorkOrder).toHaveBeenCalledWith('11', 2, '计划取消', audit);
    expect(repository.completeWorkOrder).toHaveBeenCalledWith('11', 3, audit);
    expect(repository.closeWorkOrder).toHaveBeenCalledWith('11', 4, '计划调整', audit);
  });

  it('requires a non-empty task cancellation reason', async () => {
    const repository = { cancelBatch: vi.fn() };
    const service = new ProductionService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.cancelBatch('8', 2, '   ', audit)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(repository.cancelBatch).not.toHaveBeenCalled();
  });

  it('preserves omitted remarks while forwarding an explicit null to clear it', async () => {
    const repository = {
      updateWorkOrder: vi.fn().mockResolvedValue({ id: '11', batches: [] }),
    };
    const service = new ProductionService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
    );

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
    const service = new ProductionService(
      repository as never,
      products as never,
      {} as never,
      {} as never,
    );
    const payload = { version: 4, productId: '9', plannedQuantity: 25.5 };

    await service.updateWorkOrder('11', payload, audit);

    expect(products.getProductionProduct).toHaveBeenCalledWith('9');
    expect(repository.updateWorkOrder).toHaveBeenCalledWith('11', payload, product, audit);
  });

  it('forwards the client version when generating immutable material demands', async () => {
    const repository = {
      hasGeneratedNormalMaterialDemands: vi.fn().mockResolvedValue(false),
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
    const service = new ProductionService(
      repository as never,
      products as never,
      {} as never,
      {} as never,
    );

    await service.generateMaterialDemands('6', 2, audit);

    expect(repository.generateMaterialDemands).toHaveBeenCalledWith(
      '6',
      2,
      expect.any(Object),
      audit,
    );
  });

  it('returns existing batch details without reading the current BOM after normal demands exist', async () => {
    const existing = validBatchDetail({ status: 'material_assigned', materialPlanVersion: 3 });
    const repository = {
      hasGeneratedNormalMaterialDemands: vi.fn().mockResolvedValue(true),
      getBatch: vi.fn().mockResolvedValue(existing),
      getBatchProductId: vi.fn(),
      generateMaterialDemands: vi.fn(),
    };
    const products = { getBomSnapshot: vi.fn() };
    const service = new ProductionService(
      repository as never,
      products as never,
      { listUserReferencesByIds: vi.fn().mockResolvedValue([]) } as never,
      {} as never,
    );

    await expect(service.generateMaterialDemands('6', 1, audit)).resolves.toMatchObject({
      id: '6',
      status: 'material_assigned',
    });
    expect(repository.getBatchProductId).not.toHaveBeenCalled();
    expect(products.getBomSnapshot).not.toHaveBeenCalled();
    expect(repository.generateMaterialDemands).not.toHaveBeenCalled();
  });

  it('rejects a production batch plan whose end date precedes its start date', async () => {
    const repository = { updateBatch: vi.fn() };
    const service = new ProductionService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
    );

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
    const service = new ProductionService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const payload = { version: 2, planStartDate: '2026-08-01', planEndDate: '2026-08-02' };

    await service.updateBatch('6', payload, audit);

    expect(repository.updateBatch).toHaveBeenCalledWith('6', payload, audit);
  });

  it('only accepts creation-time execution overrides for steps in the selected route', async () => {
    const repository = {
      withBatchCreationTransaction: vi.fn(async (_workOrderId, action) => action('8')),
    };
    const productDefinitions = {
      lockBomForProductionTask: vi.fn().mockResolvedValue({
        status: 'success',
        value: { id: '9', steps: [{ routeStepId: '41' }] },
      }),
    };
    const service = new ProductionService(
      repository as never,
      {} as never,
      {} as never,
      executingIdempotencyExecutor as never,
      productDefinitions as never,
    );

    await expect(
      service.createBatch(
        '6',
        {
          routeId: '9',
          plannedQuantity: 1,
          stepOverrides: [{ routeStepId: '42', actualSopFileId: null }],
        },
        idempotentAudit,
      ),
    ).rejects.toThrow('工序覆盖项不属于所选工艺路线');
  });

  it('resolves the default route and creates the batch inside one production transaction', async () => {
    const repository = {
      withBatchCreationTransaction: vi.fn(async (_workOrderId, action) => action('8')),
      createBatch: vi.fn().mockResolvedValue({ id: '6', ownerId: null, stepRecords: [] }),
    };
    const productDefinitions = {
      lockBomForProductionTask: vi.fn().mockResolvedValue({
        status: 'success',
        value: { id: '9', product: { id: '8' }, steps: [] },
      }),
    };
    const service = new ProductionService(
      repository as never,
      {} as never,
      {} as never,
      executingIdempotencyExecutor as never,
      productDefinitions as never,
    );

    await service.createBatch('6', { plannedQuantity: 1 }, idempotentAudit);

    expect(repository.withBatchCreationTransaction).toHaveBeenCalledWith('6', expect.any(Function));
    expect(productDefinitions.lockBomForProductionTask).toHaveBeenCalledWith('8', null, audit);
    expect(repository.createBatch).toHaveBeenCalledWith(
      '6',
      { plannedQuantity: 1, batchNo: null, remark: null },
      expect.objectContaining({ id: '9' }),
      [],
      audit,
    );
  });

  it('wraps createBatch in the idempotency executor with a stable scope and request snapshot', async () => {
    const repository = {
      withBatchCreationTransaction: vi.fn(async (_workOrderId, action) => action('8')),
      createBatch: vi.fn().mockResolvedValue({ id: '6', ownerId: null, stepRecords: [] }),
    };
    const productDefinitions = {
      lockBomForProductionTask: vi.fn().mockResolvedValue({
        status: 'success',
        value: { id: '9', product: { id: '8' }, steps: [] },
      }),
    };
    const captured: unknown[] = [];
    const capturingExecutor = {
      execute: vi.fn(async (command: { handler: () => Promise<unknown> }) => {
        captured.push(command);
        return { result: await command.handler(), isReplay: false };
      }),
    };
    const service = new ProductionService(
      repository as never,
      {} as never,
      {} as never,
      capturingExecutor as never,
      productDefinitions as never,
    );

    await service.createBatch(
      '6',
      { plannedQuantity: 3, batchNo: '  task_batch-001  ' },
      idempotentAudit,
    );

    expect(capturingExecutor.execute).toHaveBeenCalledOnce();
    const command = captured[0] as {
      scope: string;
      key: string;
      actorId: string;
      requestId: string;
      request: { params: { workOrderId: string }; body: unknown };
      resultCodec: { encode: (result: unknown) => unknown; decode: (stored: unknown) => unknown };
    };
    expect(command.scope).toBe(CREATE_BATCH_IDEMPOTENCY_SCOPE);
    expect(command.key).toBe('test-idempotency-key');
    expect(command.actorId).toBe('1');
    expect(command.requestId).toBe('test-request');
    expect(command.request.params).toEqual({ workOrderId: '6' });
    // body 必须是 DTO 转换与 trim 后的规范化载荷，才能与重放指纹一致
    expect(command.request.body).toEqual({
      plannedQuantity: 3,
      batchNo: 'task_batch-001',
      remark: null,
    });
    // codec 已改为完整嵌套校验：残缺对象（仅 id/batchNo）必须拒绝，不允许放行为伪 ProductionBatchDetail
    expect(() => command.resultCodec.decode({ id: '6', batchNo: 'x' })).toThrow();
  });

  it('负责人启用校验在 handler 内（首次执行）：负责人不可用时失败且不创建批次', async () => {
    const repository = {
      withBatchCreationTransaction: vi.fn(async (_id, action) => action('8')),
      createBatch: vi.fn().mockResolvedValue({ id: '6', ownerId: null, stepRecords: [] }),
    };
    const products = {
      getProductionRouteSnapshot: vi.fn().mockResolvedValue({
        status: 'success',
        value: { id: '9', product: { id: '8' }, steps: [] },
      }),
    };
    const identity = {
      listActiveUserOptionsByIds: vi.fn().mockResolvedValue([]),
    };
    const service = new ProductionService(
      repository as never,
      products as never,
      identity as never,
      executingIdempotencyExecutor as never,
    );

    await expect(
      service.createBatch('6', { plannedQuantity: 1, ownerId: '7' }, idempotentAudit),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: '负责人不存在或已停用',
    });
    expect(identity.listActiveUserOptionsByIds).toHaveBeenCalledWith(['7']);
    expect(repository.createBatch).not.toHaveBeenCalled();
  });

  it('重放不重新校验负责人：首次成功后负责人被停用，同键重试仍原样返回已保存快照', async () => {
    const repository = {
      withBatchCreationTransaction: vi.fn(async (_id, action) => action('8')),
      createBatch: vi.fn().mockResolvedValue({ id: '6', ownerId: null, stepRecords: [] }),
    };
    const products = {
      getProductionRouteSnapshot: vi.fn().mockResolvedValue({
        status: 'success',
        value: { id: '9', product: { id: '8' }, steps: [] },
      }),
    };
    const identity = {
      listActiveUserOptionsByIds: vi.fn().mockResolvedValue([]), // 负责人当前已停用
      listUserReferencesByIds: vi.fn().mockResolvedValue([]),
    };
    const replayingExecutor = {
      execute: vi.fn(async (command: { resultCodec: { decode: (v: unknown) => unknown } }) => ({
        result: command.resultCodec.decode(
          validBatchDetail({ ownerId: '7', ownerName: '首次成功时的负责人' }),
        ),
        isReplay: true,
      })),
    };
    const service = new ProductionService(
      repository as never,
      products as never,
      identity as never,
      replayingExecutor as never,
    );

    const result = await service.createBatch(
      '6',
      { plannedQuantity: 1, ownerId: '7', batchNo: 'task_batch-001' },
      idempotentAudit,
    );

    expect(replayingExecutor.execute).toHaveBeenCalledOnce();
    expect(repository.createBatch).not.toHaveBeenCalled();
    expect(identity.listActiveUserOptionsByIds).not.toHaveBeenCalled();
    expect(identity.listUserReferencesByIds).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: '6',
      ownerId: '7',
      ownerName: '首次成功时的负责人',
    });
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
    const service = new ProductionService(
      repository as never,
      {} as never,
      identity as never,
      {} as never,
    );

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
    const service = new ProductionService(
      repository as never,
      products as never,
      {} as never,
      {} as never,
    );

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
