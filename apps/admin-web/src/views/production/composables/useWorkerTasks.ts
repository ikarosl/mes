import { ref } from 'vue';
import type { ProductionWorkerTaskItem } from '@company/contracts';
import { productionApi } from '../../../api/production';
import { useIdempotentIntent } from '../../../composables/idempotency/useIdempotentIntent';

export const useWorkerTasks = () => {
  const tasks = ref<ProductionWorkerTaskItem[]>([]);
  const loading = ref(false);
  const startPendingIds = ref(new Set<string>());
  const reportPendingIds = ref(new Set<string>());
  const reportIntents = new Map<string, ReturnType<typeof useIdempotentIntent>>();
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

  const report = async (
    task: ProductionWorkerTaskItem,
    normalQuantity: number,
    abnormalQuantity: number,
    remark: string | null,
  ): Promise<void> => {
    if (reportPendingIds.value.has(task.stepRecordId)) return;
    reportPendingIds.value = new Set(reportPendingIds.value).add(task.stepRecordId);
    const body = {
      version: task.version,
      normalQuantity,
      abnormalQuantity,
      remark: remark?.trim() || null,
    };
    const intent = reportIntents.get(task.stepRecordId) ?? useIdempotentIntent();
    reportIntents.set(task.stepRecordId, intent);
    try {
      await intent.execute(
        {
          intentType: 'production.step-report.create',
          params: { batchId: task.productionBatchId, stepRecordId: task.stepRecordId },
          query: {},
          body,
        },
        (key) =>
          productionApi.createStepReport(task.productionBatchId, task.stepRecordId, body, key),
      );
      reportIntents.delete(task.stepRecordId);
      await load();
    } finally {
      const next = new Set(reportPendingIds.value);
      next.delete(task.stepRecordId);
      reportPendingIds.value = next;
    }
  };

  return { tasks, loading, startPendingIds, reportPendingIds, load, start, report };
};
