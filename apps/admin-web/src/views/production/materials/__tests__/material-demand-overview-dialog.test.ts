import { mount } from '@vue/test-utils';
import { defineComponent, h, inject, provide, type InjectionKey } from 'vue';
import { describe, expect, it } from 'vitest';
import MaterialDemandOverviewDialog from '../MaterialDemandOverviewDialog.vue';

type TableRow = Record<string, unknown> & { demandId: string };
const tableRowsKey: InjectionKey<() => TableRow[]> = Symbol('material-demand-table-rows');

const tableStub = defineComponent({
  props: {
    data: { type: Array, default: () => [] },
    emptyText: { type: String, default: '' },
  },
  setup(props, { slots }) {
    provide(tableRowsKey, () => props.data as TableRow[]);
    return () =>
      h(
        'div',
        { class: 'table-stub' },
        props.data.length ? slots.default?.() : h('div', { class: 'table-empty' }, props.emptyText),
      );
  },
});

const tableColumnStub = defineComponent({
  props: {
    label: { type: String, default: '' },
    prop: { type: String, default: '' },
  },
  setup(props, { slots }) {
    const rows = inject(tableRowsKey, () => []);
    return () =>
      h('div', { class: 'table-column', 'data-label': props.label }, [
        ...(props.label ? [h('div', { class: 'column-label' }, props.label)] : []),
        ...rows().map((row) =>
          h(
            'div',
            { class: 'table-cell', 'data-row-id': row.demandId },
            slots.default?.({ row }) ?? String(row[props.prop] ?? ''),
          ),
        ),
      ]);
  },
});

const passiveDialogStub = defineComponent({
  setup(_, { expose }) {
    expose({
      close: async () => true,
      refresh: async () => undefined,
    });
    return () => h('div');
  },
});

const batch = (status: string) =>
  ({
    id: 'batch-1',
    batchNo: 'PB-1',
    status,
    workOrderId: 'wo-1',
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
          props: ['loading'],
          emits: ['click'],
          template:
            '<button :data-loading="String(loading ?? false)" @click="$emit(\'click\')"><slot /></button>',
        },
        'el-alert': {
          props: ['title'],
          template: '<div class="alert-stub">{{ title }}</div>',
        },
        'el-empty': {
          props: ['description'],
          template: '<div class="empty-stub">{{ description }}</div>',
        },
        'el-table': tableStub,
        'el-table-column': tableColumnStub,
        'el-tag': { template: '<span><slot /></span>' },
        DemandCorrectionDialog: passiveDialogStub,
        ProductionDemandTraceDialog: passiveDialogStub,
        RelatedPurchasesDialog: passiveDialogStub,
      },
      directives: { loading: () => undefined },
    },
  });

