import { computed, onActivated, onDeactivated, onScopeDispose, ref } from 'vue';
import type {
  ProcurementReceiptItem,
  ProcurementReceiptLineListItem,
  ProcurementReceiptPurchaseOrderItem,
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

export interface ReceiptPurchaseOrderGroup {
  purchaseOrder: ProcurementReceiptPurchaseOrderItem;
  page: number;
  total: number;
  receipts: ProcurementReceiptItem[];
  lines: Record<string, PurchaseReceiptState>;
  expandedReceipts: Set<string>;
  initializeReceiptExpansion: boolean;
  loading: boolean;
  loaded: boolean;
  error: string;
}

interface ChildRead {
  controller: AbortController;
  isCurrent: () => boolean;
}

/** 当前采购页、各采购的当前到货页及一个精确定位对象独立持有读取，办理草稿由弹窗所有。 */
export function usePurchaseReceiptOrders(hasLocationIntent: () => boolean) {
  const keyword = ref('');
  const awaitingAcceptance = ref(false);
  const groups = ref<ReceiptPurchaseOrderGroup[]>([]);
  const expandedOrders = ref(new Set<string>());
  const page = ref(1),
    pageSize = ref(10),
    total = ref(0),
    loading = ref(false),
    error = ref('');
  const focusedReceipt = ref<PurchaseReceiptState | null>(null);
  const focusedPurchaseOrder = ref<ProcurementReceiptPurchaseOrderItem | null>(null);
  const focusedLineId = ref('');
  const focusedExpanded = ref(true);
  const locationLoading = ref(false),
    locationError = ref('');
  const childReads = new Map<string, ChildRead>();
  let active = true;
  let resetNextLoad = true;
  // 读取失败或取消时保留初始化意图；定位或人工收起可以显式取消它。
  let initializeOrderExpansion = !hasLocationIntent();
  let locationRevision = 0;
  const listRead = useLatestReadRequest(() => {
    loading.value = false;
  });
  const locationRead = useLatestReadRequest(() => {
    locationLoading.value = false;
  });

  function invalidateLocation(): void {
    locationRevision += 1;
    locationRead.invalidate();
  }
  function createGroup(
    purchaseOrder: ProcurementReceiptPurchaseOrderItem,
  ): ReceiptPurchaseOrderGroup {
    return {
      purchaseOrder,
      page: 1,
      total: 0,
      receipts: [],
      lines: {},
      expandedReceipts: new Set(),
      initializeReceiptExpansion: false,
      loading: false,
      loaded: false,
      error: '',
    };
  }
  function cancelChild(key: string): void {
    childReads.get(key)?.controller.abort();
    childReads.delete(key);
  }
  function cancelGroup(group: ReceiptPurchaseOrderGroup): void {
    cancelChild(`purchase:${group.purchaseOrder.id}`);
    group.loading = false;
    for (const [id, state] of Object.entries(group.lines)) {
      cancelChild(`receipt:${id}`);
      state.loading = false;
    }
  }
  function cancelChildren(): void {
    for (const group of groups.value) cancelGroup(group);
    for (const read of childReads.values()) read.controller.abort();
    childReads.clear();
  }
  function beginChild(key: string, matches: () => boolean): ChildRead {
    cancelChild(key);
    const read: ChildRead = {
      controller: new AbortController(),
      isCurrent: () => active && childReads.get(key) === read && matches(),
    };
    childReads.set(key, read);
    return read;
  }
  function isCurrentGroup(group: ReceiptPurchaseOrderGroup): boolean {
    return groups.value.includes(group) && expandedOrders.value.has(group.purchaseOrder.id);
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
  function loadedState(result: ProcurementReceiptWorklistLines): PurchaseReceiptState {
    return { ...result, loading: false, loaded: true, error: '' };
  }

  async function loadLines(
    group: ReceiptPurchaseOrderGroup,
    receipt: ProcurementReceiptItem,
  ): Promise<void> {
    if (!active || !isCurrentGroup(group) || !group.expandedReceipts.has(receipt.id)) return;
    const id = receipt.id;
    group.lines[id] ??= { receipt, items: [], loading: false, loaded: false, error: '' };
    const state = group.lines[id];
    const read = beginChild(
      `receipt:${id}`,
      () => isCurrentGroup(group) && group.expandedReceipts.has(id) && group.lines[id] === state,
    );
    state.loading = true;
    state.error = '';
    try {
      const result = await procurementApi.receiptWorklistLines(id, read.controller.signal);
      if (!read.isCurrent()) return;
      validateLines(result, id);
      if (result.receipt.purchaseOrderId !== group.purchaseOrder.id)
        throw new Error('到货单与当前采购主单不匹配，请刷新采购目录');
      Object.assign(state, loadedState(result));
      if (focusedReceipt.value?.receipt.id === id) focusedReceipt.value = state;
    } catch (cause) {
      if (!read.isCurrent()) return;
      state.error = '到货明细读取失败，请重新读取。';
      state.loaded = false;
      EMessage.error(cause, state.error);
    } finally {
      if (read.isCurrent()) {
        state.loading = false;
        childReads.delete(`receipt:${id}`);
      }
    }
  }

  async function loadReceipts(group: ReceiptPurchaseOrderGroup, reset = false): Promise<void> {
    if (!active || !isCurrentGroup(group)) return;
    cancelGroup(group);
    if (reset) {
      group.receipts = [];
      group.lines = {};
      group.expandedReceipts = new Set();
      group.loaded = false;
    }
    const requestedPage = group.page;
    const read = beginChild(
      `purchase:${group.purchaseOrder.id}`,
      () => isCurrentGroup(group) && group.page === requestedPage,
    );
    group.loading = true;
    group.error = '';
    try {
      const result = await procurementApi.listPurchaseOrderReceipts(
        group.purchaseOrder.id,
        { page: requestedPage, pageSize: 10 },
        read.controller.signal,
      );
      if (!read.isCurrent()) return;
      if (
        result.purchaseOrder.id !== group.purchaseOrder.id ||
        result.items.some((receipt) => receipt.purchaseOrderId !== group.purchaseOrder.id)
      )
        throw new Error('到货目录与当前采购单不匹配');
      const lastPage = Math.max(1, Math.ceil(result.total / 10));
      if (requestedPage > lastPage) {
        group.page = lastPage;
        await loadReceipts(group, true);
        return;
      }
      group.purchaseOrder = result.purchaseOrder;
      group.receipts = result.items;
      group.total = result.total;
      const ids = new Set(result.items.map((receipt) => receipt.id));
      group.lines = Object.fromEntries(Object.entries(group.lines).filter(([id]) => ids.has(id)));
      group.expandedReceipts = new Set([...group.expandedReceipts].filter((id) => ids.has(id)));
      if (group.initializeReceiptExpansion)
        group.expandedReceipts = new Set(result.items[0] ? [result.items[0].id] : []);
      group.initializeReceiptExpansion = false;
      group.loaded = true;
      await Promise.all(
        result.items
          .filter((receipt) => group.expandedReceipts.has(receipt.id))
          .map((receipt) => loadLines(group, receipt)),
      );
    } catch (cause) {
      if (!read.isCurrent()) return;
      group.error = '到货目录读取失败，请重试；已显示内容为上次读取结果。';
      EMessage.error(cause, '到货目录读取失败');
    } finally {
      if (read.isCurrent()) {
        group.loading = false;
        childReads.delete(`purchase:${group.purchaseOrder.id}`);
      }
    }
  }

  async function refreshLocation(): Promise<void> {
    const receiptId = focusedReceipt.value?.receipt.id;
    if (!receiptId || !active || !focusedExpanded.value) return;
    const group = groups.value.find((entry) =>
      entry.receipts.some((receipt) => receipt.id === receiptId),
    );
    const state = group?.lines[receiptId];
    if (group && !group.error) {
      if (state?.loaded && !state.error) focusedReceipt.value = state;
      focusedPurchaseOrder.value = group.purchaseOrder;
      return;
    }
    locationRevision += 1;
    const read = locationRead.begin(() => focusedReceipt.value?.receipt.id === receiptId);
    locationLoading.value = true;
    locationError.value = '';
    try {
      const result = await procurementApi.receiptWorklistLines(receiptId, read.signal);
      if (!read.isCurrent()) return;
      validateLines(result, receiptId);
      const purchaseOrder = await procurementApi.getReceiptPurchaseOrder(
        result.receipt.purchaseOrderId,
        read.signal,
      );
      if (!read.isCurrent()) return;
      if (purchaseOrder.id !== result.receipt.purchaseOrderId) throw new Error('定位采购单不匹配');
      focusedReceipt.value = loadedState(result);
      focusedPurchaseOrder.value = purchaseOrder;
    } catch (cause) {
      if (!read.isCurrent()) return;
      locationError.value = '当前定位读取失败，请重试；旧内容仅供参考。';
      EMessage.error(cause, locationError.value);
    } finally {
      if (read.isCurrent()) locationLoading.value = false;
    }
  }

  async function load(): Promise<void> {
    if (!listRead.isActive()) return;
    const requestedPage = page.value;
    const reset = resetNextLoad;
    const current = listRead.begin(() => page.value === requestedPage);
    cancelChildren();
    invalidateLocation();
    const initialLocationRevision = locationRevision;
    loading.value = true;
    error.value = '';
    try {
      const result = await procurementApi.listReceiptPurchaseOrders(
        {
          page: requestedPage,
          pageSize: pageSize.value,
          keyword: keyword.value.trim() || undefined,
          awaitingAcceptance: awaitingAcceptance.value ? 'yes' : undefined,
        },
        current.signal,
      );
      if (!current.isCurrent()) return;
      const lastPage = Math.max(1, Math.ceil(result.total / pageSize.value));
      if (requestedPage > lastPage) {
        page.value = lastPage;
        resetNextLoad = true;
        await load();
        return;
      }
      const previous = new Map(groups.value.map((group) => [group.purchaseOrder.id, group]));
      groups.value = result.items.map((purchaseOrder) => {
        const group = reset
          ? createGroup(purchaseOrder)
          : (previous.get(purchaseOrder.id) ?? createGroup(purchaseOrder));
        group.purchaseOrder = purchaseOrder;
        return group;
      });
      total.value = result.total;
      resetNextLoad = false;
      const ids = new Set(result.items.map((purchaseOrder) => purchaseOrder.id));
      expandedOrders.value = new Set([...expandedOrders.value].filter((id) => ids.has(id)));
      if (initializeOrderExpansion && !hasLocationIntent()) {
        const firstGroup = groups.value[0];
        expandedOrders.value = new Set(firstGroup ? [firstGroup.purchaseOrder.id] : []);
        if (firstGroup) firstGroup.initializeReceiptExpansion = true;
      }
      initializeOrderExpansion = false;
      await Promise.all(
        groups.value
          .filter((group) => expandedOrders.value.has(group.purchaseOrder.id))
          .map((group) => loadReceipts(group)),
      );
      if (current.isCurrent() && locationRevision === initialLocationRevision)
        await refreshLocation();
    } catch (cause) {
      if (!current.isCurrent()) return;
      error.value = '采购到货目录读取失败，请重试；已显示内容为上次读取结果。';
      EMessage.error(cause, '采购到货目录读取失败');
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  }

  function collapseReceipts(group: ReceiptPurchaseOrderGroup): void {
    group.expandedReceipts = new Set();
    group.initializeReceiptExpansion = false;
  }
  function prioritizeLocation(): void {
    initializeOrderExpansion = false;
    for (const group of groups.value) group.initializeReceiptExpansion = false;
  }
  async function toggleOrder(group: ReceiptPurchaseOrderGroup): Promise<void> {
    if (!active || loading.value) return;
    const next = new Set(expandedOrders.value);
    if (next.has(group.purchaseOrder.id)) {
      invalidateLocation();
      next.delete(group.purchaseOrder.id);
      collapseReceipts(group);
      cancelGroup(group);
    } else next.add(group.purchaseOrder.id);
    expandedOrders.value = next;
    if (next.has(group.purchaseOrder.id)) await loadReceipts(group);
  }
  async function toggleReceipt(
    group: ReceiptPurchaseOrderGroup,
    receipt: ProcurementReceiptItem,
  ): Promise<void> {
    if (!active || !isCurrentGroup(group)) return;
    group.initializeReceiptExpansion = false;
    if (group.expandedReceipts.has(receipt.id)) {
      invalidateLocation();
      group.expandedReceipts.delete(receipt.id);
      cancelChild(`receipt:${receipt.id}`);
      const state = group.lines[receipt.id];
      if (state) state.loading = false;
      return;
    }
    group.expandedReceipts.add(receipt.id);
    await loadLines(group, receipt);
  }
  async function changeReceiptPage(group: ReceiptPurchaseOrderGroup, value: number): Promise<void> {
    if (!active || !isCurrentGroup(group)) return;
    invalidateLocation();
    group.page = value;
    group.initializeReceiptExpansion = !hasLocationIntent();
    await loadReceipts(group, true);
  }
  async function expandPage(): Promise<void> {
    if (!active || loading.value) return;
    expandedOrders.value = new Set(groups.value.map((group) => group.purchaseOrder.id));
    await Promise.all(
      groups.value
        .filter((group) => !group.loading && (!group.loaded || Boolean(group.error)))
        .map((group) => loadReceipts(group)),
    );
  }
  function collapsePage(): void {
    initializeOrderExpansion = false;
    invalidateLocation();
    expandedOrders.value = new Set();
    for (const group of groups.value) collapseReceipts(group);
    cancelChildren();
  }
  async function changePage(value: number): Promise<void> {
    invalidateLocation();
    cancelChildren();
    page.value = value;
    resetNextLoad = true;
    initializeOrderExpansion = !hasLocationIntent();
    groups.value = [];
    expandedOrders.value = new Set();
    await load();
  }
  async function search(): Promise<void> {
    await changePage(1);
  }
  async function reset(): Promise<void> {
    keyword.value = '';
    awaitingAcceptance.value = false;
    await search();
  }
  async function changePageSize(value: number): Promise<void> {
    pageSize.value = value;
    await search();
  }

  async function revealReceipt(
    receiptId: string,
    receiptLineId = '',
    matches: () => boolean = () => true,
  ): Promise<boolean> {
    if (!receiptId || !locationRead.isActive()) return false;
    prioritizeLocation();
    locationRevision += 1;
    const read = locationRead.begin(matches);
    locationLoading.value = true;
    locationError.value = '';
    try {
      const result = await procurementApi.receiptWorklistLines(receiptId, read.signal);
      if (!read.isCurrent()) return false;
      validateLines(result, receiptId);
      if (receiptLineId && !result.items.some((line) => line.id === receiptLineId))
        throw new Error('指定到货明细不属于该到货单');
      const group = groups.value.find(
        (entry) => entry.purchaseOrder.id === result.receipt.purchaseOrderId,
      );
      let purchaseOrder = group?.purchaseOrder;
      if (group) {
        expandedOrders.value = new Set([...expandedOrders.value, group.purchaseOrder.id]);
        if (!group.loaded || group.error) await loadReceipts(group);
        if (!read.isCurrent()) return false;
        purchaseOrder = group.purchaseOrder;
        if (group.receipts.some((receipt) => receipt.id === receiptId) && isCurrentGroup(group)) {
          cancelChild(`receipt:${receiptId}`);
          group.lines[receiptId] = loadedState(result);
          group.expandedReceipts.add(receiptId);
          focusedReceipt.value = group.lines[receiptId]!;
        } else focusedReceipt.value = loadedState(result);
      } else {
        purchaseOrder = await procurementApi.getReceiptPurchaseOrder(
          result.receipt.purchaseOrderId,
          read.signal,
        );
        if (!read.isCurrent()) return false;
        if (purchaseOrder.id !== result.receipt.purchaseOrderId)
          throw new Error('定位采购单不匹配');
        focusedReceipt.value = loadedState(result);
      }
      focusedPurchaseOrder.value = purchaseOrder ?? null;
      focusedLineId.value = receiptLineId;
      focusedExpanded.value = true;
      return true;
    } catch (cause) {
      if (!read.isCurrent()) return false;
      locationError.value = '到货列表定位失败，请重新读取定位。';
      EMessage.error(cause, locationError.value);
      return false;
    } finally {
      if (read.isCurrent()) locationLoading.value = false;
    }
  }
  function clearLocation(): void {
    invalidateLocation();
    focusedReceipt.value = null;
    focusedPurchaseOrder.value = null;
    focusedLineId.value = '';
    locationError.value = '';
  }
  function toggleFocused(): void {
    focusedExpanded.value = !focusedExpanded.value;
    if (!focusedExpanded.value) invalidateLocation();
  }
  const focusedIsInPage = computed(() =>
    groups.value.some(
      (group) =>
        group.loaded &&
        !group.error &&
        group.receipts.some((receipt) => receipt.id === focusedReceipt.value?.receipt.id),
    ),
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
    awaitingAcceptance,
    groups,
    expandedOrders,
    page,
    pageSize,
    total,
    loading,
    error,
    focusedReceipt,
    focusedPurchaseOrder,
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
    toggleOrder,
    toggleReceipt,
    loadReceipts,
    loadLines,
    changeReceiptPage,
    expandPage,
    collapsePage,
    prioritizeLocation,
    revealReceipt,
    refreshLocation,
    clearLocation,
    toggleFocused,
  };
}
