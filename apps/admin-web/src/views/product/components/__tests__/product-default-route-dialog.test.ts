import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductDefaultRouteDialog from '../ProductDefaultRouteDialog.vue';

const { routeOptions, warning } = vi.hoisted(() => ({
  routeOptions: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../../../../api/product', () => ({
  productApi: { routeOptions },
}));
vi.mock('../../../../utils/message', () => ({ EMessage: { warning } }));

const passthrough = { template: '<div><slot/><slot name="footer"/></div>' };
/** el-select：点击时发射 visible-change，用于验证“展开下拉刷新路线候选” */
const selectStub = {
  emits: ['visible-change', 'update:modelValue'],
  template: '<button class="select-stub" @click="$emit(\'visible-change\', true)"><slot/></button>',
};

describe('ProductDefaultRouteDialog', () => {
  beforeEach(() => {
    routeOptions.mockReset();
    warning.mockReset();
  });

  const mountDialog = () =>
    mount(ProductDefaultRouteDialog, {
      props: {
        visible: false,
        product: { id: '1', itemCode: 'FG-1', productName: '成品' } as never,
        currentRouteId: '7',
        submitting: false,
      },
      global: {
        stubs: {
          'el-dialog': passthrough,
          'el-form': passthrough,
          'el-form-item': passthrough,
          'el-select': selectStub,
          'el-option': true,
          'el-button': {
            emits: ['click'],
            template: '<button @click="$emit(\'click\')"><slot/></button>',
          },
        },
      },
    });

  const saveButton = (wrapper: ReturnType<typeof mountDialog>) =>
    wrapper.findAll('button').find((b) => b.text().includes('保存默认路线'));

  it('opening the dialog refreshes the route candidates', async () => {
    routeOptions.mockResolvedValue([]);
    const wrapper = mountDialog();

    await wrapper.setProps({ visible: true });
    await flushPromises();

    expect(routeOptions).toHaveBeenCalledTimes(1);
  });

  it('submits the current route when the dialog is opened without changing it', async () => {
    routeOptions.mockResolvedValue([
      {
        id: '7',
        productId: '1',
        routeCode: 'ROUTE-1',
        routeName: '默认路线',
        versionNo: 'V1.0',
        status: 'enabled',
      },
    ]);
    const wrapper = mountDialog();

    await wrapper.setProps({ visible: true });
    await flushPromises();

    await saveButton(wrapper)?.trigger('click');

    expect(wrapper.emitted('confirm')).toEqual([['7']]);
  });

  it('expanding the route select refreshes only route options', async () => {
    routeOptions.mockResolvedValue([]);
    const wrapper = mountDialog();

    await wrapper.setProps({ visible: true });
    await flushPromises();
    const before = routeOptions.mock.calls.length;

    await wrapper.find('.select-stub').trigger('click');
    await flushPromises();

    expect(routeOptions).toHaveBeenCalledTimes(before + 1);
  });
});
