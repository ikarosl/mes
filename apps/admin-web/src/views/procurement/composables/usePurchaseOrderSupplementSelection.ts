import { computed, ref, watch } from 'vue';
import type {
  PurchaseExcessReceiptCandidate,
  PurchaseOrderLine,
  PurchaseOrderSupplementReason,
  PurchaseQualityReplacementCandidate,
} from '@company/contracts';
import { PURCHASE_ORDER_MAX_LINES } from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import {
  copySupplementBasis,
  type SupplementBasisChoice,
  type SupplementBasisConfirmation,
} from '../supplement-basis';
import type { SupplementLocation } from './usePurchaseOrderSupplement';

interface SupplementCandidatePage {
  keyword: string;
  page: number;
  pageSize: number;
  total: number;
  excessRows: PurchaseExcessReceiptCandidate[];
  qualityRows: PurchaseQualityReplacementCandidate[];
  receiptLineId?: string;
  error: boolean;
}

interface SupplementSelectionContext {
  orderId: () => string;
  reason: () => PurchaseOrderSupplementReason | '';
  lines: () => PurchaseOrderLine[];
  added: () => SupplementBasisChoice[];
  disabled: () => boolean;
}

export function usePurchaseOrderSupplementSelection(context: SupplementSelectionContext) {
  const visible = ref(false),
    sourceOrderId = ref(''),
    sourceReason = ref<PurchaseOrderSupplementReason | ''>(''),
    replacingLineId = ref(''),
    focusedLineId = ref(''),
    lineSearch = ref(''),
    loading = ref(false);
  const pages = ref(new Map<string, SupplementCandidatePage>());
  const choices = ref(new Map<string, SupplementBasisChoice>());
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  let session = 0;
  const addedIds = computed(() => new Set(context.added().map((choice) => choice.line.id)));
  const directory = computed(() => {
    const keyword = lineSearch.value.trim().toLocaleLowerCase();
    return context
      .lines()
      .filter(
        (line) =>
          (!replacingLineId.value || line.id === replacingLineId.value) &&
          (!keyword ||
            [line.id, line.itemCode, line.itemName, line.materialVariantCode, line.supplierName]
              .join(' ')
              .toLocaleLowerCase()
              .includes(keyword)),
      );
  });
  const currentLine = computed(() =>
    context.lines().find((line) => line.id === focusedLineId.value),
  );
  const currentPage = computed(() => pages.value.get(focusedLineId.value));
  const currentChoice = computed(() => choices.value.get(focusedLineId.value));
  const isAlreadyAdded = (lineId: string): boolean =>
    addedIds.value.has(lineId) && lineId !== replacingLineId.value;
  const canConfirm = computed(
    () =>
      visible.value &&
      !context.disabled() &&
      !loading.value &&
      choices.value.size > 0 &&
      (replacingLineId.value ||
        choices.value.size + addedIds.value.size <= PURCHASE_ORDER_MAX_LINES) &&
      [...choices.value.keys()].every(
        (id) => !isAlreadyAdded(id) && context.lines().some((line) => line.id === id),
      ),
  );
  const ensurePage = (lineId: string): SupplementCandidatePage => {
    if (!pages.value.has(lineId)) {
      pages.value.set(lineId, {
        keyword: '',
        page: 1,
        pageSize: 10,
        total: 0,
        excessRows: [],
        qualityRows: [],
        error: false,
      });
    }
    return pages.value.get(lineId)!;
  };
  const load = async (): Promise<void> => {
    if (
      !visible.value ||
      !read.isActive() ||
      context.disabled() ||
      !sourceReason.value ||
      !currentLine.value ||
      isAlreadyAdded(currentLine.value.id)
    )
      return;
    const lineId = currentLine.value.id;
    const state = ensurePage(lineId);
    const reason = sourceReason.value;
    const currentSession = session;
    const current = read.begin(
      () =>
        visible.value &&
        session === currentSession &&
        context.orderId() === sourceOrderId.value &&
        context.reason() === reason &&
        focusedLineId.value === lineId &&
        !context.disabled(),
    );
    const query = {
      page: state.page,
      pageSize: state.pageSize,
      keyword: state.keyword.trim() || undefined,
      receiptLineId: state.receiptLineId,
    };
    loading.value = true;
    state.error = false;
    try {
      if (reason === 'excess_purchase') {
        const result = await procurementApi.excessReceiptCandidates(lineId, query, current.signal);
        if (!current.isCurrent()) return;
        state.excessRows = result.items;
        state.total = result.total;
      } else {
        const result = await procurementApi.qualityReplacementCandidates(
          lineId,
          query,
          current.signal,
        );
        if (!current.isCurrent()) return;
        state.qualityRows = result.items;
        state.total = result.total;
      }
    } catch (error) {
      if (current.isCurrent()) {
        state.error = true;
        EMessage.error(error, '补单依据读取失败');
      }
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };
  const focusLine = async (lineId: string): Promise<void> => {
    if (context.disabled() || !context.lines().some((line) => line.id === lineId)) return;
    if (replacingLineId.value && lineId !== replacingLineId.value) return;
    read.invalidate();
    focusedLineId.value = lineId;
    ensurePage(lineId);
    await load();
  };
  const close = (): void => {
    visible.value = false;
    session += 1;
    read.invalidate();
    choices.value.clear();
    pages.value.clear();
  };
  const open = (location: SupplementLocation = {}, replacing?: SupplementBasisChoice): boolean => {
    if (
      visible.value ||
      !read.isActive() ||
      context.disabled() ||
      !context.orderId() ||
      !context.reason()
    )
      return false;
    session += 1;
    sourceOrderId.value = context.orderId();
    sourceReason.value = context.reason();
    replacingLineId.value = replacing?.line.id ?? '';
    lineSearch.value = '';
    pages.value.clear();
    choices.value.clear();
    if (replacing) choices.value.set(replacing.line.id, copySupplementBasis(replacing));
    const lineId =
      replacing?.line.id ??
      location.lineId ??
      context.lines().find((line) => !isAlreadyAdded(line.id))?.id ??
      '';
    focusedLineId.value = lineId;
    if (lineId) {
      const state = ensurePage(lineId);
      state.receiptLineId = location.receiptLineId;
    }
    visible.value = true;
    void load();
    return true;
  };
  const canSelectCurrent = (): boolean => {
    if (
      !visible.value ||
      !read.isActive() ||
      context.disabled() ||
      loading.value ||
      currentPage.value?.error ||
      !currentLine.value ||
      isAlreadyAdded(currentLine.value.id)
    )
      return false;
    if (
      !choices.value.has(currentLine.value.id) &&
      !replacingLineId.value &&
      choices.value.size + addedIds.value.size >= PURCHASE_ORDER_MAX_LINES
    ) {
      EMessage.warning(`一张补单最多 ${PURCHASE_ORDER_MAX_LINES} 行，请另单办理`);
      return false;
    }
    return true;
  };
  const selectExcess = (candidate: PurchaseExcessReceiptCandidate): void => {
    if (!canSelectCurrent() || !currentLine.value) return;
    choices.value.set(currentLine.value.id, {
      line: currentLine.value,
      selectedExcess: { ...candidate },
      selectedQuality: null,
    });
  };
  const selectQuality = (candidate: PurchaseQualityReplacementCandidate): void => {
    if (!canSelectCurrent() || !currentLine.value) return;
    choices.value.set(
      currentLine.value.id,
      copySupplementBasis({
        line: currentLine.value,
        selectedExcess: null,
        selectedQuality: candidate,
      }),
    );
  };
  const removeChoice = (lineId: string): void => {
    if (!context.disabled()) choices.value.delete(lineId);
  };
  const search = async (): Promise<void> => {
    if (context.disabled() || !currentPage.value) return;
    currentPage.value.page = 1;
    currentPage.value.receiptLineId = undefined;
    await load();
  };
  const clearLocation = async (): Promise<void> => {
    if (currentPage.value) currentPage.value.keyword = '';
    await search();
  };
  const changePage = async (page: number): Promise<void> => {
    if (context.disabled() || !currentPage.value) return;
    currentPage.value.page = page;
    await load();
  };
  const changePageSize = async (pageSize: number): Promise<void> => {
    if (context.disabled() || !currentPage.value) return;
    currentPage.value.pageSize = pageSize;
    currentPage.value.page = 1;
    await load();
  };
  const confirm = (): SupplementBasisConfirmation | null => {
    if (!canConfirm.value || !read.isActive() || !sourceReason.value) return null;
    return {
      orderId: sourceOrderId.value,
      reason: sourceReason.value,
      replacingLineId: replacingLineId.value || undefined,
      choices: [...choices.value.values()].map(copySupplementBasis),
    };
  };
  watch(
    [context.orderId, context.reason],
    () => {
      if (
        visible.value &&
        (context.orderId() !== sourceOrderId.value || context.reason() !== sourceReason.value)
      )
        close();
    },
    { flush: 'sync' },
  );
  watch(context.disabled, (disabled) => {
    if (!visible.value) return;
    if (disabled) read.invalidate();
    else void load();
  });
  return {
    visible,
    replacingLineId,
    focusedLineId,
    lineSearch,
    loading,
    choices,
    directory,
    currentLine,
    currentPage,
    currentChoice,
    canConfirm,
    isAlreadyAdded,
    open,
    close,
    focusLine,
    load,
    selectExcess,
    selectQuality,
    removeChoice,
    search,
    clearLocation,
    changePage,
    changePageSize,
    confirm,
  };
}
