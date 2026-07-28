import { computed, reactive, ref } from 'vue';
import { SYSTEM_STATUS } from '@company/constants';
import type {
  SystemDepartmentOption,
  SystemRoleOption,
  SystemUserListItem,
} from '@company/contracts';
import { systemApi } from '../../../api/system';
import { EMessage } from '../../../utils/message';

export function useSystemUsers() {
  const users = ref<SystemUserListItem[]>([]);
  const departmentOptions = ref<SystemDepartmentOption[]>([]);
  const roleOptions = ref<SystemRoleOption[]>([]);
  const selectedUsers = ref<SystemUserListItem[]>([]);
  const loading = ref(false);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
  let optionsRequest: Promise<void> | null = null;
  const query = reactive({
    keyword: '',
    username: '',
    displayName: '',
    roleId: '',
    status: '',
  });

  const roleNameMap = computed(() => new Map(roleOptions.value.map((r) => [r.id, r.name])));

  const getRoleName = (idOrCode: string): string => roleNameMap.value.get(idOrCode) ?? idOrCode;

  const formatUserRoles = (row: SystemUserListItem): string => {
    if (row.roleIds?.length) return row.roleIds.map(getRoleName).join('、');
    if (row.roles?.length) return row.roles.map(getRoleName).join('、');
    return '-';
  };

  const getPrimaryRoleName = (row: SystemUserListItem): string => {
    const id = row.roleIds?.[0];
    const code = row.roles?.[0];
    return id ? getRoleName(id) : code ? getRoleName(code) : '-';
  };

  const loadUsers = async (): Promise<void> => {
    loading.value = true;
    try {
      const result = await systemApi.users({
        page: currentPage.value,
        pageSize: pageSize.value,
        keyword: query.keyword.trim() || undefined,
        username: query.username.trim() || undefined,
        displayName: query.displayName.trim() || undefined,
        roleId: query.roleId || undefined,
        status:
          query.status === 'enabled'
            ? SYSTEM_STATUS.enabled
            : query.status === 'disabled'
              ? SYSTEM_STATUS.disabled
              : undefined,
      });
      users.value = result.items;
      total.value = result.total;
    } catch (error) {
      EMessage.error(error, '用户列表加载失败');
    } finally {
      loading.value = false;
    }
  };

  const loadOptions = (): Promise<void> => {
    if (!optionsRequest) {
      optionsRequest = (async () => {
        try {
          [departmentOptions.value, roleOptions.value] = await Promise.all([
            systemApi.departmentOptions(),
            systemApi.roleOptions(),
          ]);
        } catch (error) {
          EMessage.error(error, '用户选项加载失败');
        }
      })().finally(() => {
        optionsRequest = null;
      });
    }
    return optionsRequest;
  };

  const handleSearch = async (): Promise<void> => {
    currentPage.value = 1;
    await loadUsers();
  };

  const resetQuery = async (): Promise<void> => {
    Object.assign(query, { keyword: '', username: '', displayName: '', roleId: '', status: '' });
    currentPage.value = 1;
    await loadUsers();
  };

  const handlePageSizeChange = async (val: number): Promise<void> => {
    pageSize.value = val;
    currentPage.value = 1;
    await loadUsers();
  };

  const handlePageChange = async (val: number): Promise<void> => {
    currentPage.value = val;
    await loadUsers();
  };

  const handleSelectionChange = (selection: SystemUserListItem[]): void => {
    selectedUsers.value = selection;
  };

  return {
    users,
    departmentOptions,
    roleOptions,
    selectedUsers,
    loading,
    total,
    currentPage,
    pageSize,
    query,
    roleNameMap,
    getRoleName,
    formatUserRoles,
    getPrimaryRoleName,
    loadUsers,
    loadOptions,
    handleSearch,
    resetQuery,
    handlePageSizeChange,
    handlePageChange,
    handleSelectionChange,
  };
}
