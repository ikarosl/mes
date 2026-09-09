import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from '@company/request';
import { useProductionMaterials } from '../useProductionMaterials';

const api = vi.hoisted(() => ({
  listMaterialDemands: vi.fn(),
  listAvailableItemBatches: vi.fn(),
  listMaterialOutbounds: vi.fn(),
  releaseMaterialAllocation: vi.fn(),
  createMaterialAllocations: vi.fn(),
  createMaterialOutbound: vi.fn(),
}));
vi.mock('../../../../api/production', () => ({ productionApi: api }));

describe('useProductionMaterials', () => {
  beforeEach(() => Object.values(api).forEach((mock) => mock.mockReset()));
  it('discards a late demand response after switching batches', async () => {
    let resolveA!: (value: unknown[]) => void;
    api.listMaterialDemands.mockImplementation((id: string) =>
      id === 'A'
        ? new Promise((resolve) => {
            resolveA = resolve;
          })
        : Promise.resolve([]),
    );
    const state = useProductionMaterials();
    state.setBatch('A');
    const a = state.loadDemands();
    state.setBatch('B');
    await state.loadDemands();
    resolveA([{ demandId: 'old' }]);
    await a;
    expect(state.demands.value).toEqual([]);
  });
  it('uses row-level release pending state and refreshes only material demands', async () => {
    api.releaseMaterialAllocation.mockResolvedValue({});
    api.listMaterialDemands.mockResolvedValue([]);
    const state = useProductionMaterials();
    state.setBatch('1');
    await state.release('9', 2);
    expect(api.releaseMaterialAllocation).toHaveBeenCalledWith('1', '9', 2);
    expect(state.releasePendingIds.value.size).toBe(0);
    expect(api.listMaterialOutbounds).not.toHaveBeenCalled();
  });
  it('retains an unknown allocation intent so dialog close and batch switch can be guarded', async () => {
    api.createMaterialAllocations.mockRejectedValue(new RequestError('网络断开', 0));
    const state = useProductionMaterials();
    state.setBatch('1');
    await expect(
      state.allocate({
        allocations: [{ demandId: '2', itemBatchId: '3', assignedQuantity: 1 }],
      }),
    ).rejects.toThrow('网络断开');
    expect(state.getAllocationIntentStatus()).toBe('pending');
  });

  it('forwards one idempotency key for allocation and refreshes only material demands', async () => {
    api.createMaterialAllocations.mockResolvedValue({});
    api.listMaterialDemands.mockResolvedValue([]);
    const state = useProductionMaterials();
    state.setBatch('batch-1');

    await state.allocate({
      allocations: [
        { demandId: 'd-1', itemBatchId: 'ib-1', assignedQuantity: 2, remark: '  预留  ' },
      ],
    });

    expect(api.createMaterialAllocations).toHaveBeenCalledWith(
      'batch-1',
      {
        allocations: [
          { demandId: 'd-1', itemBatchId: 'ib-1', assignedQuantity: 2, remark: '预留' },
        ],
      },
      expect.any(String),
    );
    expect(api.listMaterialDemands).toHaveBeenCalledWith('batch-1');
    expect(api.listMaterialOutbounds).not.toHaveBeenCalled();
    expect(state.getAllocationIntentStatus()).toBe('idle');
  });

  it('does not send a duplicate allocation while the first confirmation is pending', async () => {
    let resolveAllocation!: (value: unknown) => void;
    api.createMaterialAllocations.mockReturnValue(
      new Promise((resolve) => {
        resolveAllocation = resolve;
      }),
    );
    api.listMaterialDemands.mockResolvedValue([]);
    const state = useProductionMaterials();
    state.setBatch('batch-1');
    const payload = {
      allocations: [{ demandId: 'd-1', itemBatchId: 'ib-1', assignedQuantity: 1 }],
    };

    const first = state.allocate(payload);
    const second = state.allocate(payload);
    expect(api.createMaterialAllocations).toHaveBeenCalledTimes(1);
    expect(state.submitting.value).toBe(true);

    resolveAllocation({});
    await Promise.all([first, second]);
    expect(state.submitting.value).toBe(false);
  });

  it('guards a duplicate release while the first confirmation is still pending', async () => {
    let resolveRelease!: (value: unknown) => void;
    api.releaseMaterialAllocation.mockReturnValue(
      new Promise((resolve) => {
        resolveRelease = resolve;
      }),
    );
    api.listMaterialDemands.mockResolvedValue([]);
    const state = useProductionMaterials();
    state.setBatch('batch-1');

    const first = state.release('allocation-1', 3);
    const second = state.release('allocation-1', 3);
    expect(api.releaseMaterialAllocation).toHaveBeenCalledTimes(1);
    expect(state.releasePendingIds.value).toEqual(new Set(['allocation-1']));

    resolveRelease({});
    await Promise.all([first, second]);
    expect(state.releasePendingIds.value).toEqual(new Set());
    expect(api.listMaterialDemands).toHaveBeenCalledTimes(1);
  });

  it('drops a late available-batch response after a newer demand selection', async () => {
    let resolveOld!: (value: unknown[]) => void;
    api.listAvailableItemBatches.mockImplementation((demandId: string) =>
      demandId === 'old-demand'
        ? new Promise((resolve) => (resolveOld = resolve))
        : Promise.resolve([{ itemBatchId: 'new-batch' }]),
    );
    const state = useProductionMaterials();

    const oldRequest = state.loadAvailable('old-demand');
    await state.loadAvailable('new-demand');
    resolveOld([{ itemBatchId: 'old-batch' }]);
    await oldRequest;

    expect(state.availableItemBatches.value).toEqual([{ itemBatchId: 'new-batch' }]);
  });

  it('uses the same idempotency key for outbound retry and refreshes demands plus outbounds', async () => {
    api.createMaterialOutbound.mockResolvedValue({});
    api.listMaterialDemands.mockResolvedValue([]);
    api.listMaterialOutbounds.mockResolvedValue([]);
    const state = useProductionMaterials();
    state.setBatch('batch-1');

    await state.outbound({
      details: [{ allocationId: 'allocation-1', outboundQuantity: 2 }],
      remark: '  领料  ',
    });

    expect(api.createMaterialOutbound).toHaveBeenCalledWith(
      'batch-1',
      { details: [{ allocationId: 'allocation-1', outboundQuantity: 2 }], remark: '领料' },
      expect.any(String),
    );
    expect(api.listMaterialDemands).toHaveBeenCalledWith('batch-1');
    expect(api.listMaterialOutbounds).toHaveBeenCalledWith('batch-1');
    expect(state.getOutboundIntentStatus()).toBe('idle');
  });
});
