import { ref } from 'vue';
import type { ProductionWorkerTaskItem } from '@company/contracts';
import { productionApi } from '../../../api/production';

export const useWorkerTasks = () => {
  const tasks = ref<ProductionWorkerTaskItem[]>([]);
  const loading = ref(false);
  const startPendingIds = ref(new Set<string>());
  let requestToken = 0;

  const load = async (): Promise<void> => {
    const token = ++requestToken;
    loading.value = true;
    try {
      const rows = await productionApi.listWorkerTasks();
      if (token === requestToken) tasks.value = rows;
    } finally {
      if (token === requestToken) loading.value = false;
    }
  };

  const start = async (task: ProductionWorkerTaskItem): Promise<void> => {
    if (startPendingIds.value.has(task.stepRecordId)) return;
    startPendingIds.value = new Set(startPendingIds.value).add(task.stepRecordId);
    try {
      await productionApi.startStep(task.productionBatchId, task.stepRecordId, task.version);
      await load();
    } finally {
      const next = new Set(startPendingIds.value);
      next.delete(task.stepRecordId);
      startPendingIds.value = next;
    }
  };

  return { tasks, loading, startPendingIds, load, start };
};
