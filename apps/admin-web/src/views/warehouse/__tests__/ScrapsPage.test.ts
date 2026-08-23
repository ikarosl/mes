import { flushPromises, mount } from '@vue/test-utils';
import { h, type VNode } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScrapsPage from '../ScrapsPage.vue';

const { listMaterialLosses } = vi.hoisted(() => ({ listMaterialLosses: vi.fn() }));
vi.mock('../../../api/warehouse', () => ({
  warehouseApi: {
    listMaterialLosses,
    listMaterialLossBatchOptions: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../../utils/message', () => ({
  EMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

const materialLoss = {
  id: '1',
  scrapNo: 'SH-001',
  batchNo: 'PB-001',
  workOrderNo: 'WO-001',
  productCode: 'FG-001',
  itemCode: 'RM-001',
  itemName: '原料',
  batchCode: 'IB-001',
  scrapQuantity: '1.0000',
  unit: '件',
  reasonType: '搬运损坏',
  status: 'pending' as const,
  supplement: null,
};
const tableColumnStub = {
  setup(_props: unknown, context: { slots: { default?: (scope: unknown) => unknown } }) {
    return () => h('div', [context.slots.default?.({ row: materialLoss })] as VNode[]);
  },
};
const inputNumberStub = {
  props: ['modelValue', 'min', 'max', 'precision'],
  emits: ['update:modelValue'],
  template: '<input type="number" :value="modelValue" :min="min" :max="max" />',
};

describe('ScrapsPage', () => {
  beforeEach(() => {
    listMaterialLosses.mockReset();
    listMaterialLosses.mockResolvedValue({
      items: [materialLoss],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });

  function mountPage() {
    return mount(ScrapsPage, {
      global: {
        stubs: {
          'el-form': { template: '<form><slot/></form>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-input': true,
          'el-input-number': inputNumberStub,
          'el-select': { template: '<div><slot/></div>' },
          'el-option': true,
          'el-button': { template: '<button><slot/></button>' },
          'el-alert': { props: ['title'], template: '<aside>{{ title }}</aside>' },
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': tableColumnStub,
          'el-pagination': true,
          'el-dialog': { template: '<div><slot/></div>' },
          'el-radio': true,
          'el-tag': { template: '<span><slot/></span>' },
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
        },
        directives: { loading: () => undefined },
      },
    });
  }

  it('opens only the production material-loss flow with unified table chrome', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(listMaterialLosses).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      keyword: undefined,
      status: undefined,
    });
    expect(wrapper.text()).toContain('申报领料损耗');
    expect(wrapper.text()).toContain('不回收或增加产品生产授权');
    expect(wrapper.text()).toContain('确认并补料');
    expect(wrapper.text()).not.toContain('库存报废管理暂未开放');
  });

  it('keeps scrap quantity input max not less than min when dialog opens without a candidate', async () => {
    const wrapper = mountPage();
    await flushPromises();

    const openButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('申报领料损耗'));
    expect(openButton).toBeTruthy();
    await openButton!.trigger('click');
    await flushPromises();

    const quantityInput = wrapper.find('input[type="number"]');
    expect(quantityInput.exists()).toBe(true);
    expect(quantityInput.attributes('min')).toBe('1');
    expect(quantityInput.attributes('step')).toBe('1');
    expect(Number(quantityInput.attributes('max'))).toBeGreaterThanOrEqual(
      Number(quantityInput.attributes('min')),
    );
  });
});
