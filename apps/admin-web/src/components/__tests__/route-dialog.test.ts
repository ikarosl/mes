/* eslint-disable vue/one-component-per-file */
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { defineComponent, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import RouteDialog from '../RouteDialog.vue';

describe('RouteDialog', () => {
  it('keeps the overlay in its route subtree and applies the scoped overlay class', async () => {
    const wrapper = mount(RouteDialog, {
      attrs: {
        modelValue: true,
        title: '编辑资料',
      },
      slots: {
        default: '<div data-test="dialog-body">内容</div>',
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await Promise.resolve();

    expect(wrapper.find('.route-dialog-overlay').exists()).toBe(true);
    expect(wrapper.find('[data-test="dialog-body"]').exists()).toBe(true);
    expect(document.body.querySelector('.route-dialog-overlay')).toBeNull();
    wrapper.unmount();
  });

  it('hides with an inactive KeepAlive page and restores the editing draft', async () => {
    const EditorPage = defineComponent({
      components: { RouteDialog },
      data: () => ({ draft: '' }),
      template: `
        <section>
          <RouteDialog :model-value="true" title="编辑资料">
            <input data-test="draft" v-model="draft" />
          </RouteDialog>
        </section>
      `,
    });
    const OtherPage = defineComponent({
      template: '<section data-test="other">其他页面</section>',
    });
    const Host = defineComponent({
      components: { EditorPage, OtherPage },
      data: () => ({ currentPage: 'EditorPage' }),
      template: `
        <KeepAlive>
          <component :is="currentPage" />
        </KeepAlive>
      `,
    });
    const wrapper = mount(Host, {
      attachTo: document.body,
      global: {
        plugins: [ElementPlus],
      },
    });

    await flushPromises();
    await wrapper.get('[data-test="draft"]').setValue('未提交内容');
    (wrapper.vm as unknown as { currentPage: string }).currentPage = 'OtherPage';
    await nextTick();

    expect(document.body.querySelector('.route-dialog-overlay')).toBeNull();
    expect(wrapper.find('[data-test="other"]').exists()).toBe(true);

    (wrapper.vm as unknown as { currentPage: string }).currentPage = 'EditorPage';
    await nextTick();

    expect(wrapper.get<HTMLInputElement>('[data-test="draft"]').element.value).toBe('未提交内容');
    wrapper.unmount();
  });
});
