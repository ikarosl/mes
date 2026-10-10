import { ref } from 'vue';
import type { ProductionWorkerTaskItem } from '@company/contracts';
import { productionApi } from '../../../api/production';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';

export const useWorkerTasks = () => {
  const tasks = ref<ProductionWorkerTaskItem[]>([]);
  const loading = ref(false),
    total = ref(0),
    page = ref(1),
    pageSize = ref(20),
    errorText = ref('');
  const reads = useLatestReadRequest(() => (loading.value = false));
  const load = async (): Promise<void> => {
    if (!reads.isActive()) return;
    const { isCurrent, signal } = reads.begin();
    loading.value = true;
    errorText.value = '';
    try {
      const result = await productionApi.listWorkerTasks(
        { page: page.value, pageSize: pageSize.value },
        { skipErrorHandling: true, signal },
      );
      if (!isCurrent()) return;
      tasks.value = result.items;
      total.value = result.total;
    } catch (error) {
      if (!isCurrent()) return;
      tasks.value = [];
      errorText.value = '本人任务刷新失败，旧操作依据已清除，请重试。';
      EMessage.error(error, errorText.value);
    } finally {
      if (isCurrent()) loading.value = false;
    }
  };
  return { tasks, loading, total, page, pageSize, errorText, load };
};
