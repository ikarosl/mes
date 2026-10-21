import { reactive, ref } from 'vue';
import type {
  ApprovalInstanceListItem,
  ApprovalInstanceStatus,
  ApprovalListScope,
} from '@company/contracts';
import { approvalApi } from '../../../api/approval';
import { EMessage } from '../../../utils/message';

/** 审批实例正式列表。请求代际保证快速切换筛选/分页时旧响应不能覆盖新列表。 */
export function useApprovalInstances() {
  const items = ref<ApprovalInstanceListItem[]>([]);
  const loading = ref(false);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
  const query = reactive<{
    scope: ApprovalListScope;
    status: ApprovalInstanceStatus | '';
    subjectId: string;
  }>({
    scope: 'all',
    status: '',
    subjectId: '',
  });
  let requestToken = 0;

  const load = async (): Promise<void> => {
    const token = ++requestToken;
    loading.value = true;
    try {
      const result = await approvalApi.instances({
        page: currentPage.value,
        pageSize: pageSize.value,
        scope: query.scope,
        status: query.status || undefined,
        subjectId: query.subjectId.trim() || undefined,
      });
      if (token !== requestToken) return;
      items.value = result.items;
      total.value = result.total;
    } catch (error) {
      if (token === requestToken) EMessage.error(error, '审批列表加载失败');
    } finally {
      if (token === requestToken) loading.value = false;
    }
  };

  const search = async (): Promise<void> => {
    currentPage.value = 1;
    await load();
  };

  const reset = async (): Promise<void> => {
    Object.assign(query, { scope: 'all', status: '', subjectId: '' });
    currentPage.value = 1;
    await load();
  };

  const changePageSize = async (value: number): Promise<void> => {
    pageSize.value = value;
    currentPage.value = 1;
    await load();
  };

  const changePage = async (value: number): Promise<void> => {
    currentPage.value = value;
    await load();
  };

  return {
    items,
    loading,
    total,
    currentPage,
    pageSize,
    query,
    load,
    search,
    reset,
    changePageSize,
    changePage,
  };
}