describe('MaterialDemandOverviewDialog', () => {
  it('renders each generation action in its own expanded table with trace and quantity facts', () => {
    const wrapper = mountDialog({
      demands: [
        demand(),
        demand({ demandId: 'd-2', itemCode: 'M-2', itemName: '物料二' }),
        demand({
          demandId: 'd-3',
          demandType: 'manual_additional',
          generationGroupKey: 'ADDITIONAL:batch-1:1',
          generationGroupType: 'manual_additional',
          supplementNo: 'MD20261010-4',
          itemCode: 'M-3',
          itemName: '追加物料',
        }),
        demand({
          demandId: 'd-4',
          demandType: 'manual_additional',
          generationGroupKey: 'ADDITIONAL:batch-1:1',
          generationGroupType: 'manual_additional',
          supplementNo: 'MD20261010-4',
          businessStatus: 'closed',
          demandProgressStatus: 'closed',
          remainingDemandQuantity: '4',
          itemCode: 'M-4',
          itemName: '历史物料',
          correction: { replacementDemandId: 'd-5' },
        }),
        demand({
          demandId: 'd-5',
          demandType: 'manual_additional',
          generationGroupKey: 'ADDITIONAL:batch-1:1:CORRECTION:1',
          generationGroupType: 'manual_additional',
          supplementNo: 'MD20261010-4',
          createdAt: '2026-09-02T03:00:00Z',
          correction: { replacesDemandId: 'd-4' },
        }),
      ],
    });

    const groups = wrapper.findAll('.demand-group');
    expect(groups).toHaveLength(3);
    expect(wrapper.findAll('.table-stub')).toHaveLength(groups.length);

    const originalGroup = groups[0]!;
    const sourceGroup = groups[1]!;
    const correctionGroup = groups[2]!;
    expect(originalGroup.find('.demand-group-header').text()).toContain('初始物料需求');
    expect(originalGroup.find('.demand-group-header').text()).toContain(
      '本次生成 2026-09-01 09:00:00',
    );
    expect(
      originalGroup
        .findAll('.table-column[data-label="需求 ID"] .table-cell')
        .map((cell) => cell.attributes('data-row-id')),
    ).toEqual(['d-1', 'd-2']);

    expect(sourceGroup.find('.demand-group-header').text()).toContain('人工追加需求 MD20261010-4');
    expect(
      sourceGroup
        .findAll('.table-column[data-label="需求 ID"] .table-cell')
        .map((cell) => cell.attributes('data-row-id')),
    ).toEqual(['d-3', 'd-4']);

    expect(correctionGroup.find('.demand-group-header').text()).toContain(
      '更正生成 · 来源 MD20261010-4',
    );
    expect(correctionGroup.find('.demand-group-header').text()).toContain(
      '本次生成 2026-09-02 11:00:00',
    );

    expect(
      sourceGroup.find('.table-column[data-label="需求 ID"] [data-row-id="d-4"]').text(),
    ).toContain('id:d-4');
    expect(
      sourceGroup.find('.table-column[data-label="需求状态"] [data-row-id="d-4"]').text(),
    ).toContain('已由 id:d-5 替代');
    expect(
      correctionGroup.find('.table-column[data-label="需求 ID"] [data-row-id="d-5"]').text(),
    ).toContain('更正自 id:d-4');

    expect(
      originalGroup.find('.table-column[data-label="需求 ID"] [data-row-id="d-1"]').text(),
    ).toContain('id:d-1');
    expect(
      originalGroup.find('.table-column[data-label="未领"] [data-row-id="d-1"]').text(),
    ).toContain('2 pcs');
    const statusCell = originalGroup.find(
      '.table-column[data-label="需求状态"] [data-row-id="d-1"]',
    );
    expect(statusCell.text()).toContain('领料缺口');
    expect(statusCell.text()).toContain('已分配 3 pcs');
    expect(statusCell.text()).toContain('未分配 2 pcs');
    const historicalRemaining = sourceGroup.find(
      '.table-column[data-label="未领"] [data-row-id="d-4"]',
    );
    expect(historicalRemaining.text()).toContain('4 pcs');
    expect(historicalRemaining.text()).toContain('历史余量');

    const actionCell = originalGroup.find('.table-column[data-label="操作"] [data-row-id="d-1"]');
    expect(actionCell.text()).toBe('相关采购变更追溯');
  });

  it('exposes manual addition only for an actionable batch', async () => {
    const wrapper = mountDialog({ demands: [demand()] });
    const addButton = wrapper.findAll('button').find((button) => button.text() === '人工追加需求');
    expect(addButton).toBeDefined();
    await addButton!.trigger('click');
    expect(wrapper.emitted('add-manual')).toEqual([[]]);

    await wrapper.setProps({ batch: batch('completed') });
    expect(wrapper.findAll('button').some((button) => button.text() === '人工追加需求')).toBe(
      false,
    );
  });

  it('keeps the table read-only while loading and shows empty or error feedback', async () => {
    const wrapper = mountDialog({ demands: [], loading: false });
    expect(wrapper.find('.empty-stub').text()).toBe('当前任务没有已生成需求');

    const refreshButton = () =>
      wrapper.findAll('button').find((button) => button.text() === '刷新');
    expect(refreshButton()?.attributes('data-loading')).toBe('false');
    await refreshButton()?.trigger('click');
    expect(wrapper.emitted('refresh')).toEqual([[]]);
    await wrapper.setProps({ demands: [demand()], loading: true });
    expect(refreshButton()?.attributes('data-loading')).toBe('true');
    expect(wrapper.find('.overview-body .table-stub').exists()).toBe(true);

    await wrapper.setProps({ loading: false, error: '需求加载失败' });
    expect(wrapper.find('.overview-body').exists()).toBe(false);
    expect(wrapper.find('.alert-stub').text()).toBe('需求加载失败');
  });
});
