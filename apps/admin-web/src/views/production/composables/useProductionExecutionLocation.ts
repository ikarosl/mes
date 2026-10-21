import { nextTick, watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { EMessage } from '../../../utils/message';

/** 外部专检来源定位仍通过执行页现有的任务切换和草稿保护。 */
export function useProductionExecutionLocation(options: {
  loading: Readonly<Ref<boolean>>;
  selectedBatchId: Readonly<Ref<string | null>>;
  selectBatch: (batchId: string) => Promise<void>;
  openStep: (stepId: string) => Promise<boolean>;
}): () => Promise<void> {
  const route = useRoute(),
    router = useRouter();
  let locating = false;
  const locate = async (): Promise<void> => {
    if (
      route.name !== 'production-execution-records' ||
      typeof route.query.batchId !== 'string' ||
      options.loading.value ||
      locating
    )
      return;
    const batchId = route.query.batchId;
    const stepId = typeof route.query.stepId === 'string' ? route.query.stepId : null;
    locating = true;
    try {
      await nextTick();
      if (options.loading.value || route.name !== 'production-execution-records') return;
      await options.selectBatch(batchId);
      if (
        options.selectedBatchId.value !== batchId ||
        route.name !== 'production-execution-records' ||
        route.query.batchId !== batchId
      )
        return;
      if (stepId && (route.query.stepId !== stepId || !(await options.openStep(stepId)))) return;
      if (
        route.name === 'production-execution-records' &&
        route.query.batchId === batchId &&
        (!stepId || route.query.stepId === stepId)
      ) {
        const query = { ...route.query };
        delete query.batchId;
        delete query.stepId;
        await router.replace({ query });
      }
    } finally {
      locating = false;
    }
  };
  watch(
    () => [route.name, route.query.batchId, route.query.stepId, options.loading.value],
    () => {
      void locate().catch((error: unknown) => EMessage.error(error, '生产任务定位失败'));
    },
  );
  return locate;
}
