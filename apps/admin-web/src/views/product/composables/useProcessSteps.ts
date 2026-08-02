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

  const loadSteps = async (): Promise<void> => {
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
      steps.value = result.items;
      total.value = result.total;
    } catch (error) {
      EMessage.error(error, '标准工序加载失败');
    } finally {
      loading.value = false;
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
