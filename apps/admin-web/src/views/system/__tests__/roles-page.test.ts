import { flushPromises, shallowMount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import RolesPage from '../RolesPage.vue';

const { roles } = vi.hoisted(() => ({ roles: vi.fn() }));
vi.mock('../../../api/system', () => ({
  systemApi: {
    roles,
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn(),
  },
}));
vi.mock('../../../stores/auth', () => ({
  useAuthStore: () => ({ can: () => true }),
}));

describe('RolesPage', () => {
  it('loads the first server-paginated page on mount', async () => {
    roles.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });

    shallowMount(RolesPage, {
      global: {
        directives: { loading: () => undefined },
        stubs: {
          'el-form': true,
          'el-form-item': true,
          'el-input': true,
          'el-select': true,
          'el-option': true,
          'el-button': true,
          'el-tooltip': true,
          'el-table': true,
          'el-table-column': true,
          'el-tag': true,
          'el-pagination': true,
        },
      },
    });
    await flushPromises();

    expect(roles).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      keyword: undefined,
      name: undefined,
      code: undefined,
      status: undefined,
    });
  });
});
