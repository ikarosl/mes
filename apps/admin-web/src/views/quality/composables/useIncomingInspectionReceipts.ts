import { computed, onDeactivated, onScopeDispose, ref } from 'vue';
import type {
  QualityIncomingInspectionLineItem,
  QualityIncomingInspectionReceiptItem,
  QualityIncomingInspectionReceiptLines,
} from '@company/contracts';
import { incomingInspectionReceiptsApi } from '../../../api/incoming-inspection-receipts';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { usePageInitialLoad } from '../../../composables/requests/usePageInitialLoad';
import { EMessage } from '../../../utils/message';

export interface IncomingInspectionReceiptState {
  receipt: QualityIncomingInspectionReceiptItem;
  items: QualityIncomingInspectionLineItem[];
  loading: boolean;
  loaded: boolean;
  error: string;
}

/** The paged directory and its optional located receipt never own report editor drafts. */
export function useIncomingInspectionReceipts(hasExplicitEntry: () => boolean) {
  const keyword = ref('');
  const rows = ref<QualityIncomingInspectionReceiptItem[]>([]);
  const states = ref<Record<string, IncomingInspectionReceiptState>>({});
  const expandedReceipts = ref(new Set<string>());
  const page = ref(1);
  const pageSize = ref(10);
  const total = ref(0);
  const loading = ref(false);
  const error = ref('');
  const focusedReceiptId = ref('');
  const focusedLineId = ref('');
  const locationLoading = ref(false);
  const locationError = ref('');
  const children = new Map<string, AbortController>();
  const receiptReads = new Map<string, symbol>();
  const initialEntryIsExplicit = hasExplicitEntry();
  let initializeExpansion = true;
  let expansionRevision = 0;
  let locationLineId = '';
  const listRead = useLatestReadRequest(() => {
    loading.value = false;
  });
  const locationRead = useLatestReadRequest(() => {
    locationLoading.value = false;
  });
  const focusedReceipt = computed(() => states.value[focusedReceiptId.value] ?? null);
  const focusedIsInPage = computed(() =>
    rows.value.some((receipt) => receipt.receiptId === focusedReceiptId.value),
  );
  const focusedExpanded = computed(() => expandedReceipts.value.has(focusedReceiptId.value));

  function cancelChild(id: string): void {
    children.get(id)?.abort();
    children.delete(id);
    if (states.value[id]) states.value[id].loading = false;
  }
  function cancelChildren(): void {
    for (const id of children.keys()) cancelChild(id);
  }
  function pruneCache(): void {
    const ids = new Set(rows.value.map((receipt) => receipt.receiptId));
    if (focusedReceiptId.value) ids.add(focusedReceiptId.value);
    states.value = Object.fromEntries(Object.entries(states.value).filter(([id]) => ids.has(id)));
    expandedReceipts.value = new Set([...expandedReceipts.value].filter((id) => ids.has(id)));
  }
  function validateLines(result: QualityIncomingInspectionReceiptLines, receiptId: string): void {
    if (
      result.receipt.receiptId !== receiptId ||
      result.items.length !== result.receipt.lineCount ||
      result.items.some((line) => line.receiptId !== receiptId) ||
      new Set(result.items.map((line) => line.receiptLineId)).size !== result.items.length
    )
      throw new Error('到货物料范围不完整或与当前到货单不匹配，请重新读取');
  }
  function stateFor(receipt: QualityIncomingInspectionReceiptItem): IncomingInspectionReceiptState {
    states.value[receipt.receiptId] ??= {
      receipt,
      items: [],
      loading: false,
      loaded: false,
      error: '',
    };
    return states.value[receipt.receiptId];
  }
  async function loadLines(receipt: QualityIncomingInspectionReceiptItem): Promise<void> {
    if (!listRead.isActive() || !expandedReceipts.value.has(receipt.receiptId)) return;
    const id = receipt.receiptId;
    cancelChild(id);
    const controller = new AbortController();
    children.set(id, controller);
    const revision = Symbol();
    receiptReads.set(id, revision);
    const state = stateFor(receipt);
    state.loading = true;
    const isCurrent = (): boolean =>
      listRead.isActive() &&
      children.get(id) === controller &&
      receiptReads.get(id) === revision &&
      states.value[id] === state &&
      expandedReceipts.value.has(id);
    try {
      const result = await incomingInspectionReceiptsApi.lines(id, controller.signal);
      if (!isCurrent()) return;
      validateLines(result, id);
      state.receipt = result.receipt;
      state.items = result.items;
      state.loaded = true;
      state.error = '';
    } catch (cause) {
      if (!isCurrent()) return;
      state.error = '物料读取失败，请重试；已显示内容为上次结果。';
      EMessage.error(cause, '到货物料读取失败');
    } finally {
      if (isCurrent()) {
        state.loading = false;
        children.delete(id);
      }
      if (receiptReads.get(id) === revision) receiptReads.delete(id);
    }
  }
  async function load(): Promise<void> {
    if (!listRead.isActive()) return;
    const current = listRead.begin();
    const requestedExpansionRevision = expansionRevision;
    cancelChildren();
    loading.value = true;
    try {
      const result = await incomingInspectionReceiptsApi.list(
        {
          keyword: keyword.value.trim() || undefined,
          page: page.value,
          pageSize: pageSize.value,
        },
        current.signal,
      );
      if (!current.isCurrent()) return;
      rows.value = result.items;
      total.value = result.total;
      error.value = '';
      pruneCache();
      if (
        initializeExpansion &&
        !initialEntryIsExplicit &&
        !hasExplicitEntry() &&
        !locationLineId &&
        requestedExpansionRevision === expansionRevision &&
        result.items[0]
      )
        expandedReceipts.value.add(result.items[0].receiptId);
      initializeExpansion = false;
      const visibleReceipts = [...rows.value];
      if (focusedReceipt.value && !focusedIsInPage.value)
        visibleReceipts.push(focusedReceipt.value.receipt);
      await Promise.all(
        visibleReceipts
          .filter((receipt) => expandedReceipts.value.has(receipt.receiptId))
          .map(loadLines),
      );
    } catch (cause) {
      if (!current.isCurrent()) return;
      error.value = '到货读取失败，请刷新重试；已显示内容为上次结果。';
      EMessage.error(cause, '到货读取失败');
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  }
  async function toggleReceipt(receipt: QualityIncomingInspectionReceiptItem): Promise<void> {
    expansionRevision += 1;
    if (expandedReceipts.value.has(receipt.receiptId)) {
      expandedReceipts.value.delete(receipt.receiptId);
      cancelChild(receipt.receiptId);
      return;
    }
    expandedReceipts.value.add(receipt.receiptId);
    await loadLines(receipt);
  }
  async function toggleFocused(): Promise<void> {
    if (focusedReceipt.value) await toggleReceipt(focusedReceipt.value.receipt);
  }
  async function expandPage(): Promise<void> {
    expansionRevision += 1;
    for (const receipt of rows.value) expandedReceipts.value.add(receipt.receiptId);
    await Promise.all(rows.value.map(loadLines));
  }
  function collapsePage(): void {
    expansionRevision += 1;
    for (const receipt of rows.value) {
      expandedReceipts.value.delete(receipt.receiptId);
      cancelChild(receipt.receiptId);
    }
  }
  async function search(): Promise<void> {
    page.value = 1;
    await load();
  }
  async function reset(): Promise<void> {
    keyword.value = '';
    await search();
  }
  async function changePage(value: number): Promise<void> {
    page.value = value;
    await load();
  }
  async function changePageSize(value: number): Promise<void> {
    pageSize.value = value;
    await search();
  }
  async function revealLine(receiptLineId: string): Promise<void> {
    if (!receiptLineId || !locationRead.isActive()) return;
    locationLineId = receiptLineId;
    const request = locationRead.begin();
    const requestedExpansionRevision = expansionRevision;
    const revision = Symbol();
    let receiptId = '';
    locationLoading.value = true;
    locationError.value = '';
    try {
      const location = await incomingInspectionReceiptsApi.locate(receiptLineId, request.signal);
      if (!request.isCurrent()) return;
      if (location.receiptLineId !== receiptLineId) throw new Error('到货明细定位不匹配');
      receiptId = location.receiptId;
      cancelChild(receiptId);
      receiptReads.set(receiptId, revision);
      const result = await incomingInspectionReceiptsApi.lines(location.receiptId, request.signal);
      if (!request.isCurrent()) return;
      validateLines(result, location.receiptId);
      if (!result.items.some((line) => line.receiptLineId === receiptLineId))
        throw new Error('到货明细不属于定位到货单');
      // A report save may have refreshed this receipt while location was reading it.
      // The newer receipt read owns its state, including its loading/error result.
      if (receiptReads.get(receiptId) === revision) {
        cancelChild(receiptId);
        states.value[receiptId] = {
          receipt: result.receipt,
          items: result.items,
          loading: false,
          loaded: true,
          error: '',
        };
      } else if (!states.value[receiptId]) {
        throw new Error('到货目录已变化，请重试列表定位');
      }
      focusedReceiptId.value = location.receiptId;
      focusedLineId.value = receiptLineId;
      if (requestedExpansionRevision === expansionRevision)
        expandedReceipts.value.add(location.receiptId);
      pruneCache();
    } catch (cause) {
      if (!request.isCurrent()) return;
      locationError.value = '列表定位失败，原到货明细及检验历史仍可在工作台核对。';
      EMessage.error(cause, locationError.value);
    } finally {
      if (request.isCurrent()) locationLoading.value = false;
      if (receiptReads.get(receiptId) === revision) receiptReads.delete(receiptId);
    }
  }
  function clearLocation(): void {
    locationRead.invalidate();
    locationLineId = '';
    focusedReceiptId.value = '';
    focusedLineId.value = '';
    locationError.value = '';
    pruneCache();
  }

  onDeactivated(cancelChildren);
  onScopeDispose(cancelChildren);
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
    search,
    reset,
    changePage,
    changePageSize,
    toggleReceipt,
    toggleFocused,
    loadLines,
    expandPage,
    collapsePage,
    revealLine,
    clearLocation,
  };
}
