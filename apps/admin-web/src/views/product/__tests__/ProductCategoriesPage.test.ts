import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import ProductCategoriesPage from '../ProductCategoriesPage.vue';

const { list, setStatus, confirm, success, error } = vi.hoisted(() => ({
  list: vi.fn(),
  setStatus: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../api/product', () => ({
  productApi: {
    categories: list,
    categoryOptions: vi.fn().mockResolvedValue([]),
    setCategoryStatus: setStatus,
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

const categoryRow = {
  id: 'c1',
  categoryCode: 'C1',
  categoryName: '成品',
  itemKind: 'finished_product',
  status: 1,
  remark: null,
  updatedAt: null,
};

describe('ProductCategoriesPage row write guard', () => {
  const mountPage = () =>
    mount(ProductCategoriesPage, {
      global: {
        plugins: [ElementPlus, createPinia()],
        stubs: {
          TableToolbar: true,
          PaginationFooter: true,
          ProductCategoryFormDialog: true,
          ProductCategoryDetailDialog: true,
        },
      },
    });

  beforeEach(() => {
    list.mockReset();
    list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    setStatus.mockReset();
    setStatus.mockResolvedValue(undefined);
    confirm.mockReset();
  });

  it('disables the toggle-status button while the write is pending and submits once', async () => {
    list.mockResolvedValue({ items: [categoryRow], total: 1, page: 1, pageSize: 10 });
    let confirmResolve!: (value: unknown) => void;
    confirm.mockReturnValue(new Promise((resolve) => (confirmResolve = resolve)));

    const wrapper = mountPage();
    await flushPromises();

    const findToggle = () => wrapper.findAll('button').find((b) => b.text().trim() === '停用');
    expect(findToggle()).toBeDefined();
    expect(findToggle()!.attributes('disabled')).toBeUndefined();

    await findToggle()!.trigger('click');
    await nextTick();
    expect(findToggle()!.attributes('disabled')).toBeDefined(); // 确认框期间行内写操作被占用
    expect(setStatus).not.toHaveBeenCalled();

    confirmResolve('confirm');
    await flushPromises();
    expect(setStatus).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalledWith('c1', 0);
    expect(findToggle()!.attributes('disabled')).toBeUndefined(); // 写操作结束释放
  });
});
