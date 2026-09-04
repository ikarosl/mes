import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import RouteDetailDialog from '../RouteDetailDialog.vue';

const { routeSteps } = vi.hoisted(() => ({ routeSteps: vi.fn() }));
vi.mock('../../../../api/product', () => ({ productApi: { routeSteps } }));

const passthrough = { template: '<div><slot/><slot name="footer"/></div>' };
const alertStub = { template: '<div class="alert-stub"><slot name="title"/><slot/></div>' };
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

const stepRow = () =>
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
  }) as never;

describe('RouteDetailDialog', () => {
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

  it('loads only route steps when opened; it never requests a BOM', async () => {
    routeSteps.mockResolvedValue([stepRow()]);
    const wrapper = mountDialog();

    await openDialog(wrapper);

    expect(routeSteps).toHaveBeenCalledTimes(1);
    expect(routeSteps).toHaveBeenCalledWith('r1');
    expect(wrapper.text()).toContain('工序顺序（路线不绑定 BOM）');
  });

  it('renders step information without any BOM section', async () => {
    routeSteps.mockResolvedValue([stepRow()]);
    const wrapper = mountDialog();

    await openDialog(wrapper);

    expect(wrapper.text()).toContain('P1 / 工序1');
    expect(wrapper.text()).toContain('首道装配');
    expect(wrapper.text()).toContain('张三');
    expect(wrapper.text()).toContain('sop.pdf');
    expect(wrapper.text()).not.toContain('使用 BOM');
    expect(wrapper.text()).not.toContain('单件用量');
  });

  it('shows a failed route-step state without presenting an empty BOM', async () => {
    routeSteps.mockRejectedValue(new Error('500'));
    const wrapper = mountDialog();

    await openDialog(wrapper);

    expect(wrapper.text()).toContain('工序明细加载失败');
    expect(wrapper.text()).not.toContain('BOM 明细加载失败');
  });

  it('shows an empty state when the route has no steps', async () => {
    routeSteps.mockResolvedValue([]);
    const wrapper = mountDialog();

    await openDialog(wrapper);

    expect(wrapper.text()).toContain('该路线尚未配置工序');
  });
});
