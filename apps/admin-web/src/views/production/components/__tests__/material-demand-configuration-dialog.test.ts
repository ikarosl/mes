import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from '@company/request';
import MaterialDemandConfigurationDialog from '../MaterialDemandConfigurationDialog.vue';

const { loadBatchMaterialDemands, configureMaterialDemands, error, success, confirm } = vi.hoisted(
  () => ({
    loadBatchMaterialDemands: vi.fn(),
    configureMaterialDemands: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    confirm: vi.fn(),
  }),
);
vi.mock('../../composables/loadBatchMaterialDemands', () => ({ loadBatchMaterialDemands }));
vi.mock('../../../../api/production', () => ({
  productionApi: { configureMaterialDemands },
}));
vi.mock('../../../../utils/message', () => ({ EMessage: { error, success } }));
vi.mock('../../../../utils/route-message-box', () => ({
  RouteMessageBox: { confirm },
}));

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
    configuredQuantity: '0',
    lockedMaterialVariantId: 'mv-1',
    status: 'pending',
    demands: [],
    variants: [variant('mv-1', 'M-1-v1'), variant('mv-2', 'M-1-v2')],
    ...overrides,
  }) as never;

const batch = (id = 'batch-1') =>
  ({
    id,
    batchNo: id === 'batch-1' ? 'PB-1' : 'PB-2',
    status: 'pending',
    workOrderNo: 'WO-1',
    productCode: 'FG-1',
    productName: '成品一',
  }) as never;

const passthrough = { template: '<div><slot /></div>' };
const dialogStub = { template: '<div><slot /><slot name="footer" /></div>' };
const buttonStub = {
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
};

const mountDialog = (props: Record<string, unknown> = {}) =>
  mount(MaterialDemandConfigurationDialog, {
    props: {
      visible: false,
      batch: batch(),
      ...props,
    },
    global: {
      stubs: {
        'el-dialog': dialogStub,
        'el-alert': passthrough,
        'el-empty': true,
        'el-table': { template: '<div class="table-stub" />' },
        'el-table-column': true,
        'el-select': true,
        'el-option': true,
        'el-input-number': true,
        'el-button': buttonStub,
      },
      directives: { loading: () => undefined },
    },
  });

type ConfigurationVm = {
  rows: Array<{
    productionBatchId: string;
    productMaterialId: string;
    requiredQuantity: string;
    splits: Array<{ materialVariantId: string; quantity: number }>;
  }>;
  loading: boolean;
  canSubmit: boolean;
  configuredTotal: (row: ConfigurationVm['rows'][number]) => number;
  addSplit: (row: ConfigurationVm['rows'][number]) => void;
  availableVariants: (
    row: ConfigurationVm['rows'][number],
    index: number,
  ) => Array<{ materialVariantId: string }>;
  submit: () => Promise<void>;
  close: () => Promise<void>;
  intent: { getStatus: () => string };
};

