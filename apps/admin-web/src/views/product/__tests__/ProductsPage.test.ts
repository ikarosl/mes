import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import ProductsPage from '../ProductsPage.vue';

const { list, categoryOptions, success, error } = vi.hoisted(() => ({
  list: vi.fn(),
  categoryOptions: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../api/product', () => ({
  productApi: {
    products: list,
    categoryOptions,
    productOptions: vi.fn().mockResolvedValue([]),
    routeOptions: vi.fn().mockResolvedValue([]),
    userOptions: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../../stores/auth', () => ({
  useAuthStore: () => ({ can: () => true }),
}));
vi.mock('../../../utils/route-message-box', () => ({
  RouteMessageBox: { confirm: vi.fn() },
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

describe('ProductsPage create form', () => {
  beforeEach(() => {
    list.mockReset();
    list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    categoryOptions.mockReset();
    categoryOptions.mockResolvedValue([]);
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
        },
      },
    });
    await flushPromises();

    const createButton = wrapper.findAll('button').find((b) => b.text().includes('新增产品'));
    expect(createButton).toBeDefined();

    const callsBefore = categoryOptions.mock.calls.length;
    await createButton!.trigger('click');
    await flushPromises();

    expect(categoryOptions.mock.calls.length).toBe(callsBefore + 1);
  });
});
