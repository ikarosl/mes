import { mount } from '@vue/test-utils';
import {
  computed,
  defineComponent,
  h,
  inject,
  provide,
  type ComputedRef,
  type InjectionKey,
} from 'vue';
import { describe, expect, it } from 'vitest';
import MaterialOutboundDialog from '../MaterialOutboundDialog.vue';

const outboundRow = {
  outboundId: 'o1',
  outboundNo: 'PO202608310001',
  productionBatchId: 'b1',
  batchNo: 'B20260831-01',
  workOrderId: 'w1',
  workOrderNo: 'WO202608310001',
  productId: 'p1',
  productCode: 'P001',
  productName: '成品A',
  status: 'pending_picking',
  outboundAt: null,
  operatorId: null,
  operatorName: null,
  createdById: 'u1',
  createdByName: '张三',
  createdAt: '2026-08-31T08:05:09.000Z',
  version: 0,
  remark: null,
  quantitySummary: [],
  details: [],
} as never;

type StubRow = Record<string, unknown>;
const stubTableRowsKey: InjectionKey<ComputedRef<StubRow[]>> = Symbol('stubTableRows');

const StubTable = defineComponent({
  props: { data: { type: Array as () => StubRow[], default: () => [] } },
  setup(props, { slots }) {
    provide(
      stubTableRowsKey,
      computed(() => props.data),
    );
    return () => h('div', { class: 'stub-table' }, slots.default?.());
  },
});

const StubTableColumn = defineComponent({
  props: { label: { type: String, default: '' }, prop: { type: String, default: '' } },
  setup(props, { slots }) {
    const rows = inject(
      stubTableRowsKey,
      computed<StubRow[]>(() => []),
    );
    return () =>
      h(
        'div',
        { class: 'stub-column', 'data-label': props.label },
        rows.value.map((row, index) =>
          h(
            'div',
            { class: 'stub-cell', key: String(row.allocationId ?? row.outboundNo ?? index) },
            slots.default
              ? slots.default({ row })
              : props.prop
                ? String(row[props.prop] ?? '')
                : '',
          ),
        ),
      );
  },
});

describe('MaterialOutboundDialog', () => {
  it('explains both stale-authorization and fully-allocated continuation paths', () => {
    const wrapper = mount(MaterialOutboundDialog, {
      props: {
        visible: true,
        demands: [],
        outbounds: [],
        loadingOutbounds: false,
        submitting: false,
        shortBatch: true,
      },
      global: {
        stubs: {
          'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
          'el-alert': {
            props: ['title'],
            template: '<div class="stub-alert">{{ title }}</div>',
          },
          'el-table': true,
          'el-table-column': true,
          'el-input': true,
          'el-input-number': true,
          'el-button': true,
        },
        directives: { loading: () => undefined },
      },
    });
    const alerts = wrapper.findAll('.stub-alert').map((row) => row.text());
    expect(alerts).toContainEqual(expect.stringContaining('仍有分配缺口时需要'));
    expect(alerts).toContainEqual(expect.stringContaining('全部活动需求分配完成后'));
  });

  it('offers only active allocations with positive orderable quantity', () => {
    const wrapper = mount(MaterialOutboundDialog, {
      props: {
        visible: true,
        demands: [
          {
            itemName: '物料A',
            allocations: [
              {
                allocationId: 'a1',
                allocationStatus: 'active',
                remainingOutboundQuantity: '2.0000',
                availableToOrderQuantity: '2.0000',
                pendingOutboundQuantity: '0.0000',
              },
              {
                allocationId: 'a2',
                allocationStatus: 'released',
                remainingOutboundQuantity: '3.0000',
                availableToOrderQuantity: '3.0000',
                pendingOutboundQuantity: '0.0000',
              },
            ],
          },
        ] as never,
        outbounds: [],
        loadingOutbounds: false,
        submitting: false,
      },
      global: {
        stubs: {
          'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
          'el-alert': true,
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': true,
          'el-input': true,
          'el-input-number': true,
          'el-button': true,
        },
        directives: { loading: () => undefined },
      },
    });
    const vm = wrapper.vm as unknown as { availableAllocations: Array<{ allocationId: string }> };
    expect(vm.availableAllocations.map((row) => row.allocationId)).toEqual(['a1']);
  });

  it('keeps selections from different demand groups in one outbound payload', async () => {
    const wrapper = mount(MaterialOutboundDialog, {
      props: {
        visible: true,
        demands: [
          demand('d1', 'NORMAL:b1', 'normal', null, 'a1'),
          demand('d2', 'LOSSSUP:9', 'material_loss_supplement', 'SUP-00009', 'a2'),
        ] as never,
        outbounds: [],
        loadingOutbounds: false,
        submitting: false,
      },
      global: {
        stubs: {
          'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
          'el-alert': true,
          'el-table': { template: '<div><slot/></div>' },
          'el-table-column': true,
          'el-input': true,
          'el-input-number': true,
          'el-button': true,
        },
        directives: { loading: () => undefined },
      },
    });
    await wrapper.vm.$nextTick();
    const vm = wrapper.vm as unknown as {
      availableAllocations: Array<{ allocationId: string; generationGroupKey: string }>;
      selectedGroupCount: number;
      handleGroupSelection: (key: string, rows: unknown[]) => void;
      submit: () => void;
    };
    const [normal, loss] = vm.availableAllocations;
    vm.handleGroupSelection(normal!.generationGroupKey, [normal!]);
    vm.handleGroupSelection(loss!.generationGroupKey, [loss!]);
    vm.submit();

    expect(vm.selectedGroupCount).toBe(2);
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      details: [
        { allocationId: 'a1', outboundQuantity: 1 },
        { allocationId: 'a2', outboundQuantity: 1 },
      ],
    });
  });

  it('formats the outbound created time with the shared datetime formatter', () => {
    const wrapper = mount(MaterialOutboundDialog, {
      props: {
        visible: true,
        demands: [],
        outbounds: [outboundRow],
        loadingOutbounds: false,
        submitting: false,
      },
      global: {
        stubs: {
          'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
          'el-alert': true,
          'el-table': StubTable,
          'el-table-column': StubTableColumn,
          'el-input': true,
          'el-input-number': true,
          'el-button': true,
        },
        directives: { loading: () => undefined },
      },
    });
    const timeColumn = wrapper.find('.stub-column[data-label="制单时间"]');
    expect(timeColumn.exists()).toBe(true);
    expect(timeColumn.text()).toContain('2026-08-31 08:05:09');
    expect(timeColumn.text()).not.toContain('2026-08-31T08:05:09');
  });
});

const demand = (
  demandId: string,
  generationGroupKey: string,
  generationGroupType: 'normal' | 'material_loss_supplement',
  supplementNo: string | null,
  allocationId: string,
) => ({
  demandId,
  itemName: `物料-${demandId}`,
  generationGroupKey,
  generationGroupType,
  supplementNo,
  allocations: [
    {
      allocationId,
      allocationStatus: 'active',
      assignedQuantity: '1',
      outboundQuantity: '0',
      availableToOrderQuantity: '1',
      pendingOutboundQuantity: '0',
    },
  ],
});
