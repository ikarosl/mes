import { computed, reactive, ref, type Ref } from 'vue';
import { SYSTEM_STATUS } from '@company/constants';
import type { SystemRoleOption, SystemUserListItem } from '@company/contracts';
import { systemApi } from '../../../api/system';
import { EMessage } from '../../../utils/message';

/**
 * 用户列表逻辑。候选不再由本 composable 聚合加载：
 * 角色候选由用户页持有（岗位筛选、列表角色名、用户表单与分配角色弹窗共享），
 * 部门候选唯一消费者是用户表单弹窗，由弹窗自持；此处仅注入角色候选的
 * options ref，用于列表中的角色名展示。
 */
export function useSystemUsers(roleOptions: Readonly<Ref<SystemRoleOption[]>>) {
  const users = ref<SystemUserListItem[]>([]);
  const selectedUsers = ref<SystemUserListItem[]>([]);
  const loading = ref(false);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
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

  /** 列表 last-request-wins：快速查询/翻页时旧响应不得覆盖新结果 */
  let listRequestToken = 0;
  const loadUsers = async (): Promise<void> => {
    const token = ++listRequestToken;
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
      if (token !== listRequestToken) return; // 已有更新的请求，丢弃迟到响应
      users.value = result.items;
      total.value = result.total;
    } catch (error) {
      if (token !== listRequestToken) return; // 丢弃迟到失败，不误导提示
      EMessage.error(error, '用户列表加载失败');
    } finally {
      if (token === listRequestToken) loading.value = false;
    }
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
    handleSearch,
    resetQuery,
    handlePageSizeChange,
    handlePageChange,
    handleSelectionChange,
  };
}
