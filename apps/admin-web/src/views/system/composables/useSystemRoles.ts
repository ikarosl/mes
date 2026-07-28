import { reactive, ref } from 'vue';
import { SYSTEM_STATUS } from '@company/constants';
import type { SystemRoleListItem } from '@company/contracts';
import { systemApi } from '../../../api/system';
import { EMessage } from '../../../utils/message';

export function useSystemRoles() {
  const roles = ref<SystemRoleListItem[]>([]);
  const loading = ref(false);
  const total = ref(0);
  const selectedRoles = ref<SystemRoleListItem[]>([]);
  const currentPage = ref(1);
  const pageSize = ref(10);
  const query = reactive({ keyword: '', name: '', code: '', status: '' });

  const loadRoles = async (): Promise<void> => {
    loading.value = true;
    try {
      const result = await systemApi.roles({
        page: currentPage.value,
        pageSize: pageSize.value,
        keyword: query.keyword.trim() || undefined,
        name: query.name.trim() || undefined,
        code: query.code.trim() || undefined,
        status:
          query.status === 'enabled'
            ? SYSTEM_STATUS.enabled
            : query.status === 'disabled'
              ? SYSTEM_STATUS.disabled
              : undefined,
      });
      roles.value = result.items;
      total.value = result.total;
    } catch (error) {
      EMessage.error(error, '角色列表加载失败');
    } finally {
      loading.value = false;
    }
  };

  const handleSearch = async (): Promise<void> => {
    currentPage.value = 1;
    await loadRoles();
  };

  const resetQuery = async (): Promise<void> => {
    Object.assign(query, { keyword: '', name: '', code: '', status: '' });
    currentPage.value = 1;
    await loadRoles();
  };

  const handlePageSizeChange = async (val: number): Promise<void> => {
    pageSize.value = val;
    currentPage.value = 1;
    await loadRoles();
  };

  const handlePageChange = async (val: number): Promise<void> => {
    currentPage.value = val;
    await loadRoles();
  };

  const handleSelectionChange = (selection: SystemRoleListItem[]): void => {
    selectedRoles.value = selection;
  };

  return {
    roles,
    loading,
    total,
    selectedRoles,
    currentPage,
    pageSize,
    query,
    loadRoles,
    handleSearch,
    resetQuery,
    handlePageSizeChange,
    handlePageChange,
    handleSelectionChange,
  };
}
