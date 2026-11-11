import { computed, onActivated, onDeactivated, onScopeDispose, ref } from 'vue';
import type {
  ProcurementReceiptItem,
  ProcurementReceiptLineListItem,
  ProcurementReceiptWorklistLines,
} from '@company/contracts';
import { PROCUREMENT_RECEIPT_MAX_LINES } from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { usePageInitialLoad } from '../../../composables/requests/usePageInitialLoad';
import { EMessage } from '../../../utils/message';

export interface PurchaseReceiptState {
  receipt: ProcurementReceiptItem;
  items: ProcurementReceiptLineListItem[];
  loading: boolean;
  loaded: boolean;
  error: string;
}

interface ReceiptRead {
  controller: AbortController;
  isCurrent: () => boolean;
}

/** The server pages arrival documents; the current page and one exact location own separate reads. */
// TODO(high-priority-receipt-pagination-tests): 用户确认设计并授权后，补齐真实到货分页、页外定位及刷新/折叠/失活时迟到响应的正式覆盖。
export function usePurchaseReceipts(hasLocationIntent: () => boolean) {
  const keyword = ref('');
  const rows = ref<ProcurementReceiptItem[]>([]);
  const states = ref<Record<string, PurchaseReceiptState>>({});
  const expandedReceipts = ref(new Set<string>());
  const page = ref(1),
    pageSize = ref(10),
    total = ref(0),
    loading = ref(false),
    error = ref('');
  const focusedReceipt = ref<PurchaseReceiptState | null>(null);
  const focusedLineId = ref(''),
    focusedExpanded = ref(true);
  const locationLoading = ref(false),
    locationError = ref('');
  const childReads = new Map<string, ReceiptRead>();
  const listRead = useLatestReadRequest(() => {
    loading.value = false;
  });
  const locationRead = useLatestReadRequest(() => {
    locationLoading.value = false;
  });
  let active = true;
  let initializeExpansion = !hasLocationIntent();
  let appliedKeyword = '';
  let locationRevision = 0;
  let locationTarget = '';

  function emptyState(receipt: ProcurementReceiptItem): PurchaseReceiptState {
    return { receipt, items: [], loading: false, loaded: false, error: '' };
  }
  function loadedState(result: ProcurementReceiptWorklistLines): PurchaseReceiptState {
    return { ...result, loading: false, loaded: true, error: '' };
  }
  function validateLines(result: ProcurementReceiptWorklistLines, receiptId: string): void {
    if (
      result.receipt.id !== receiptId ||
      result.items.length > PROCUREMENT_RECEIPT_MAX_LINES ||
      result.items.length !== result.receipt.lineCount ||
      new Set(result.items.map((line) => line.id)).size !== result.items.length ||
      result.items.some(
        (line) =>
          line.receiptId !== receiptId || line.purchaseOrderId !== result.receipt.purchaseOrderId,
      )
    )
      throw new Error('到货物料与当前到货单不匹配或明细不完整，请重新读取');
  }
  function cancelChild(id: string): void {
    childReads.get(id)?.controller.abort();
    childReads.delete(id);
    if (states.value[id]) states.value[id].loading = false;
  }
  function cancelChildren(): void {
    for (const id of childReads.keys()) cancelChild(id);
  }
  function invalidateLocation(): void {
    locationRevision += 1;
    locationTarget = '';
    locationRead.invalidate();
  }
  function prioritizeLocation(): void {
    initializeExpansion = false;
  }

  async function loadLines(receipt: ProcurementReceiptItem): Promise<void> {
    const id = receipt.id;
    if (!active || !expandedReceipts.value.has(id) || !rows.value.some((row) => row.id === id))
      return;
    cancelChild(id);
    if (!states.value[id]) states.value[id] = emptyState(receipt);
    const state = states.value[id];
    const read: ReceiptRead = {
      controller: new AbortController(),
      isCurrent: () =>
        active &&
        childReads.get(id) === read &&
        states.value[id] === state &&
        expandedReceipts.value.has(id),
    };
    childReads.set(id, read);
    state.loading = true;
    try {
      const result = await procurementApi.receiptWorklistLines(id, read.controller.signal);
      if (!read.isCurrent()) return;
      validateLines(result, id);
      state.receipt = result.receipt;
      state.items = result.items;
      state.loaded = true;
      state.error = '';
      if (focusedReceipt.value?.receipt.id === id) focusedReceipt.value = state;
    } catch (cause) {
      if (read.isCurrent()) {
        state.error = '到货明细读取失败，请重试；已显示内容为上次读取结果。';
        EMessage.error(cause, '到货明细读取失败');
      }
    } finally {
      if (read.isCurrent()) {
        state.loading = false;
        childReads.delete(id);
      }
    }
  }

  async function readLocation(
    receiptId: string,
    receiptLineId: string,
    expand: boolean,
    matches: () => boolean,
  ): Promise<boolean> {
    if (!receiptId || !locationRead.isActive()) return false;
    locationRevision += 1;
    locationTarget = receiptId;
    const current = locationRead.begin(matches);
    locationLoading.value = true;
    locationError.value = '';
    try {
      const result = await procurementApi.receiptWorklistLines(receiptId, current.signal);
      if (!current.isCurrent()) return false;
      validateLines(result, receiptId);
      if (receiptLineId && !result.items.some((line) => line.id === receiptLineId))
        throw new Error('指定到货明细不属于该到货单');
      if (rows.value.some((row) => row.id === receiptId)) {
        cancelChild(receiptId);
        states.value[receiptId] = loadedState(result);
        focusedReceipt.value = states.value[receiptId];
        if (expand) expandedReceipts.value = new Set([...expandedReceipts.value, receiptId]);
      } else focusedReceipt.value = loadedState(result);
      focusedLineId.value = receiptLineId;
      if (expand) focusedExpanded.value = true;
      return true;
    } catch (cause) {
      if (current.isCurrent()) {
        locationError.value = '到货列表定位失败，请重新读取定位。';
        EMessage.error(cause, locationError.value);
      }
      return false;
    } finally {
      if (current.isCurrent()) {
        locationLoading.value = false;
        locationTarget = '';
      }
    }
  }

  async function refreshLocation(): Promise<void> {
    const id = focusedReceipt.value?.receipt.id;
    if (!id || !active || !focusedExpanded.value) return;
    await readLocation(
      id,
      focusedLineId.value,
      false,
      () => focusedReceipt.value?.receipt.id === id && focusedExpanded.value,
    );
  }
  async function revealReceipt(
    receiptId: string,
    receiptLineId = '',
    matches: () => boolean = () => true,
  ): Promise<boolean> {
    prioritizeLocation();
    return readLocation(receiptId, receiptLineId, true, matches);
  }

  async function load(): Promise<void> {
    if (!listRead.isActive()) return;
    const requestedPage = page.value,
      requestedSize = pageSize.value,
      requestedKeyword = appliedKeyword;
    const current = listRead.begin(
      () =>
        page.value === requestedPage &&
        pageSize.value === requestedSize &&
        appliedKeyword === requestedKeyword,
    );
    const initialLocationRevision = locationRevision;
    cancelChildren();
    loading.value = true;
    error.value = '';
    try {
      const result = await procurementApi.listReceipts(
        { page: requestedPage, pageSize: requestedSize, keyword: requestedKeyword || undefined },
        current.signal,
      );
      if (!current.isCurrent()) return;
      const lastPage = Math.max(1, Math.ceil(result.total / requestedSize));
      if (requestedPage > lastPage) {
        page.value = lastPage;
        await load();
        return;
      }
      rows.value = result.items;
      // Warehouse facts advance line versions, so even an unchanged receipt header cannot validate cached lines.
      states.value = Object.fromEntries(
        result.items.map((receipt) => [receipt.id, emptyState(receipt)]),
      );
      total.value = result.total;
      const ids = new Set(result.items.map((receipt) => receipt.id));
      expandedReceipts.value = new Set([...expandedReceipts.value].filter((id) => ids.has(id)));
      const focused = focusedReceipt.value;
      if (focused && ids.has(focused.receipt.id)) {
        focusedReceipt.value = states.value[focused.receipt.id];
        if (focusedExpanded.value) expandedReceipts.value.add(focused.receipt.id);
      }
      if (initializeExpansion && !hasLocationIntent())
        expandedReceipts.value = new Set(result.items[0] ? [result.items[0].id] : []);
      initializeExpansion = false;
      await Promise.all(
        result.items.filter((receipt) => expandedReceipts.value.has(receipt.id)).map(loadLines),
      );
      if (
        current.isCurrent() &&
        locationRevision === initialLocationRevision &&
        !locationLoading.value &&
        focusedReceipt.value &&
        !ids.has(focusedReceipt.value.receipt.id)
      )
        await refreshLocation();
    } catch (cause) {
      if (current.isCurrent()) {
        error.value = '到货目录读取失败，请重试；已显示内容为上次读取结果。';
        EMessage.error(cause, '到货目录读取失败');
      }
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  }

  async function toggleReceipt(receipt: ProcurementReceiptItem): Promise<void> {
    if (!active || loading.value) return;
    initializeExpansion = false;
    const next = new Set(expandedReceipts.value);
    const isFocused = focusedReceipt.value?.receipt.id === receipt.id;
    if (next.has(receipt.id)) {
      next.delete(receipt.id);
      cancelChild(receipt.id);
      if (locationTarget === receipt.id) invalidateLocation();
      if (isFocused) focusedExpanded.value = false;
    } else {
      next.add(receipt.id);
      if (isFocused) focusedExpanded.value = true;
    }
    expandedReceipts.value = next;
    if (next.has(receipt.id)) await loadLines(receipt);
  }
  async function expandPage(): Promise<void> {
    if (!active || loading.value) return;
    initializeExpansion = false;
    expandedReceipts.value = new Set(rows.value.map((receipt) => receipt.id));
    if (
      focusedReceipt.value &&
      rows.value.some((receipt) => receipt.id === focusedReceipt.value?.receipt.id)
    )
      focusedExpanded.value = true;
    await Promise.all(
      rows.value
        .filter((receipt) => !states.value[receipt.id]?.loaded || states.value[receipt.id]?.error)
        .map(loadLines),
    );
  }
  function collapsePage(): void {
    initializeExpansion = false;
    if (rows.value.some((receipt) => receipt.id === locationTarget)) invalidateLocation();
    if (
      focusedReceipt.value &&
      rows.value.some((receipt) => receipt.id === focusedReceipt.value?.receipt.id)
    )
      focusedExpanded.value = false;
    expandedReceipts.value = new Set();
    cancelChildren();
  }
  async function changePage(value: number): Promise<void> {
    cancelChildren();
    page.value = value;
    rows.value = [];
    states.value = {};
    expandedReceipts.value = new Set();
    initializeExpansion = !hasLocationIntent();
    await load();
  }
  async function search(): Promise<void> {
    appliedKeyword = keyword.value.trim();
    await changePage(1);
  }
  async function reset(): Promise<void> {
    keyword.value = '';
    await search();
  }
  async function changePageSize(value: number): Promise<void> {
    pageSize.value = value;
    await changePage(1);
  }
  function clearLocation(): void {
    invalidateLocation();
    focusedReceipt.value = null;
    focusedLineId.value = '';
    locationError.value = '';
  }
  async function toggleFocused(): Promise<void> {
    focusedExpanded.value = !focusedExpanded.value;
    if (!focusedExpanded.value) invalidateLocation();
    else if (focusedReceipt.value?.error || !focusedReceipt.value?.loaded) await refreshLocation();
  }
  const focusedIsInPage = computed(() =>
    rows.value.some((receipt) => receipt.id === focusedReceipt.value?.receipt.id),
  );
  function deactivate(): void {
    active = false;
    cancelChildren();
  }
  onActivated(() => {
    active = true;
  });
  onDeactivated(deactivate);
  onScopeDispose(deactivate);
  usePageInitialLoad(load);

  return {
    keyword,
    rows,
    states,
    expandedReceipts,
    page,
    pageSize,
    total,
    loading,
    error,
    focusedReceipt,
    focusedLineId,
    focusedExpanded,
    focusedIsInPage,
    locationLoading,
    locationError,
    load,
    loadLines,
    search,
    reset,
    changePage,
    changePageSize,
    toggleReceipt,
    expandPage,
    collapsePage,
    prioritizeLocation,
    revealReceipt,
    refreshLocation,
    clearLocation,
    toggleFocused,
  };
}
