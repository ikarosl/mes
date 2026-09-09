import { describe, expect, it, vi } from 'vitest';
import { ProductionMaterialDemandService } from '../production-material-demand.service.js';
import {
  ADD_MANUAL_MATERIAL_DEMAND_IDEMPOTENCY_SCOPE,
  CONFIGURE_MATERIAL_DEMANDS_IDEMPOTENCY_SCOPE,
} from '../idempotency/production-idempotency-scopes.contract.js';

const context = {
  actorId: '7',
  requestId: 'req-demand-1',
  ip: '127.0.0.1',
  userAgent: 'vitest',
  idempotencyKey: 'demand-key-1',
};

describe('ProductionMaterialDemandService', () => {
  it('normalizes a complete batch configuration and executes it under the registered scope', async () => {
    const repository = { configureNormalDemands: vi.fn().mockResolvedValue(undefined) };
    const executor = executingExecutor();
    const service = new ProductionMaterialDemandService(repository as never, executor as never);

    await expect(
      service.configure(
        '21',
        {
          requirements: [
            {
              productMaterialId: '100',
              splits: [
                { materialVariantId: 'v1', quantity: 6 },
                { materialVariantId: 'v2', quantity: '4' as never },
              ],
            },
          ],
        },
        context,
      ),
    ).resolves.toEqual({ configured: true });

    const command = executor.execute.mock.calls[0]?.[0] as unknown as {
      resultCodec: { scope: string };
    };
    expect(command).toMatchObject({
      scope: CONFIGURE_MATERIAL_DEMANDS_IDEMPOTENCY_SCOPE,
      key: 'demand-key-1',
      actorId: '7',
      requestId: 'req-demand-1',
      request: {
        params: { batchId: '21' },
        body: {
          requirements: [
            {
              productMaterialId: '100',
              splits: [
                { materialVariantId: 'v1', quantity: 6 },
                { materialVariantId: 'v2', quantity: 4 },
              ],
            },
          ],
        },
      },
    });
    expect(command.resultCodec.scope).toBe(CONFIGURE_MATERIAL_DEMANDS_IDEMPOTENCY_SCOPE);
    expect(repository.configureNormalDemands).toHaveBeenCalledWith(
      '21',
      [
        {
          productMaterialId: '100',
          splits: [
            { materialVariantId: 'v1', quantity: 6 },
            { materialVariantId: 'v2', quantity: 4 },
          ],
        },
      ],
      expect.not.objectContaining({ idempotencyKey: expect.anything() }),
    );
  });

  it('preserves a research task multi-version manual addition and trims its reason', async () => {
    const repository = {
      addManualDemand: vi.fn().mockResolvedValue({
        additionId: '31',
        additionNo: 'MD-1',
        demandIds: ['41', '42'],
      }),
    };
    const executor = executingExecutor();
    const service = new ProductionMaterialDemandService(repository as never, executor as never);

    await expect(
      service.addManual(
        '21',
        {
          requirements: [
            {
              productMaterialId: '100',
              splits: [
                { materialVariantId: 'v1', quantity: 2 },
                { materialVariantId: 'v2', quantity: 3 },
              ],
            },
          ],
          reason: ' 研发验证补料 ',
        },
        context,
      ),
    ).resolves.toEqual({ additionId: '31', additionNo: 'MD-1', demandIds: ['41', '42'] });

    expect(executor.execute.mock.calls[0]?.[0]).toMatchObject({
      scope: ADD_MANUAL_MATERIAL_DEMAND_IDEMPOTENCY_SCOPE,
      request: {
        params: { batchId: '21' },
        body: {
          productionBatchId: '21',
          reason: '研发验证补料',
        },
      },
    });
    expect(repository.addManualDemand).toHaveBeenCalledWith(
      {
        productionBatchId: '21',
        requirements: [
          {
            productMaterialId: '100',
            splits: [
              { materialVariantId: 'v1', quantity: 2 },
              { materialVariantId: 'v2', quantity: 3 },
            ],
          },
        ],
        reason: '研发验证补料',
      },
      expect.not.objectContaining({ idempotencyKey: expect.anything() }),
    );
  });

  it('returns a canonical replay result without invoking the configuration repository again', async () => {
    const repository = {
      configureNormalDemands: vi.fn(),
      addManualDemand: vi.fn(),
    };
    const replay = { additionId: '31', additionNo: 'MD-1', demandIds: ['41'] };
    const executor = { execute: vi.fn().mockResolvedValue({ result: replay, isReplay: true }) };
    const service = new ProductionMaterialDemandService(repository as never, executor as never);

    await expect(
      service.addManual('21', { requirements: [], reason: '重试' }, context),
    ).resolves.toBe(replay);
    expect(repository.addManualDemand).not.toHaveBeenCalled();
    expect(executor.execute).toHaveBeenCalledOnce();
  });

  it('does not manufacture a partial result when the normal-demand transaction fails', async () => {
    const repository = {
      configureNormalDemands: vi.fn().mockRejectedValue(new Error('transaction rolled back')),
    };
    const executor = executingExecutor();
    const service = new ProductionMaterialDemandService(repository as never, executor as never);

    await expect(
      service.configure(
        '21',
        {
          requirements: [
            { productMaterialId: '100', splits: [{ materialVariantId: 'v1', quantity: 10 }] },
          ],
        },
        context,
      ),
    ).rejects.toThrow('transaction rolled back');
  });

  it('does not manufacture a partial result when manual addition persistence fails', async () => {
    const repository = {
      addManualDemand: vi.fn().mockRejectedValue(new Error('audit rolled back')),
    };
    const executor = executingExecutor();
    const service = new ProductionMaterialDemandService(repository as never, executor as never);

    await expect(
      service.addManual(
        '21',
        {
          requirements: [
            { productMaterialId: '100', splits: [{ materialVariantId: 'v1', quantity: 1 }] },
          ],
          reason: '补料',
        },
        context,
      ),
    ).rejects.toThrow('audit rolled back');
  });

  it('rejects an empty manual-addition reason before idempotency registration', async () => {
    const repository = { addManualDemand: vi.fn() };
    const executor = { execute: vi.fn() };
    const service = new ProductionMaterialDemandService(repository as never, executor as never);

    await expect(
      service.addManual('21', { requirements: [], reason: '   ' }, context),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(executor.execute).not.toHaveBeenCalled();
    expect(repository.addManualDemand).not.toHaveBeenCalled();
  });
});

const executingExecutor = () => ({
  execute: vi.fn(async (command: { handler: () => Promise<unknown> }) => ({
    result: await command.handler(),
    isReplay: false,
  })),
});
