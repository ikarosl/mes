import { reactive, ref } from 'vue';
import { SYSTEM_STATUS } from '@company/constants';
import type { ProcessStepListItem, ProcessStepQuery } from '@company/contracts';
import { productApi } from '../../../api/product';
import { EMessage } from '../../../utils/message';

export function useProcessSteps() {
  const steps = ref<ProcessStepListItem[]>([]);
  const loading = ref(false);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
  const query = reactive<{ keyword: string; status: string }>({ keyword: '', status: '' });
  /** 列表请求代际：快速查询/翻页时丢弃旧响应（last-request-wins，见 frontend-architecture §7.3） */
  let listRequestToken = 0;

  const loadSteps = async (): Promise<void> => {
    const token = ++listRequestToken;
    loading.value = true;
    try {
      const params: ProcessStepQuery = {
        page: currentPage.value,
        pageSize: pageSize.value,
        keyword: query.keyword.trim() || undefined,
        status:
          query.status === 'enabled'
            ? SYSTEM_STATUS.enabled
            : query.status === 'disabled'
              ? SYSTEM_STATUS.disabled
              : undefined,
      };
      const result = await productApi.processSteps(params);
      if (token !== listRequestToken) return; // 查询/翻页已变化，丢弃旧响应
      steps.value = result.items;
      total.value = result.total;
    } catch (error) {
      if (token !== listRequestToken) return; // 丢弃旧请求的失败，不误导提示
      EMessage.error(error, '标准工序加载失败');
    } finally {
      if (token === listRequestToken) loading.value = false; // loading 只由最新请求结束
    }
  };

  const handleSearch = async (): Promise<void> => {
    currentPage.value = 1;
    await loadSteps();
  };
  const resetQuery = async (): Promise<void> => {
    Object.assign(query, { keyword: '', status: '' });
    currentPage.value = 1;
    await loadSteps();
  };
  const handlePageSizeChange = async (val: number): Promise<void> => {
    pageSize.value = val;
    currentPage.value = 1;
    await loadSteps();
  };
  const handlePageChange = async (val: number): Promise<void> => {
    currentPage.value = val;
    await loadSteps();
  };

  return {
    steps,
    loading,
    total,
    currentPage,
    pageSize,
    query,
    loadSteps,
    handleSearch,
    resetQuery,
    handlePageSizeChange,
    handlePageChange,
  };
}
