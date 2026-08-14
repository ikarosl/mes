import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ScrapsPage from '../ScrapsPage.vue';

describe('ScrapsPage', () => {
  it('only presents the unavailable capability boundary', () => {
    const wrapper = mount(ScrapsPage, {
      global: {
        stubs: {
          'el-result': {
            props: ['title', 'subTitle'],
            template: '<section>{{ title }} {{ subTitle }}<slot name="extra"/></section>',
          },
          'el-tag': { template: '<span><slot/></span>' },
          'el-alert': { props: ['title'], template: '<aside>{{ title }}<slot/></aside>' },
        },
      },
    });

    expect(wrapper.text()).toContain('库存报废管理暂未开放');
    expect(wrapper.text()).toContain('不提供报废单查询、创建、确认或取消能力');
    expect(wrapper.text()).toContain('通用库存报废尚未进入当前正式范围');
    expect(wrapper.text()).toContain('生产工序异常的报废补产继续在生产模块处理');
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.find('table').exists()).toBe(false);
  });
});
