import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from '@company/request';
import ManualMaterialDemandDialog from '../ManualMaterialDemandDialog.vue';

const { loadBatchMaterialDemands, addManualMaterialDemands, error, success } = vi.hoisted(() => ({
  loadBatchMaterialDemands: vi.fn(),
  addManualMaterialDemands: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock('../../composables/loadBatchMaterialDemands', () => ({ loadBatchMaterialDemands }));
vi.mock('../../../../api/production', () => ({
  productionApi: { addManualMaterialDemands },
}));
vi.mock('../../../../utils/message', () => ({ EMessage: { error, success } }));

const variant = (id: string, code: string) => ({
  materialVariantId: id,
  materialVariantCode: code,
  majorVersion: 'v1',
  minorVersion: code,
  selectedQuantity: null,
  status: 1,
});

const demandRow = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'basis-1',
    productionBatchId: 'batch-1',
    batchNo: 'PB-1',
    workOrderNo: 'WO-1',
    orderType: 'mass_production',
    requirementBasisId: 'basis-1',
    productMaterialId: 'pm-1',
    materialId: 'm-1',
    materialCode: 'M-1',
    materialName: '物料一',
    unit: 'pcs',
    requiredQuantity: '5',
    configuredQuantity: '5',
    lockedMaterialVariantId: 'mv-1',
    status: 'configured',
    demands: [],
    variants: [variant('mv-1', 'M-1-v1'), variant('mv-2', 'M-1-v2')],
    ...overrides,
  }) as never;

const batch = (id = 'batch-1') =>
  ({
    id,
    batchNo: id === 'batch-1' ? 'PB-1' : 'PB-2',
    status: 'doing',
    workOrderNo: 'WO-1',
    productCode: 'FG-1',
    productName: '成品一',
  }) as never;

const dialogStub = { template: '<div><slot /><slot name="footer" /></div>' };
const passthrough = { template: '<div><slot /></div>' };
const buttonStub = {
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
};

const mountDialog = (props: Record<string, unknown> = {}) =>
  mount(ManualMaterialDemandDialog, {
    props: {
      visible: false,
      batch: batch(),
      ...props,
    },
    global: {
      stubs: {
        'el-dialog': dialogStub,
        'el-alert': passthrough,
        'el-form': passthrough,
        'el-form-item': passthrough,
        'el-empty': true,
        'el-table': { template: '<div class="table-stub" />' },
        'el-table-column': true,
        'el-select': true,
        'el-option': true,
        'el-input': true,
        'el-input-number': true,
        'el-checkbox': true,
        'el-button': buttonStub,
      },
      directives: { loading: () => undefined },
    },
  });

type ManualVm = {
  rows: Array<{
    productionBatchId: string;
    productMaterialId: string;
    selected: boolean;
    splits: Array<{ materialVariantId: string; quantity: number }>;
  }>;
  reason: string;
  loading: boolean;
  canSubmit: boolean;
  submit: () => Promise<void>;
  intent: { getStatus: () => string };
};

describe('ManualMaterialDemandDialog', () => {
  beforeEach(() => {
    loadBatchMaterialDemands.mockReset();
    addManualMaterialDemands.mockReset().mockResolvedValue({
      additionId: 'addition-1',
      additionNo: 'ADD-001',
      demandIds: ['demand-1'],
    });
    error.mockReset();
    success.mockReset();
  });

  it('loads complete BOM candidates without selecting any row or version by default', async () => {
    loadBatchMaterialDemands.mockResolvedValue([
      demandRow(),
      demandRow({
        id: 'basis-2',
        productionBatchId: 'batch-1',
        productMaterialId: 'pm-2',
        materialId: 'm-2',
        orderType: 'research',
        lockedMaterialVariantId: null,
      }),
    ]);
    const wrapper = mountDialog();

    await wrapper.setProps({ visible: true });
    await flushPromises();

    const vm = wrapper.vm as unknown as ManualVm;
    expect(loadBatchMaterialDemands).toHaveBeenCalledWith('batch-1');
    expect(vm.rows.map((row) => row.selected)).toEqual([false, false]);
    expect(vm.rows[0]!.splits[0]).toEqual({ materialVariantId: 'mv-1', quantity: 1 });
    expect(vm.rows[1]!.splits[0]).toEqual({ materialVariantId: '', quantity: 1 });
    expect(vm.canSubmit).toBe(false);
  });

  it('requires a reason and selected complete version rows before creating an addition', async () => {
    loadBatchMaterialDemands.mockResolvedValue([
      demandRow({ orderType: 'research', lockedMaterialVariantId: null }),
    ]);
    const wrapper = mountDialog();
    await wrapper.setProps({ visible: true });
    await flushPromises();

    const vm = wrapper.vm as unknown as ManualVm;
    expect(vm.canSubmit).toBe(false);
    vm.rows[0]!.selected = true;
    vm.rows[0]!.splits[0]!.materialVariantId = 'mv-1';
    vm.rows[0]!.splits[0]!.quantity = 2;
    await nextTick();
    expect(vm.canSubmit).toBe(false);
    vm.reason = '  补充试制用料  ';
    await nextTick();

    expect(vm.canSubmit).toBe(true);
    await vm.submit();

    expect(addManualMaterialDemands).toHaveBeenCalledWith(
      'batch-1',
      {
        reason: '补充试制用料',
        requirements: [
          {
            productMaterialId: 'pm-1',
            splits: [{ materialVariantId: 'mv-1', quantity: 2 }],
          },
        ],
      },
      expect.any(String),
    );
    expect(success).toHaveBeenCalledWith('人工追加需求 ADD-001 已生成');
    expect(wrapper.emitted('update:visible')).toEqual([[false]]);
    expect(wrapper.emitted('added')).toEqual([[]]);
  });

  it('keeps the original rows and blocks saving after the critical BOM load fails', async () => {
    const failure = new Error('load failed');
    loadBatchMaterialDemands.mockRejectedValue(failure);
    const wrapper = mountDialog();

    await wrapper.setProps({ visible: true });
    await flushPromises();

    const vm = wrapper.vm as unknown as ManualVm;
    expect(vm.rows).toEqual([]);
    expect(vm.loading).toBe(false);
    expect(vm.canSubmit).toBe(false);
    expect(error).toHaveBeenCalledWith(failure, '人工追加候选加载失败');
    await vm.submit();
    expect(addManualMaterialDemands).not.toHaveBeenCalled();
  });

  it('drops a late candidate response after switching batches', async () => {
    let resolveFirst!: (rows: unknown[]) => void;
    loadBatchMaterialDemands.mockImplementation((id: string) =>
      id === 'batch-1'
        ? new Promise((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve([demandRow({ productionBatchId: 'batch-2', id: 'basis-2' })]),
    );
    const wrapper = mountDialog();

    await wrapper.setProps({ visible: true });
    await wrapper.setProps({ batch: batch('batch-2') });
    await flushPromises();
    const vm = wrapper.vm as unknown as ManualVm;
    expect(vm.rows[0]?.productionBatchId).toBe('batch-2');

    resolveFirst([demandRow({ productionBatchId: 'batch-1' })]);
    await flushPromises();
    expect(vm.rows[0]?.productionBatchId).toBe('batch-2');
  });

  it('passes and reuses one idempotency key across an ambiguous retry', async () => {
    loadBatchMaterialDemands.mockResolvedValue([demandRow()]);
    addManualMaterialDemands
      .mockRejectedValueOnce(new RequestError('network', 500))
      .mockResolvedValueOnce({ additionId: 'addition-1', additionNo: 'ADD-001', demandIds: [] });
    const wrapper = mountDialog();
    await wrapper.setProps({ visible: true });
    await flushPromises();

    const vm = wrapper.vm as unknown as ManualVm;
    vm.rows[0]!.selected = true;
    vm.reason = '现场余料补充';
    vm.rows[0]!.splits[0]!.materialVariantId = 'mv-1';
    await nextTick();
    await vm.submit();
    await vm.submit();

    expect(addManualMaterialDemands).toHaveBeenCalledTimes(2);
    expect(addManualMaterialDemands.mock.calls[0]![2]).toBe(
      addManualMaterialDemands.mock.calls[1]![2],
    );
    expect(vm.intent.getStatus()).toBe('idle');
    expect(error).toHaveBeenCalledWith(expect.any(RequestError), '人工追加需求生成失败');
  });
});
