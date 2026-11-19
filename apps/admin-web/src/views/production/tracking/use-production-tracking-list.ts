import { reactive, ref } from 'vue';
import { normalizeTrackingCardNo } from '@company/utils';
import type {
  ProductionTrackingAbnormalityStatus,
  ProductionTrackingCardItem,
  ProductionTrackingCardStatus,
  ProductionTrackingVisit,
  ProductionTrackingWorkbench,
} from '@company/contracts';
import { productionTrackingApi } from '../../../api/production/tracking';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';

export function useProductionTrackingList(beforeListRead: () => void) {
  const view = ref('cards'),
    page = ref(1),
    pageSize = ref(10),
    total = ref(0);
  const query = reactive<{
    batchId: string | null;
    stepRecordId: string;
    keyword: string;
    status: ProductionTrackingCardStatus | '';
    abnormalityStatus: ProductionTrackingAbnormalityStatus | '';
  }>({ batchId: null, stepRecordId: '', keyword: '', status: '', abnormalityStatus: '' });
  const cards = ref<ProductionTrackingCardItem[]>([]),
    reports = ref<ProductionTrackingVisit[]>([]),
    loading = ref(false),
    listError = ref('');
  const context = ref<ProductionTrackingWorkbench | null>(null),
    contextLoading = ref(false),
    contextError = ref('');
  const listReads = useLatestReadRequest(() => {
      loading.value = false;
    }),
    contextReads = useLatestReadRequest(() => {
      contextLoading.value = false;
    });
  async function loadContext(): Promise<void> {
    const id = query.batchId;
    contextReads.invalidate();
    if (!id) {
      context.value = null;
      return;
    }
    if (!contextReads.isActive()) return;
    const read = contextReads.begin(() => query.batchId === id);
    contextLoading.value = true;
    contextError.value = '';
    try {
      const value = await productionTrackingApi.workbench(id, {
        signal: read.signal,
        skipErrorHandling: true,
      });
      if (read.isCurrent()) context.value = value;
    } catch (error) {
      if (read.isCurrent()) {
        context.value = null;
        contextError.value = error instanceof Error ? error.message : '工序概览加载失败';
      }
    } finally {
      if (read.isCurrent()) contextLoading.value = false;
    }
  }
  async function loadList(): Promise<void> {
    if (!listReads.isActive()) return;
    const read = listReads.begin();
    beforeListRead();
    loading.value = true;
    listError.value = '';
    const params = {
      page: page.value,
      pageSize: pageSize.value,
      batchId: query.batchId || undefined,
      stepRecordId: query.stepRecordId || undefined,
    };
    try {
      if (view.value === 'history') {
        const value = await productionTrackingApi.reports(params, {
          signal: read.signal,
          skipErrorHandling: true,
        });
        if (!read.isCurrent()) return;
        reports.value = value.items;
        total.value = value.total;
      } else {
        const value = await productionTrackingApi.list(
          {
            ...params,
            keyword: normalizeTrackingCardNo(query.keyword) || undefined,
            status: query.status || undefined,
            abnormalityStatus: query.abnormalityStatus || undefined,
          },
          { signal: read.signal, skipErrorHandling: true },
        );
        if (!read.isCurrent()) return;
        cards.value = value.items;
        total.value = value.total;
      }
    } catch (error) {
      if (read.isCurrent())
        listError.value = error instanceof Error ? error.message : '追踪记录加载失败';
    } finally {
      if (read.isCurrent()) loading.value = false;
    }
  }
  function normalizeKeyword(): void {
    query.keyword = normalizeTrackingCardNo(query.keyword);
  }
  return {
    view,
    page,
    pageSize,
    total,
    query,
    cards,
    reports,
    loading,
    listError,
    context,
    contextLoading,
    contextError,
    contextReads,
    loadContext,
    loadList,
    normalizeKeyword,
  };
}
