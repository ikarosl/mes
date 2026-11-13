import { describe, expect, it, vi } from 'vitest';
import type { ProductionBatchDetail } from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../../common/audit/audit.types.js';
import { ProductionService } from '../production.service.js';

const audit: CommandContext = {
  actorId: '1',
  ip: '127.0.0.1',
  requestId: 'test-request',
  userAgent: null,
};
const eligibleOwners = { requireEligible: async () => undefined };

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
  orderType: 'mass_production',
  productId: '3',
  productCode: 'P-001',
  productName: '测试产品',
  batchNo: 'task_batch-001',
  routeId: null,
  routeCode: null,
  routeVersion: null,
  plannedQuantity: '1.0000',
  planStartDate: null,
  planEndDate: null,
  startedAt: null,
  startedById: null,
  startedByName: null,
  status: 'pending',
  finalOutput: {
    availableQuantity: '0',
    confirmedOutputCount: 0,
    inboundQuantity: '0',
    pendingInboundQuantity: '0',
  },
  finishReason: null,
  finishMode: null,
  ownerId: null,
  ownerName: null,
  completedAt: null,
  completedBy: null,
  cancelReason: null,
  cancelledBy: null,
  cancelledByName: null,
  cancelledAt: null,
  remark: null,
  version: 0,
  createdAt: '2026-08-01T00:00:00+08:00',
  updatedAt: '2026-08-01T00:00:00+08:00',
  ...overrides,
});

