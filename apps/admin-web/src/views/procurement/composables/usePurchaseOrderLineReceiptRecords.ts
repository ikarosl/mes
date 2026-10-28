import { computed, ref, shallowRef, watch } from 'vue';
import type { PurchaseOrderDetail, PurchaseOrderLineReceiptRecordPage } from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';

interface ReceiptRecordsContext {
  purchaseNo: string;
  lineId: string;
  itemName: string;
  materialVariantCode: string;
  supplierName: string;
  unit: string;
}

export function usePurchaseOrderLineReceiptRecords() {
  const visible = ref(false),
    context = ref<ReceiptRecordsContext | null>(null),
    keyword = ref(''),
    page = ref(1),
    pageSize = ref(10),
    loading = ref(false),
    failed = ref(false);
  const snapshot = shallowRef<PurchaseOrderLineReceiptRecordPage | null>(null);
  const rows = computed(() => snapshot.value?.items ?? []);
  const total = computed(() => snapshot.value?.total ?? 0);
  const receivedQuantity = computed(() => snapshot.value?.receivedQuantity ?? null);
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  let appliedKeyword = '';
  let session = 0;

  const load = async (): Promise<void> => {
    if (!visible.value || !read.isActive() || !context.value) return;
    const lineId = context.value.lineId;
    const currentSession = session;
    const query = {
      page: page.value,
      pageSize: pageSize.value,
      keyword: appliedKeyword || undefined,
    };
    const current = read.begin(
      () =>
        visible.value &&
        context.value?.lineId === lineId &&
        session === currentSession &&
        page.value === query.page &&
        pageSize.value === query.pageSize &&
        appliedKeyword === (query.keyword ?? ''),
    );
    loading.value = true;
    failed.value = false;
    try {
      const result = await procurementApi.purchaseOrderLineReceiptRecords(
        lineId,
        query,
        current.signal,
      );
      if (!current.isCurrent()) return;
      const lastPage = Math.max(1, Math.ceil(result.total / query.pageSize));
      if (query.page > lastPage) {
        page.value = lastPage;
        snapshot.value = null;
        await load();
        return;
      }
      snapshot.value = result;
    } catch (error) {
      if (current.isCurrent()) {
        failed.value = true;
        EMessage.error(error, '到货记录读取失败');
      }
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };
  const open = async (order: PurchaseOrderDetail, lineId: string): Promise<boolean> => {
    if (!read.isActive()) return false;
    const line = order.items.find((item) => item.id === lineId);
    if (!line || line.fulfillmentMode !== 'new_arrival') return false;
    read.invalidate();
    session += 1;
    context.value = {
      purchaseNo: order.purchaseNo,
      lineId: line.id,
      itemName: line.itemName,
      materialVariantCode: line.materialVariantCode,
      supplierName: line.supplierName,
      unit: line.unit,
    };
    keyword.value = '';
    appliedKeyword = '';
    page.value = 1;
    pageSize.value = 10;
    snapshot.value = null;
    failed.value = false;
    visible.value = true;
    await load();
    return true;
  };
  const close = (): void => {
    visible.value = false;
  };
  const search = async (): Promise<void> => {
    appliedKeyword = keyword.value.trim();
    page.value = 1;
    snapshot.value = null;
    await load();
  };
  const reset = async (): Promise<void> => {
    keyword.value = '';
    await search();
  };
  const changePage = async (value: number): Promise<void> => {
    page.value = value;
    snapshot.value = null;
    await load();
  };
  const changePageSize = async (value: number): Promise<void> => {
    pageSize.value = value;
    page.value = 1;
    snapshot.value = null;
    await load();
  };
  watch(
    visible,
    (value) => {
      if (!value) {
        session += 1;
        read.invalidate();
      }
    },
    { flush: 'sync' },
  );

  return {
    visible,
    context,
    keyword,
    page,
    pageSize,
    loading,
    failed,
    rows,
    total,
    receivedQuantity,
    open,
    close,
    load,
    search,
    reset,
    changePage,
    changePageSize,
  };
}
