import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import WorkOrderTransitionDialog from '../WorkOrderTransitionDialog.vue';

const dialogStub = {
  props: ['modelValue'],
  emits: ['update:model-value'],
  template: '<div class="dialog-stub"><slot/><slot name="footer"/></div>',
};

const order = {
  id: '6',
  workOrderNo: 'WO-001',
  productId: '8',
  productCode: 'P-001',
  productName: '产品 A',
  unit: 'pcs',
  plannedQuantity: '10.0000',
  assignedQuantity: '10.0000',
  status: 'doing',
  version: 3,
  batches: [
    {
      id: '21',
      batchNo: 'B-001',
      workOrderId: '6',
      workOrderNo: 'WO-001',
      productId: '8',
      productCode: 'P-001',
      productName: '产品 A',
      plannedQuantity: '10.0000',
      completedQuantity: '10.0000',
      qualifiedQuantity: '10.0000',
      routeId: null,
      routeCode: null,
      status: 'completed',
      ownerId: null,
      ownerName: null,
      version: 4,
    },
  ],
};

const mountDialog = (mode: 'complete' | 'early-close' | 'archive', value = order) =>
  mount(WorkOrderTransitionDialog, {
    props: { visible: true, mode, order: value as never, submitting: false },
    global: { plugins: [ElementPlus], stubs: { 'el-dialog': dialogStub } },
  });

describe('WorkOrderTransitionDialog', () => {
  it('lets an administrator explicitly confirm exact-quantity completion', async () => {
    const wrapper = mountDialog('complete');
    expect(wrapper.text()).toContain('批次汇总已达到工单计划量');
    expect(wrapper.text()).toContain('非取消 1 个，未结束 0 个');

    const submit = wrapper
      .findAll('button')
      .find((button) => button.text().includes('确认工单完工'));
    expect(submit?.attributes('disabled')).toBeUndefined();
    await submit?.trigger('click');
    expect(wrapper.emitted('confirm')).toEqual([[{ mode: 'complete', reason: null }]]);
  });

  it('blocks completion and early close while a production batch is unfinished', () => {
    const unfinished = {
      ...order,
      batches: [{ ...order.batches[0], status: 'doing', completedQuantity: '4.0000' }],
    };

    for (const mode of ['complete', 'early-close'] as const) {
      const wrapper = mountDialog(mode, unfinished);
      expect(wrapper.text()).toContain('存在未结束生产批次，当前不能提交');
      expect(wrapper.text()).toContain('请先完成或取消所有未结束生产批次');
      const submit = wrapper
        .findAll('button')
        .find((button) => button.attributes('type') === 'button');
      expect(wrapper.findAll('button').at(-1)?.attributes('disabled')).toBeDefined();
      expect(submit).toBeDefined();
    }
  });

  it('requires a reason for a no-production early close', async () => {
    const wrapper = mountDialog('early-close', { ...order, status: 'released', batches: [] });
    expect(wrapper.text()).toContain('该操作将按未生产结案');
    const submit = wrapper.findAll('button').at(-1)!;
    expect(submit.attributes('disabled')).toBeDefined();

    await wrapper.find('textarea').setValue('  客户取消需求  ');
    await nextTick();
    expect(submit.attributes('disabled')).toBeUndefined();
    await submit.trigger('click');
    expect(wrapper.emitted('confirm')).toEqual([[{ mode: 'early-close', reason: '客户取消需求' }]]);
  });
});
