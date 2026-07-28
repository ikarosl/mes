import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProductDefaultRouteDialog from '../ProductDefaultRouteDialog.vue';

const passthrough = { template: '<div><slot/><slot name="footer"/></div>' };

describe('ProductDefaultRouteDialog', () => {
  it('submits the current route when the dialog is opened without changing it', async () => {
    const wrapper = mount(ProductDefaultRouteDialog, {
      props: {
        visible: true,
        product: { id: '1', itemCode: 'FG-1', productName: '成品' } as never,
        availableRoutes: [
          {
            id: '7',
            productId: '1',
            routeCode: 'ROUTE-1',
            routeName: '默认路线',
            versionNo: 'V1.0',
            status: 'enabled',
          },
        ],
        currentRouteId: '7',
        submitting: false,
      },
      global: {
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

    await wrapper.findAll('button')[1]?.trigger('click');

    expect(wrapper.emitted('confirm')).toEqual([['7']]);
  });
});
