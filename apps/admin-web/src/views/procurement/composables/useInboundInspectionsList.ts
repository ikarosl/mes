import { ref } from 'vue';
import type {
  ProcurementInboundInspectionItem,
  ProcurementInboundInspectionQuery,
  ReceiptRoundStatus,
} from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { usePageActivationRefresh } from '../../../composables/requests/usePageActivationRefresh';
import { EMessage } from '../../../utils/message';
export function useInboundInspectionsList() {
  const keyword = ref(''),
    roundStatus = ref<ReceiptRoundStatus | ''>(''),
    status = ref<NonNullable<ProcurementInboundInspectionQuery['status']> | ''>(''),
    rows = ref<ProcurementInboundInspectionItem[]>([]),
    page = ref(1),
    pageSize = ref(10),
    total = ref(0),
    loading = ref(false);
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  const load = async (): Promise<void> => {
    if (!read.isActive()) return;
    const current = read.begin();
    loading.value = true;
    try {
      const result = await procurementApi.listInspections(
        {
          keyword: keyword.value.trim() || undefined,
          status: status.value || undefined,
          roundStatus: roundStatus.value || undefined,
          page: page.value,
          pageSize: pageSize.value,
        },
        current.signal,
      );
      if (current.isCurrent()) {
        rows.value = result.items;
        total.value = result.total;
      }
    } catch (error) {
      if (current.isCurrent()) EMessage.error(error, '来料检验待办加载失败');
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };
  const search = async (): Promise<void> => {
    page.value = 1;
    await load();
  };
  const reset = async (): Promise<void> => {
    keyword.value = '';
    status.value = '';
    roundStatus.value = '';
    await search();
  };
  const changePage = async (value: number): Promise<void> => {
    page.value = value;
    await load();
  };
  const changePageSize = async (value: number): Promise<void> => {
    pageSize.value = value;
    await search();
  };
  usePageActivationRefresh(load);
  return {
    keyword,
    status,
    roundStatus,
    rows,
    page,
    pageSize,
    total,
    loading,
    load,
    search,
    reset,
    changePage,
    changePageSize,
  };
}
