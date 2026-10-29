import { computed, onActivated, onDeactivated, onScopeDispose, ref } from 'vue';
import type {
  ProcurementInboundInspectionLineItem,
  QualityIncomingInspectionOrderItem,
  QualityIncomingInspectionReceiptItem,
  QualityIncomingInspectionReceiptLines,
} from '@company/contracts';
import { incomingInspectionOrdersApi } from '../../../api/incoming-inspection-orders';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { usePageInitialLoad } from '../../../composables/requests/usePageInitialLoad';
import { EMessage } from '../../../utils/message';

export interface IncomingInspectionReceiptState {
  receipt: QualityIncomingInspectionReceiptItem;
  items: ProcurementInboundInspectionLineItem[];
  loading: boolean;
  loaded: boolean;
  error: string;
}
interface IncomingInspectionOrderGroup {
  order: QualityIncomingInspectionOrderItem;
  page: number;
  total: number;
  receipts: QualityIncomingInspectionReceiptItem[];
  lines: Record<string, IncomingInspectionReceiptState>;
  expandedReceipts: Set<string>;
  hasCollapsed: boolean;
  loading: boolean;
  loaded: boolean;
  error: string;
}
interface ChildRequest {
  controller: AbortController;
  current: () => boolean;
}

/** The two directory pages own their bounded caches; inspection editors own their drafts. */
export function useIncomingInspectionOrders() {
  const keyword = ref('');
  const groups = ref<IncomingInspectionOrderGroup[]>([]);
  const expandedOrders = ref(new Set<string>());
  const page = ref(1);
  const pageSize = ref(10);
  const total = ref(0);
  const loading = ref(false);
  const error = ref('');
  const focusedReceipt = ref<IncomingInspectionReceiptState | null>(null);
  const focusedOrder = ref<QualityIncomingInspectionOrderItem | null>(null);
  const focusedLineId = ref('');
  const locationLoading = ref(false);
  const locationError = ref('');
  const childRequests = new Map<string, ChildRequest>();
  let active = true;
  let resetNextLoad = true;
  const listRead = useLatestReadRequest(() => {
    loading.value = false;
  });
  const locationRead = useLatestReadRequest(() => {
    locationLoading.value = false;
  });

  function createGroup(order: QualityIncomingInspectionOrderItem): IncomingInspectionOrderGroup {
    return {
      order,
      page: 1,
      total: 0,
      receipts: [],
      lines: {},
      expandedReceipts: new Set(),
      hasCollapsed: false,
      loading: false,
      loaded: false,
      error: '',
    };
  }
  function cancelChild(key: string): void {
    childRequests.get(key)?.controller.abort();
    childRequests.delete(key);
  }
  function cancelGroup(group: IncomingInspectionOrderGroup): void {
    cancelChild(`order:${group.order.id}`);
    group.loading = false;
    for (const [receiptId, state] of Object.entries(group.lines)) {
      cancelChild(`receipt:${receiptId}`);
      state.loading = false;
    }
  }
  function cancelChildren(): void {
    for (const group of groups.value) cancelGroup(group);
    for (const request of childRequests.values()) request.controller.abort();
    childRequests.clear();
  }
  function beginChild(key: string, matches: () => boolean): ChildRequest {
    cancelChild(key);
    const request: ChildRequest = {
      controller: new AbortController(),
      current: () => active && childRequests.get(key) === request && matches(),
    };
    childRequests.set(key, request);
    return request;
  }
  function isCurrentGroup(group: IncomingInspectionOrderGroup): boolean {
    return groups.value.includes(group) && expandedOrders.value.has(group.order.id);
  }

  async function loadLines(
    group: IncomingInspectionOrderGroup,
    receipt: QualityIncomingInspectionReceiptItem,
  ): Promise<void> {
    if (!active || !isCurrentGroup(group) || !group.expandedReceipts.has(receipt.receiptId)) return;
    const receiptId = receipt.receiptId;
    group.lines[receiptId] ??= { receipt, items: [], loading: false, loaded: false, error: '' };
    const state = group.lines[receiptId];
    const request = beginChild(
      `receipt:${receiptId}`,
      () =>
        isCurrentGroup(group) &&
        group.expandedReceipts.has(receiptId) &&
        group.lines[receiptId] === state,
    );
    state.loading = true;
    state.error = '';
    try {
      const result = await incomingInspectionOrdersApi.lines(receiptId, request.controller.signal);
      if (!request.current()) return;
      if (
        result.receipt.receiptId !== receiptId ||
        result.items.some((line) => line.receiptId !== receiptId)
      )
        throw new Error('到货物料与当前到货单不匹配');
      if (result.receipt.order?.id !== group.order.id) {
        state.error = '本单关联已变更，请刷新主单下的到货目录后核对。';
        state.loaded = false;
        return;
      }
      state.receipt = result.receipt;
      state.items = result.items;
      state.loaded = true;
    } catch (cause) {
      if (!request.current()) return;
      state.error = '到货物料加载失败，请重试。';
      state.loaded = false;
      EMessage.error(cause, state.error);
    } finally {
      if (request.current()) state.loading = false;
    }
  }

  async function loadReceipts(group: IncomingInspectionOrderGroup, reset = false): Promise<void> {
    if (!active || !isCurrentGroup(group)) return;
    cancelGroup(group);
    if (reset) {
      group.receipts = [];
      group.lines = {};
      group.expandedReceipts = new Set();
      group.loaded = false;
    }
    const requestedPage = group.page;
    const firstLoad = !group.loaded;
    const request = beginChild(
      `order:${group.order.id}`,
      () => isCurrentGroup(group) && group.page === requestedPage,
    );
    group.loading = true;
    group.error = '';
    try {
      const result = await incomingInspectionOrdersApi.receipts(
        group.order.id,
        { page: requestedPage, pageSize: 10 },
        request.controller.signal,
      );
      if (!request.current()) return;
      if (
        result.order.id !== group.order.id ||
        result.items.some((receipt) => receipt.order?.id !== group.order.id)
      )
        throw new Error('到货目录与当前质检主单不匹配');
      group.order = result.order;
      group.receipts = result.items;
      group.total = result.total;
      const ids = new Set(result.items.map((receipt) => receipt.receiptId));
      group.lines = Object.fromEntries(Object.entries(group.lines).filter(([id]) => ids.has(id)));
      group.expandedReceipts = new Set([...group.expandedReceipts].filter((id) => ids.has(id)));
      if (firstLoad && !group.hasCollapsed && result.items[0])
        group.expandedReceipts.add(result.items[0].receiptId);
      group.loaded = true;
      await Promise.all(
        result.items
          .filter((receipt) => group.expandedReceipts.has(receipt.receiptId))
          .map((receipt) => loadLines(group, receipt)),
      );
    } catch (cause) {
      if (!request.current()) return;
      group.error = '到货目录加载失败，请重试；已显示内容为上次读取结果。';
      EMessage.error(cause, '到货目录加载失败');
    } finally {
      if (request.current()) group.loading = false;
    }
  }

  async function load(): Promise<void> {
    if (!listRead.isActive()) return;
    const current = listRead.begin();
    const reset = resetNextLoad;
    cancelChildren();
    loading.value = true;
    error.value = '';
    try {
      // 质检主单没有统一办理状态，暂不按所含物料阶段筛选。
      const result = await incomingInspectionOrdersApi.list(
        {
          page: page.value,
          pageSize: pageSize.value,
          keyword: keyword.value.trim() || undefined,
        },
        current.signal,
      );
      if (!current.isCurrent()) return;
      const previous = new Map(groups.value.map((group) => [group.order.id, group]));
      groups.value = result.items.map((order) => {
        const group = reset ? createGroup(order) : (previous.get(order.id) ?? createGroup(order));
        group.order = order;
        return group;
      });
      total.value = result.total;
      resetNextLoad = false;
      const ids = new Set(result.items.map((order) => order.id));
      expandedOrders.value = new Set([...expandedOrders.value].filter((id) => ids.has(id)));
      if (reset && result.items[0]) expandedOrders.value = new Set([result.items[0].id]);
      await Promise.all(
        groups.value
          .filter((group) => expandedOrders.value.has(group.order.id))
          .map((group) => loadReceipts(group)),
      );
      if (current.isCurrent() && focusedLineId.value) await revealLine(focusedLineId.value);
    } catch (cause) {
      if (!current.isCurrent()) return;
      error.value = '质检主单加载失败，请重试；已显示内容为上次读取结果。';
      EMessage.error(cause, '质检主单加载失败');
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  }

  function collapseReceipts(group: IncomingInspectionOrderGroup): void {
    group.expandedReceipts.clear();
    group.hasCollapsed = true;
  }
  async function toggleOrder(group: IncomingInspectionOrderGroup): Promise<void> {
    const next = new Set(expandedOrders.value);
    if (next.has(group.order.id)) {
      next.delete(group.order.id);
      collapseReceipts(group);
      cancelGroup(group);
    } else next.add(group.order.id);
    expandedOrders.value = next;
    if (next.has(group.order.id)) await loadReceipts(group);
  }
  async function toggleReceipt(
    group: IncomingInspectionOrderGroup,
    receipt: QualityIncomingInspectionReceiptItem,
  ): Promise<void> {
    if (group.expandedReceipts.has(receipt.receiptId)) {
      group.expandedReceipts.delete(receipt.receiptId);
      cancelChild(`receipt:${receipt.receiptId}`);
      const state = group.lines[receipt.receiptId];
      if (state) state.loading = false;
      return;
    }
    group.expandedReceipts.add(receipt.receiptId);
    await loadLines(group, receipt);
  }
  async function changeReceiptPage(
    group: IncomingInspectionOrderGroup,
    value: number,
  ): Promise<void> {
    group.page = value;
    await loadReceipts(group, true);
  }
  async function expandPage(): Promise<void> {
    expandedOrders.value = new Set(groups.value.map((group) => group.order.id));
    await Promise.all(
      groups.value.map((group) => {
        if (group.loading) return;
        if (!group.loaded || group.error) return loadReceipts(group);
        return Promise.all(
          group.receipts
            .filter((receipt) => {
              const state = group.lines[receipt.receiptId];
              return (
                group.expandedReceipts.has(receipt.receiptId) &&
                !state?.loading &&
                (!state?.loaded || Boolean(state.error))
              );
            })
            .map((receipt) => loadLines(group, receipt)),
        );
      }),
    );
  }
  function collapsePage(): void {
    expandedOrders.value = new Set();
    for (const group of groups.value) collapseReceipts(group);
    cancelChildren();
  }
  async function changePage(value: number): Promise<void> {
    page.value = value;
    resetNextLoad = true;
    cancelChildren();
    groups.value = [];
    expandedOrders.value = new Set();
    await load();
  }
  async function search(): Promise<void> {
    await changePage(1);
  }
  async function reset(): Promise<void> {
    keyword.value = '';
    await search();
  }
  async function changePageSize(value: number): Promise<void> {
    pageSize.value = value;
    await search();
  }

  async function revealLine(receiptLineId: string): Promise<void> {
    if (!receiptLineId || !locationRead.isActive()) return;
    const request = locationRead.begin();
    locationLoading.value = true;
    locationError.value = '';
    try {
      const location = await incomingInspectionOrdersApi.locate(receiptLineId, request.signal);
      if (!request.isCurrent()) return;
      if (location.receiptLineId !== receiptLineId) throw new Error('到货明细定位不匹配');
      const group = groups.value.find((entry) => entry.order.id === location.order?.id);
      if (group) {
        expandedOrders.value = new Set([...expandedOrders.value, group.order.id]);
        if (!group.loaded) await loadReceipts(group);
        if (!request.isCurrent()) return;
        const receipt = group.receipts.find((entry) => entry.receiptId === location.receiptId);
        if (receipt && isCurrentGroup(group)) {
          group.expandedReceipts.add(receipt.receiptId);
          await loadLines(group, receipt);
          if (!request.isCurrent()) return;
          if (group.lines[receipt.receiptId]?.loaded && !group.lines[receipt.receiptId]?.error) {
            focusedReceipt.value = null;
            focusedOrder.value = null;
            focusedLineId.value = receiptLineId;
            return;
          }
        }
      }
      const result: QualityIncomingInspectionReceiptLines = await incomingInspectionOrdersApi.lines(
        location.receiptId,
        request.signal,
      );
      if (!request.isCurrent()) return;
      if (
        result.receipt.receiptId !== location.receiptId ||
        !result.items.some((line) => line.receiptLineId === receiptLineId)
      )
        throw new Error('到货明细不属于定位到货单');
      let order: QualityIncomingInspectionOrderItem | null = null;
      if (result.receipt.order)
        order = await incomingInspectionOrdersApi.get(result.receipt.order.id, request.signal);
      if (!request.isCurrent()) return;
      focusedReceipt.value = {
        ...result,
        items: result.items,
        loading: false,
        loaded: true,
        error: '',
      };
      focusedOrder.value = order;
      focusedLineId.value = receiptLineId;
    } catch (cause) {
      if (!request.isCurrent()) return;
      locationError.value = '列表归属定位失败，原到货明细及检验历史仍可在工作台核对。';
      EMessage.error(cause, locationError.value);
    } finally {
      if (request.isCurrent()) locationLoading.value = false;
    }
  }
  function clearLocation(): void {
    locationRead.invalidate();
    focusedReceipt.value = null;
    focusedOrder.value = null;
    focusedLineId.value = '';
    locationError.value = '';
  }
  const focusedIsInPage = computed(() =>
    groups.value.some((group) =>
      group.receipts.some(
        (receipt) => receipt.receiptId === focusedReceipt.value?.receipt.receiptId,
      ),
    ),
  );

  onActivated(() => {
    active = true;
  });
  onDeactivated(() => {
    active = false;
    cancelChildren();
  });
  onScopeDispose(() => {
    active = false;
    cancelChildren();
  });
  usePageInitialLoad(load);
  return {
    keyword,
    groups,
    expandedOrders,
    page,
    pageSize,
    total,
    loading,
    error,
    focusedReceipt,
    focusedOrder,
    focusedLineId,
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
    revealLine,
    clearLocation,
  };
}