describe('ProductionService first-stage commands', () => {
  it('maps a product public query failure to HTTP 404', async () => {
    const products = {
      getProductionProduct: vi
        .fn()
        .mockResolvedValue({ status: 'not-found', message: '产品不存在' }),
    };
    const service = new ProductionService(
      {} as never,
      products as never,
      {} as never,
      executingIdempotencyExecutor as never,
      eligibleOwners as never,
      eligibleOwners as never,
    );

    await expect(
      service.createWorkOrder(
        {
          productId: '8',
          orderType: 'mass_production',
          plannedQuantity: 1,
          planStartDate: '2026-08-01',
          planEndDate: '2026-08-31',
        },
        idempotentAudit,
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
      eligibleOwners as never,
      eligibleOwners as never,
    );

    await expect(service.listWorkOrderOptions()).resolves.toEqual(options);
    expect(repository.listWorkOrderOptions).toHaveBeenCalledWith();
  });

  // TODO(production-step-update-retirement): 验证已创建任务的执行参数变更边界；高重要性，旧任务工序参数更新端点已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按追踪卡快照与更正边界恢复。

  it('re-reads the active product and freezes its snapshot inside the release transaction', async () => {
    const repository = {
      withWorkOrderReleaseTransaction: vi.fn(async (_id, action) =>
        action({ productId: '8', workOrderOwnerId: '9' }),
      ),
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
      eligibleOwners as never,
      eligibleOwners as never,
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
      withWorkOrderReleaseTransaction: vi.fn(async (_id, action) =>
        action({ productId: '8', workOrderOwnerId: '9' }),
      ),
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
      eligibleOwners as never,
      eligibleOwners as never,
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
      eligibleOwners as never,
      eligibleOwners as never,
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
      eligibleOwners as never,
      eligibleOwners as never,
    );

    await expect(service.cancelBatch('8', 2, '   ', audit)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(repository.cancelBatch).not.toHaveBeenCalled();
  });

  it('preserves omitted remarks while forwarding an explicit null to clear it', async () => {
    const repository = {
      withWorkOrderUpdateTransaction: vi.fn(async (_id, action) =>
        action({ workOrderOwnerId: null }),
      ),
      updateWorkOrder: vi.fn().mockResolvedValue({ id: '11', batches: [] }),
    };
    const service = new ProductionService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      eligibleOwners as never,
      eligibleOwners as never,
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
      withWorkOrderUpdateTransaction: vi.fn(async (_id, action) =>
        action({ workOrderOwnerId: null }),
      ),
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
      eligibleOwners as never,
      eligibleOwners as never,
    );
    const payload = { version: 4, productId: '9', plannedQuantity: 25.5 };

    await service.updateWorkOrder('11', payload, audit);

    expect(products.getProductionProduct).toHaveBeenCalledWith('9');
    expect(repository.updateWorkOrder).toHaveBeenCalledWith('11', payload, product, audit);
  });

  it('rejects a production batch plan whose end date precedes its start date', async () => {
    const repository = { updateBatch: vi.fn() };
    const service = new ProductionService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      eligibleOwners as never,
      eligibleOwners as never,
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
    const repository = {
      withBatchUpdateTransaction: vi.fn(async (_id, action) =>
        action({ ownerId: '7', version: 2 }),
      ),
      updateBatch: vi.fn().mockResolvedValue({ id: '6' }),
    };
    const service = new ProductionService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      eligibleOwners as never,
      eligibleOwners as never,
    );
    const payload = { version: 2, planStartDate: '2026-08-01', planEndDate: '2026-08-02' };

    await service.updateBatch('6', payload, audit);

    expect(repository.updateBatch).toHaveBeenCalledWith('6', payload, audit);
  });

  // TODO(test-migration): 验证下达时选定路线快照与任务状态写入处于同一事务；高重要性：生产定义和任务原子性。
  // 旧用例依赖默认路线及创建快照，当前暂停；用户明确授权正式测试后按独立下达和合格任务负责人恢复。

  // TODO(production-draft-create-idempotency): 验证草稿创建使用稳定 scope、规范化请求快照及完整幂等结果校验；高重要性：幂等指纹与响应一致性，创建即冻结路线工序的旧首次执行旅程已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按草稿仅存路线引用及独立下达恢复。

  // TODO(task-owner-eligibility): 验证首次创建在任务写入事务内复核负责人资格，失败不创建任务或成功审计。
  // 高重要性：写入资格和事务原子性；旧用例仅模拟通用启用用户，已不能覆盖任务负责人场景。
  // 用户明确授权正式测试后，按场景角色配置、工单锁序及 UserCandidateService 资格边界恢复。

  it('重放不重新校验负责人：首次成功后负责人被停用，同键重试仍原样返回已保存快照', async () => {
    const repository = {
      createBatch: vi.fn(),
    };
    const identity = {
      listUserReferencesByIds: vi.fn().mockResolvedValue([]),
    };
    const taskOwners = { requireEligible: vi.fn() };
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
      {} as never,
      identity as never,
      replayingExecutor as never,
      eligibleOwners as never,
      taskOwners as never,
    );

    const result = await service.createBatch(
      '6',
      { plannedQuantity: 1, ownerId: '7', routeId: '9' },
      idempotentAudit,
    );

    expect(replayingExecutor.execute).toHaveBeenCalledOnce();
    expect(repository.createBatch).not.toHaveBeenCalled();
    expect(taskOwners.requireEligible).not.toHaveBeenCalled();
    expect(identity.listUserReferencesByIds).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: '6',
      ownerId: '7',
      ownerName: '首次成功时的负责人',
    });
  });

  // TODO(test-migration): 验证任务历史人员引用通过一次批量 Identity 查询解析；高重要性：历史身份一致性。
  // 旧用例依赖合并工序响应，当前暂停；用户明确授权正式测试后按任务概览和独立工序契约恢复。

  // TODO(production-task-route-eligibility): 验证草稿路线引用和正式下达资格失败经 Product 公开边界映射为稳定错误且不写任务事实；高重要性：跨模块写入资格，创建即核验批准 BOM 的旧旅程已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，分别按草稿路线核验与下达生产定义核验恢复。

  // TODO(production-task-release-step-overrides): 验证下达覆盖项只属于选定路线且 SOP 来源当前合格，失败不保存工序快照；高重要性：执行依据与事务边界，创建时配置工序覆盖的旧行为已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按独立下达一次冻结工序的契约恢复。
});
