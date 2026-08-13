import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import InboundOrdersPage from '../InboundOrdersPage.vue';

vi.mock('../../../api/product', () => ({
  productApi: { productOptions: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../production/composables/usePurchaseInbounds', () => ({
  usePurchaseInbounds: () => ({
    rows: ref([]),
    total: ref(0),
    loading: ref(false),
    detail: ref(null),
    load: vi.fn().mockResolvedValue(undefined),
    loadDetail: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
    isConfirmPending: vi.fn().mockReturnValue(false),
    createPending: ref(false),
  }),
}));

describe('InboundOrdersPage', () => {
  it('uses the current query/table layout and exposes only purchased-material inbound actions', () => {
    const wrapper = mount(InboundOrdersPage, {
      global: {
        stubs: {
          'el-form': { template: '<form><slot/></form>' },
          'el-form-item': { template: '<div><slot/></div>' },
          'el-input': true,
          'el-select': { template: '<div><slot/></div>' },
          'el-option': true,
          'el-button': { template: '<button><slot/></button>' },
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': true,
          'el-pagination': true,
          'el-dialog': true,
          'el-tag': true,
          'el-alert': true,
          'el-input-number': true,
          'el-row': { template: '<div><slot/></div>' },
          'el-col': { template: '<div><slot/></div>' },
          'el-descriptions': { template: '<div><slot/></div>' },
          'el-descriptions-item': { template: '<div><slot/></div>' },
          TableToolbar: { template: '<div><slot name="actions"/><slot name="tools"/></div>' },
        },
        directives: { loading: () => undefined },
      },
    });
    expect(wrapper.find('.inbound-page').exists()).toBe(true);
    expect(wrapper.find('.query-panel').exists()).toBe(true);
    expect(wrapper.find('.table-panel').exists()).toBe(true);
    expect(wrapper.text()).toContain('新增外购物料入库单');
    expect(wrapper.text()).not.toContain('成品入库');
    expect(wrapper.text()).not.toContain('来料质检');
  });
});
