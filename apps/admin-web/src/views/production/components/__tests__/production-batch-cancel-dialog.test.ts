import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import type { ProductionBatchCancellationCheck } from '@company/contracts';
import ProductionBatchCancelDialog from '../ProductionBatchCancelDialog.vue';

const dialogStub = {
  props: ['modelValue'],
  emits: ['update:model-value'],
  template: '<div class="dialog-stub"><slot/><slot name="footer"/></div>',
};

const batch = {
  id: '21',
  batchNo: 'B-001',
  workOrderId: '6',
  workOrderNo: 'WO-001',
  productId: '8',
  productCode: 'P-001',
  productName: '产品 A',
  plannedQuantity: '10.0000',
  completedQuantity: '0.0000',
  qualifiedQuantity: '0.0000',
  routeId: null,
  routeCode: null,
  status: 'material_assigned',
  ownerId: null,
  ownerName: null,
  version: 2,
};

const allowedCheck: ProductionBatchCancellationCheck = {
  productionBatchId: '21',
  batchStatus: 'material_assigned',
  version: 2,
  canCancel: true,
  blockers: [],
  activeDemandCount: 3,
  activeAllocationCount: 2,
  pendingOutboundCount: 1,
  pendingOutbounds: [{ id: '31', outboundNo: 'OUT-001' }],
};

const mountDialog = (check = allowedCheck) =>
  mount(ProductionBatchCancelDialog, {
    props: { visible: true, batch: batch as never, check: check as never, submitting: false },
    global: { plugins: [ElementPlus], stubs: { 'el-dialog': dialogStub } },
  });

describe('ProductionBatchCancelDialog', () => {
  it('shows every server-calculated side effect before confirmation', () => {
    const wrapper = mountDialog();

    expect(wrapper.text()).toContain('请核对取消任务的全部影响');
    expect(wrapper.text()).toContain('OUT-001');
    expect(wrapper.text()).toContain('1 张将一并取消');
    expect(wrapper.text()).toContain('2 条将取消并释放库存占用');
    expect(wrapper.text()).toContain('3 条将转为已取消');
    expect(wrapper.text()).toContain('不会生成库存流水');
  });

  it('requires a reason and emits its trimmed value', async () => {
    const wrapper = mountDialog();
    const submit = wrapper
      .findAll('button')
      .find((button) => button.text().includes('确认取消任务'));
    expect(submit?.attributes('disabled')).toBeDefined();

    await wrapper.find('textarea').setValue('  计划调整  ');
    await nextTick();
    expect(submit?.attributes('disabled')).toBeUndefined();
    await submit?.trigger('click');

    expect(wrapper.emitted('confirm')).toEqual([['计划调整']]);
  });

  it('explains and blocks cancellation after production has started', () => {
    const wrapper = mountDialog({
      ...allowedCheck,
      batchStatus: 'doing',
      canCancel: false,
      blockers: ['batch_already_started'],
    });

    expect(wrapper.text()).toContain('任务已经开工或结束，禁止取消任务');
    expect(wrapper.text()).toContain('第一版只允许未开工且物料未实际出库');
    const submit = wrapper
      .findAll('button')
      .find((button) => button.text().includes('确认取消任务'));
    expect(submit?.attributes('disabled')).toBeDefined();
  });
});
