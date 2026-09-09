import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import MaterialDemandOverviewDialog from '../MaterialDemandOverviewDialog.vue';

const batch = (status: string) =>
  ({
    id: 'batch-1',
    batchNo: 'PB-1',
    status,
    workOrderNo: 'WO-1',
    productCode: 'FG-1',
    productName: '成品一',
  }) as never;

const demand = (overrides: Record<string, unknown> = {}) =>
  ({
    demandId: 'd-1',
    productionBatchId: 'batch-1',
    productMaterialId: 'pm-1',
    itemId: 'm-1',
    requirementBasisId: 'basis-1',
    materialVariantId: 'mv-1',
    materialVariantCode: 'M-1-v1',
    itemCode: 'M-1',
    itemName: '物料一',
    unit: 'pcs',
    demandQuantity: '5',
    remainingDemandQuantity: '2',
    allocatedQuantity: '3',
    outboundQuantity: '1',
    remainingQuantity: '2',
    demandType: 'normal',
    generationGroupKey: 'NORMAL:batch-1',
    generationGroupType: 'normal',
    supplementNo: null,
    generationReason: null,
    supplementId: null,
    createdAt: '2026-09-01T09:00:00+08:00',
    businessStatus: 'active',
    fulfilledById: null,
    fulfilledAt: null,
    demandProgressStatus: 'shortage',
    version: 1,
    allocations: [],
    ...overrides,
  }) as never;

const mountDialog = (props: Record<string, unknown> = {}) =>
  mount(MaterialDemandOverviewDialog, {
    props: {
      visible: true,
      batch: batch('doing'),
      demands: [],
      loading: false,
      ...props,
    },
    global: {
      stubs: {
        'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
        'el-button': {
          emits: ['click'],
          template: '<button @click="$emit(\'click\')"><slot /></button>',
        },
        'el-empty': {
          props: ['description'],
          template: '<div class="empty-stub">{{ description }}</div>',
        },
        'el-collapse': { template: '<div><slot /></div>' },
        'el-collapse-item': {
          props: ['name'],
          template: '<section><slot name="title" /><slot /></section>',
        },
        'el-table': { template: '<div class="table-stub" />' },
        'el-table-column': true,
        'el-tag': { template: '<span><slot /></span>' },
      },
      directives: { loading: () => undefined },
    },
  });

describe('MaterialDemandOverviewDialog', () => {
  it('groups demands by generation action and expands all current groups', async () => {
    const wrapper = mountDialog({
      demands: [
        demand(),
        demand({ demandId: 'd-2', generationGroupKey: 'NORMAL:batch-1', itemCode: 'M-2' }),
        demand({
          demandId: 'd-3',
          demandType: 'manual_additional',
          generationGroupKey: 'ADDITIONAL:batch-1:1',
          generationGroupType: 'manual_additional',
          generationReason: '现场补充',
        }),
      ],
    });
    await nextTick();

    const vm = wrapper.vm as unknown as {
      groups: Array<{ generationGroupKey: string; label: string; rows: unknown[] }>;
      expandedGroups: string[];
      progressLabel: (row: unknown) => string;
    };
    expect(vm.groups.map((group) => [group.label, group.rows.length])).toEqual([
      ['初始物料需求', 2],
      ['人工追加需求', 1],
    ]);
    expect(vm.expandedGroups).toEqual(['NORMAL:batch-1', 'ADDITIONAL:batch-1:1']);
    expect(vm.progressLabel(demand())).toBe('短批缺料');
    expect(wrapper.text()).toContain('人工追加需求');
    expect(wrapper.text()).toContain('现场补充');
  });

  it('exposes manual addition only for an actionable batch', async () => {
    const wrapper = mountDialog({ demands: [demand()] });
    const addButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('人工追加需求'));
    expect(addButton).toBeDefined();
    await addButton!.trigger('click');
    expect(wrapper.emitted('add-manual')).toEqual([[]]);

    await wrapper.setProps({ batch: batch('completed') });
    await nextTick();
    expect(wrapper.findAll('button').some((button) => button.text().includes('人工追加需求'))).toBe(
      false,
    );
  });

  it('shows an empty state while not loading and hides it during loading', async () => {
    const wrapper = mountDialog({ demands: [], loading: false });
    expect(wrapper.text()).toContain('当前任务没有已生成需求');

    await wrapper.setProps({ loading: true });
    await nextTick();
    expect(wrapper.text()).not.toContain('当前任务没有已生成需求');
  });
});
