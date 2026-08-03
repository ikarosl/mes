import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
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

describe('ProductDefaultRouteDialog', () => {
  beforeEach(() => {
    routeOptions.mockReset();
    warning.mockReset();
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
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(ProductDefaultRouteDialog, {
      props: {
        visible: true,
        product: { id: '1', itemCode: 'FG-1', productName: '成品' } as never,
        currentRouteId: '7',
        submitting: false,
      },
      global: {
        plugins: [pinia],
        stubs: {
          'el-dialog': passthrough,
          'el-form': passthrough,
          'el-form-item': passthrough,
          'el-select': passthrough,
          'el-option': true,
          'el-button': {
            emits: ['click'],
            template: '<button @click="$emit(\'click\')"><slot/></button>',
          },
        },
      },
    });

    await flushPromises();

    await wrapper.findAll('button')[1]?.trigger('click');

    expect(wrapper.emitted('confirm')).toEqual([['7']]);
  });
});
