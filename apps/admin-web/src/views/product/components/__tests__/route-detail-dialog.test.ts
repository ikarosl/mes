import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RouteDetailDialog from '../RouteDetailDialog.vue';

const { routeSteps, materials } = vi.hoisted(() => ({
  routeSteps: vi.fn(),
  materials: vi.fn(),
}));
vi.mock('../../../../api/product', () => ({
  productApi: { routeSteps, materials },
}));

const passthrough = { template: '<div><slot/><slot name="footer"/></div>' };
const alertStub = {
  template: '<div class="alert-stub"><slot name="title"/><slot/></div>',
};
const tagStub = { template: '<span class="tag-stub"><slot/></span>' };
const emptyStub = {
  props: ['description'],
  template: '<div class="empty-stub">{{ description }}</div>',
};
const buttonStub = {
  emits: ['click'],
  template: '<button @click="$emit(\'click\')"><slot/></button>',
};

const routeRow = {
  id: 'r1',
  routeCode: 'R1',
  routeName: '路线1',
  productId: 'p1',
  itemCode: 'FG-1',
  productName: '成品',
  versionNo: 'V1',
  status: 'enabled',
  processSummary: 'P1',
  stepCount: 1,
  remark: null,
  updatedAt: null,
} as never;

const stepRow = (productMaterialIds: string[]) =>
  ({
    id: 'rs1',
    processStepId: 's1',
    stepOrder: 1,
    stepCode: 'P1',
    stepName: '工序1',
    description: '首道装配',
    defaultOwnerId: 'u1',
    defaultOwnerName: '张三',
    sopFileId: 'f1',
    sopFileName: 'sop.pdf',
    needInspection: true,
    needRecord: true,
    status: 1,
    remark: null,
    productMaterialIds,
  }) as never;

const materialRow = () =>
  ({
    id: 'bm1',
    materialProductId: 'm1',
    itemCode: 'MAT-1',
    productName: '物料1',
    itemKind: 'material',
    quantityPerUnit: '2.0000',
    unit: 'kg',
    isKeyMaterial: true,
    needBatchRecord: false,
    status: 1,
    remark: null,
  }) as never;

describe('RouteDetailDialog', () => {
  beforeEach(() => {
    routeSteps.mockReset();
    materials.mockReset();
  });

  const mountDialog = () =>
    mount(RouteDetailDialog, {
      props: {
        visible: false,
        row: null,
        routeStatusLabel: (status: string) => status,
      },
      global: {
        stubs: {
          'el-dialog': passthrough,
          'el-descriptions': passthrough,
          'el-descriptions-item': passthrough,
          'el-alert': alertStub,
          'el-tag': tagStub,
          'el-empty': emptyStub,
          'el-skeleton': true,
          'el-button': buttonStub,
        },
      },
    });

  const openDialog = async (wrapper: ReturnType<typeof mountDialog>) => {
    await wrapper.setProps({ row: routeRow });
    await wrapper.setProps({ visible: true });
    await flushPromises();
  };

  it('loads route steps and product BOM when opened', async () => {
    routeSteps.mockResolvedValue([stepRow(['bm1'])]);
    materials.mockResolvedValue([materialRow()]);
    const wrapper = mountDialog();

    await openDialog(wrapper);

    expect(routeSteps).toHaveBeenCalledTimes(1);
    expect(routeSteps).toHaveBeenCalledWith('r1');
    expect(materials).toHaveBeenCalledTimes(1);
    expect(materials).toHaveBeenCalledWith('p1');
  });

  it('renders step info and BOM material code/name/quantity/unit', async () => {
    routeSteps.mockResolvedValue([stepRow(['bm1'])]);
    materials.mockResolvedValue([materialRow()]);
    const wrapper = mountDialog();

    await openDialog(wrapper);

    expect(wrapper.text()).toContain('P1 / 工序1');
    expect(wrapper.text()).toContain('首道装配');
    expect(wrapper.text()).toContain('张三');
    expect(wrapper.text()).toContain('sop.pdf');
    expect(wrapper.text()).toContain('MAT-1');
    expect(wrapper.text()).toContain('物料1');
    expect(wrapper.text()).toContain('2.0000');
    expect(wrapper.text()).toContain('kg');
  });

  it('shows a failed state when the BOM request fails, not an empty BOM', async () => {
    routeSteps.mockResolvedValue([stepRow(['bm1'])]);
    materials.mockRejectedValue(new Error('500'));
    const wrapper = mountDialog();

    await openDialog(wrapper);

    expect(wrapper.text()).toContain('BOM 明细加载失败');
    expect(wrapper.text()).not.toContain('该工序未关联 BOM 明细');
  });

  it('marks linked materials that are missing from the BOM as unavailable', async () => {
    routeSteps.mockResolvedValue([stepRow(['bm1'])]);
    materials.mockResolvedValue([]);
    const wrapper = mountDialog();

    await openDialog(wrapper);

    expect(wrapper.text()).toContain('已失效物料');
  });

  it('shows an empty state when the route has no steps', async () => {
    routeSteps.mockResolvedValue([]);
    materials.mockResolvedValue([]);
    const wrapper = mountDialog();

    await openDialog(wrapper);

    expect(wrapper.text()).toContain('该路线尚未配置工序');
  });
});
