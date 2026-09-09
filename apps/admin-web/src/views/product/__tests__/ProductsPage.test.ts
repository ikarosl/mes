import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import ProductsPage from '../ProductsPage.vue';

const { list, setStatus, categoryOptions, confirm, success, error } = vi.hoisted(() => ({
  list: vi.fn(),
  setStatus: vi.fn(),
  categoryOptions: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../api/product', () => ({
  productApi: {
    products: list,
    productGroups: list,
    categoryOptions,
    productOptions: vi.fn().mockResolvedValue([]),
    routeOptions: vi.fn().mockResolvedValue([]),
    userOptions: vi.fn().mockResolvedValue([]),
    setProductStatus: setStatus,
  },
}));
vi.mock('../../../stores/auth', () => ({
  useAuthStore: () => ({ can: () => true }),
}));
vi.mock('../../../utils/route-message-box', () => ({
  RouteMessageBox: { confirm },
}));
vi.mock('../../../utils/message', () => ({
  EMessage: { success, error, warning: vi.fn() },
}));

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/product/products', name: 'product-products', component: { template: '<div />' } },
    { path: '/:pathMatch(.*)*', name: 'test', component: { template: '<div />' } },
  ],
});

const productRow = {
  id: 'p1',
  itemCode: 'P001',
  productName: '环形器',
  categoryId: 'c1',
  categoryCode: 'C1',
  categoryName: '成品',
  itemKind: 'finished_product',
  defaultRouteId: null,
  defaultRouteName: null,
  unit: 'pcs',
  acquireMethod: 'self_made',
  specValues: [],
  status: 1,
  materialCount: 0,
  bomLockedAt: null,
  bomLockedById: null,
  remark: null,
  updatedAt: null,
};

describe('ProductsPage row write guard', () => {
  const mountPage = () =>
    mount(ProductsPage, {
      global: {
        plugins: [ElementPlus, router, createPinia()],
        stubs: {
          TableToolbar: true,
          PaginationFooter: true,
          ProductFormDialog: true,
          ProductDetailDialog: true,
          ProductMaterialDialog: true,
          ProductDefaultRouteDialog: true,
        },
      },
    });

  beforeEach(() => {
    list.mockReset();
    list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    setStatus.mockReset();
    setStatus.mockResolvedValue(undefined);
    categoryOptions.mockReset();
    categoryOptions.mockResolvedValue([]);
    confirm.mockReset();
  });

  it('routes the status change through the more menu and submits once after confirmation', async () => {
    // 行必须持续存在：写操作成功后页面会重新加载列表
    list.mockResolvedValue({
      items: [
        {
          groupKey: 'P001',
          productName: productRow.productName,
          categoryId: productRow.categoryId,
          categoryCode: productRow.categoryCode,
          categoryName: productRow.categoryName,
          codeCount: 1,
          codes: [productRow],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    });
    let confirmResolve!: (value: unknown) => void;
    confirm.mockReturnValue(new Promise((resolve) => (confirmResolve = resolve)));

    const wrapper = mountPage();
    await flushPromises();

    const findMore = () =>
      wrapper.findAll('button').find((b) => b.text().trim().startsWith('更多'));
    expect(findMore()).toBeDefined();
    await findMore()!.trigger('click');
    await nextTick();
    const findToggle = () =>
      Array.from(document.body.querySelectorAll<HTMLElement>('.el-dropdown-menu__item')).find(
        (item) => item.textContent?.trim() === '停用',
      );
    expect(findToggle()).toBeDefined();
    expect(findToggle()!.getAttribute('aria-disabled')).not.toBe('true');

    findToggle()!.click();
    await nextTick();
    expect(setStatus).not.toHaveBeenCalled();

    confirmResolve('confirm');
    await flushPromises();
    expect(setStatus).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalledWith('p1', 0);
    expect(success).toHaveBeenCalledWith('已停用');
  });

  it('opens the create form with exactly one category-options request (single open entry)', async () => {
    // ProductFormDialog 的真实契约：弹窗 @open 时向外发射 refresh-options，由页面统一刷新候选。
    // 若 openCreate/openEdit 再各自主动 refresh 一次，打开就会重复请求 /categories/options（useRefreshableOptions 无单飞）。
    const formDialogStub = {
      name: 'ProductFormDialog',
      props: ['visible'],
      emits: ['refresh-options'],
      methods: {
        resetForm() {},
        setForm() {},
      },
      watch: {
        visible(this: { $emit: (e: 'refresh-options') => void }, value: boolean) {
          if (value) this.$emit('refresh-options');
        },
      },
      template: '<div />',
    };
    // TableToolbar 用真实组件渲染，保证 #actions 插槽里的“新增产品”按钮可点击。
    const wrapper = mount(ProductsPage, {
      global: {
        plugins: [ElementPlus, router, createPinia()],
        stubs: {
          PaginationFooter: true,
          ProductFormDialog: formDialogStub,
          ProductDetailDialog: true,
          ProductMaterialDialog: true,
          ProductDefaultRouteDialog: true,
        },
      },
    });
    await flushPromises();

    const createButton = wrapper.findAll('button').find((b) => b.text().includes('新增成品'));
    expect(createButton).toBeDefined();

    const callsBefore = categoryOptions.mock.calls.length;
    await createButton!.trigger('click');
    await flushPromises();

    expect(categoryOptions.mock.calls.length).toBe(callsBefore + 1);
  });
});