describe('MaterialDemandConfigurationDialog', () => {
  beforeEach(() => {
    loadBatchMaterialDemands.mockReset();
    configureMaterialDemands.mockReset().mockResolvedValue({ configured: true });
    error.mockReset();
    success.mockReset();
    confirm.mockReset().mockResolvedValue(true);
  });

  it('loads all BOM rows on open, locks mass-production versions, and leaves research versions unselected', async () => {
    loadBatchMaterialDemands.mockResolvedValue([
      demandRow(),
      demandRow({
        id: 'basis-2',
        productMaterialId: 'pm-2',
        materialId: 'm-2',
        materialCode: 'M-2',
        materialName: '物料二',
        orderType: 'research',
        lockedMaterialVariantId: null,
      }),
    ]);
    const wrapper = mountDialog();

    await wrapper.setProps({ visible: true });
    await flushPromises();

    const vm = wrapper.vm as unknown as ConfigurationVm;
    expect(loadBatchMaterialDemands).toHaveBeenCalledWith('batch-1');
    expect(vm.rows).toHaveLength(2);
    expect(vm.rows[0]!.splits).toEqual([{ materialVariantId: 'mv-1', quantity: 5 }]);
    expect(vm.rows[1]!.splits).toEqual([{ materialVariantId: '', quantity: 1 }]);
    expect(vm.canSubmit).toBe(false);
  });

  it('requires complete research quantities, keeps versions unique, and submits the split payload', async () => {
    loadBatchMaterialDemands.mockResolvedValue([
      demandRow({ orderType: 'research', lockedMaterialVariantId: null }),
    ]);
    const wrapper = mountDialog();
    await wrapper.setProps({ visible: true });
    await flushPromises();

    const vm = wrapper.vm as unknown as ConfigurationVm;
    const row = vm.rows[0]!;
    row.splits[0]!.materialVariantId = 'mv-1';
    row.splits[0]!.quantity = 2;
    await nextTick();
    expect(vm.canSubmit).toBe(false);
    vm.addSplit(row);
    row.splits[1]!.materialVariantId = 'mv-2';
    row.splits[1]!.quantity = 3;
    await nextTick();

    expect(vm.configuredTotal(row)).toBe(5);
    expect(vm.availableVariants(row, 0).map((item) => item.materialVariantId)).toEqual(['mv-1']);
    expect(vm.canSubmit).toBe(true);

    await vm.submit();

    expect(configureMaterialDemands).toHaveBeenCalledTimes(1);
    expect(configureMaterialDemands).toHaveBeenCalledWith(
      'batch-1',
      {
        requirements: [
          {
            productMaterialId: 'pm-1',
            splits: [
              { materialVariantId: 'mv-1', quantity: 2 },
              { materialVariantId: 'mv-2', quantity: 3 },
            ],
          },
        ],
      },
      expect.any(String),
    );
    expect(wrapper.emitted('update:visible')).toEqual([[false]]);
    expect(wrapper.emitted('configured')).toEqual([[]]);
  });

  it('does not save after a critical BOM load failure', async () => {
    const failure = new Error('load failed');
    loadBatchMaterialDemands.mockRejectedValue(failure);
    const wrapper = mountDialog();

    await wrapper.setProps({ visible: true });
    await flushPromises();

    const vm = wrapper.vm as unknown as ConfigurationVm;
    expect(vm.rows).toEqual([]);
    expect(vm.loading).toBe(false);
    expect(vm.canSubmit).toBe(false);
    expect(error).toHaveBeenCalledWith(failure, '初始物料需求加载失败');

    await vm.submit();
    expect(configureMaterialDemands).not.toHaveBeenCalled();
  });

  it('drops a late response after switching to another batch', async () => {
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
    const vm = wrapper.vm as unknown as ConfigurationVm;
    expect(vm.rows[0]?.productionBatchId).toBe('batch-2');

    resolveFirst([demandRow({ productionBatchId: 'batch-1' })]);
    await flushPromises();
    expect(vm.rows[0]?.productionBatchId).toBe('batch-2');
  });

  it('drops a late response after the dialog closes', async () => {
    let resolveLoad!: (rows: unknown[]) => void;
    loadBatchMaterialDemands.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const wrapper = mountDialog();

    await wrapper.setProps({ visible: true });
    await wrapper.setProps({ visible: false });
    resolveLoad([demandRow()]);
    await flushPromises();

    const vm = wrapper.vm as unknown as ConfigurationVm;
    expect(vm.rows).toEqual([]);
    expect(error).not.toHaveBeenCalled();
  });

  it('passes one idempotency key through an ambiguous failure and keeps it for a safe retry', async () => {
    loadBatchMaterialDemands.mockResolvedValue([demandRow()]);
    configureMaterialDemands
      .mockRejectedValueOnce(new RequestError('network', 500))
      .mockResolvedValueOnce({ configured: true });
    const wrapper = mountDialog();
    await wrapper.setProps({ visible: true });
    await flushPromises();

    const vm = wrapper.vm as unknown as ConfigurationVm;
    await vm.submit();
    await vm.submit();

    expect(configureMaterialDemands).toHaveBeenCalledTimes(2);
    expect(configureMaterialDemands.mock.calls[0]![2]).toBe(
      configureMaterialDemands.mock.calls[1]![2],
    );
    expect(vm.intent.getStatus()).toBe('idle');
    expect(error).toHaveBeenCalledWith(expect.any(RequestError), '初始物料需求生成失败');
  });

  it('keeps an ambiguous intent when close confirmation is cancelled', async () => {
    loadBatchMaterialDemands.mockResolvedValue([demandRow()]);
    configureMaterialDemands.mockRejectedValueOnce(new RequestError('network', 500));
    const wrapper = mountDialog();
    await wrapper.setProps({ visible: true });
    await flushPromises();

    const vm = wrapper.vm as unknown as ConfigurationVm;
    await vm.submit();
    confirm.mockRejectedValueOnce('cancel');
    await vm.close();

    expect(wrapper.emitted('update:visible')).toBeUndefined();
    expect(vm.intent.getStatus()).toBe('pending');

    confirm.mockResolvedValueOnce(true);
    await vm.close();
    expect(wrapper.emitted('update:visible')).toEqual([[false]]);
    expect(vm.intent.getStatus()).toBe('idle');
  });
});
