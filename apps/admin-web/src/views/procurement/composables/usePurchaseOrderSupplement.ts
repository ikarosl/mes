import { computed, onActivated, ref } from 'vue';
import type {
  CreatePurchaseOrderSupplementPayload,
  PurchaseExcessReceiptCandidate,
  PurchaseOrderDetail,
  PurchaseOrderLine,
  PurchaseOrderSupplementReason,
  PurchaseQualityReplacementCandidate,
} from '@company/contracts';
import { PURCHASE_ORDER_MAX_LINES, PURCHASE_ORDER_MAX_QUANTITY } from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { useProcurementCommand } from './useProcurementCommand';

export interface SupplementDraftLine {
  line: PurchaseOrderLine;
  quantity: number | undefined;
  evidence: string;
  selectedExcess: PurchaseExcessReceiptCandidate | null;
  selectedQuality: PurchaseQualityReplacementCandidate | null;
  excessRows: PurchaseExcessReceiptCandidate[];
  qualityRows: PurchaseQualityReplacementCandidate[];
  page: number;
  pageSize: number;
  total: number;
  keyword: string;
  loading: boolean;
  error: boolean;
  basisError: boolean;
  request: number;
  controller: AbortController | null;
}

export interface SupplementLocation {
  lineId?: string;
  reason?: PurchaseOrderSupplementReason;
  receiptLineId?: string;
  allocationId?: string;
}

const newDraft = (line: PurchaseOrderLine): SupplementDraftLine => ({
  line,
  quantity: undefined,
  evidence: '',
  selectedExcess: null,
  selectedQuality: null,
  excessRows: [],
  qualityRows: [],
  page: 1,
  pageSize: 10,
  total: 0,
  keyword: '',
  loading: false,
  error: false,
  basisError: false,
  request: 0,
  controller: null,
});

export function usePurchaseOrderSupplement(onSaved: (id: string) => void) {
  const visible = ref(false),
    targetId = ref(''),
    order = ref<PurchaseOrderDetail | null>(null),
    reason = ref<PurchaseOrderSupplementReason | ''>(''),
    drafts = ref<SupplementDraftLine[]>([]),
    remark = ref(''),
    orderLoading = ref(false),
    orderError = ref(false),
    contextError = ref(false),
    lineSearch = ref(''),
    linePage = ref(1),
    linePageSize = ref(10),
    pendingLineId = ref(''),
    requestedReason = ref<PurchaseOrderSupplementReason>(),
    submittingCheck = ref(false);
  const read = useLatestReadRequest(() => {
    orderLoading.value = false;
  });
  let epoch = 0;
  const command = useProcurementCommand((result) => {
    visible.value = false;
    invalidateCandidates();
    read.invalidate();
    onSaved(result.purchaseOrderId);
  });
  const eligibleLines = computed(() =>
    order.value?.orderedAt
      ? order.value.items.filter(
          (line) => line.fulfillmentMode === 'new_arrival' && line.status !== 'cancelled',
        )
      : [],
  );
  const filteredLines = computed(() => {
    const keyword = lineSearch.value.trim().toLocaleLowerCase();
    return keyword
      ? eligibleLines.value.filter((line) =>
          [line.lineNo, line.itemCode, line.itemName, line.materialVariantCode, line.supplierName]
            .join(' ')
            .toLocaleLowerCase()
            .includes(keyword),
        )
      : eligibleLines.value;
  });
  const pagedLines = computed(() =>
    filteredLines.value.slice(
      (linePage.value - 1) * linePageSize.value,
      linePage.value * linePageSize.value,
    ),
  );
  const dirty = computed(
    () =>
      Boolean(reason.value || remark.value.trim()) ||
      drafts.value.some((draft) => draft.quantity !== undefined || Boolean(draft.evidence.trim())),
  );
  const editingLocked = computed(() => command.locked.value || submittingCheck.value);
  const canSave = computed(
    () =>
      Boolean(order.value && reason.value && order.value.supplementReason !== 'excess_purchase') &&
      !editingLocked.value &&
      !submittingCheck.value &&
      !orderLoading.value &&
      !orderError.value &&
      !contextError.value &&
      drafts.value.length > 0 &&
      drafts.value.length <= PURCHASE_ORDER_MAX_LINES &&
      drafts.value.every(
        (draft) =>
          !draft.loading &&
          !draft.error &&
          !draft.basisError &&
          Boolean(
            reason.value === 'excess_purchase' ? draft.selectedExcess : draft.selectedQuality,
          ) &&
          Number.isInteger(draft.quantity) &&
          Number(draft.quantity) > 0 &&
          Number(draft.quantity) <= PURCHASE_ORDER_MAX_QUANTITY &&
          Boolean(draft.evidence.trim()),
      ),
  );

  const invalidateCandidates = (): void => {
    for (const draft of drafts.value) {
      draft.request += 1;
      draft.controller?.abort();
      draft.controller = null;
      draft.loading = false;
    }
  };
  const findDraft = (lineId: string): SupplementDraftLine | undefined =>
    drafts.value.find((draft) => draft.line.id === lineId);
  const loadCandidates = async (draft: SupplementDraftLine): Promise<boolean> => {
    if (!visible.value || !reason.value || editingLocked.value) return false;
    draft.controller?.abort();
    const controller = new AbortController();
    draft.controller = controller;
    const request = ++draft.request;
    const targetOrder = order.value?.id;
    const targetReason = reason.value;
    const currentEpoch = epoch;
    draft.loading = true;
    try {
      if (targetReason === 'excess_purchase') {
        const result = await procurementApi.excessReceiptCandidates(
          draft.line.id,
          {
            page: draft.page,
            pageSize: draft.pageSize,
            keyword: draft.keyword.trim() || undefined,
          },
          controller.signal,
        );
        if (
          !visible.value ||
          epoch !== currentEpoch ||
          order.value?.id !== targetOrder ||
          reason.value !== targetReason ||
          draft.request !== request
        )
          return false;
        draft.excessRows = result.items;
        draft.total = result.total;
      } else {
        const result = await procurementApi.qualityReplacementCandidates(
          draft.line.id,
          {
            page: draft.page,
            pageSize: draft.pageSize,
            keyword: draft.keyword.trim() || undefined,
          },
          controller.signal,
        );
        if (
          !visible.value ||
          epoch !== currentEpoch ||
          order.value?.id !== targetOrder ||
          reason.value !== targetReason ||
          draft.request !== request
        )
          return false;
        draft.qualityRows = result.items;
        draft.total = result.total;
      }
      draft.error = false;
      return true;
    } catch (error) {
      if (
        visible.value &&
        epoch === currentEpoch &&
        draft.request === request &&
        !controller.signal.aborted
      ) {
        draft.error = true;
        EMessage.error(error, '补单来源依据读取失败');
      }
      return false;
    } finally {
      if (draft.request === request) {
        draft.loading = false;
        draft.controller = null;
      }
    }
  };
  const refreshOrder = async (): Promise<boolean> => {
    if (!visible.value || !targetId.value || !read.isActive() || command.locked.value) return false;
    const id = targetId.value;
    const current = read.begin(() => visible.value && targetId.value === id);
    orderLoading.value = true;
    try {
      const latest = await procurementApi.getOrder(id, current.signal);
      if (!current.isCurrent()) return false;
      order.value = latest;
      orderError.value = false;
      contextError.value = drafts.value.some((draft) => {
        const line = latest.items.find((item) => item.id === draft.line.id);
        if (!line || line.fulfillmentMode !== 'new_arrival' || line.status === 'cancelled')
          return true;
        draft.line = line;
        return false;
      });
      if (contextError.value) EMessage.warning('原采购行已变化，请移除失效行后重新选择');
      return !contextError.value;
    } catch (error) {
      if (current.isCurrent()) {
        orderError.value = true;
        EMessage.error(error, '原采购单读取失败');
      }
      return false;
    } finally {
      if (current.isCurrent()) orderLoading.value = false;
    }
  };
  const addLine = async (line: PurchaseOrderLine): Promise<void> => {
    if (
      !reason.value ||
      order.value?.supplementReason === 'excess_purchase' ||
      findDraft(line.id) ||
      drafts.value.length >= PURCHASE_ORDER_MAX_LINES ||
      editingLocked.value
    )
      return;
    drafts.value.push(newDraft(line));
    const selected = findDraft(line.id);
    if (selected) await loadCandidates(selected);
  };
  const removeLine = (lineId: string): void => {
    if (editingLocked.value) return;
    const draft = findDraft(lineId);
    if (!draft) return;
    draft.request += 1;
    draft.controller?.abort();
    drafts.value = drafts.value.filter((item) => item.line.id !== lineId);
    contextError.value = drafts.value.some(
      (item) =>
        !order.value?.items.some(
          (line) =>
            line.id === item.line.id &&
            line.fulfillmentMode === 'new_arrival' &&
            line.status !== 'cancelled',
        ),
    );
  };
  const chooseReason = async (next: PurchaseOrderSupplementReason): Promise<void> => {
    if (
      reason.value === next ||
      editingLocked.value ||
      order.value?.supplementReason === 'excess_purchase'
    )
      return;
    if (drafts.value.length || remark.value.trim()) {
      try {
        await RouteMessageBox.confirm(
          '切换补单类型将清空已选择的原行和填写内容，确认切换吗？',
          '切换补单类型',
          {
            type: 'warning',
          },
        );
      } catch {
        return;
      }
    }
    if (!visible.value || editingLocked.value) return;
    epoch += 1;
    invalidateCandidates();
    drafts.value = [];
    remark.value = '';
    reason.value = next;
    contextError.value = false;
    if (pendingLineId.value) {
      const line = eligibleLines.value.find((item) => item.id === pendingLineId.value);
      pendingLineId.value = '';
      if (line) await addLine(line);
    }
  };
  const open = async (id: string, location: SupplementLocation = {}): Promise<boolean> => {
    if (visible.value || editingLocked.value) return false;
    const currentEpoch = ++epoch;
    targetId.value = id;
    order.value = null;
    requestedReason.value = location.reason;
    pendingLineId.value = location.lineId ?? '';
    reason.value = location.reason ?? '';
    drafts.value = [];
    remark.value = '';
    lineSearch.value = '';
    linePage.value = 1;
    orderError.value = false;
    contextError.value = false;
    visible.value = true;
    if (!(await refreshOrder()) || epoch !== currentEpoch) return true;
    const refreshedOrder = order.value as PurchaseOrderDetail | null;
    if (!refreshedOrder) return true;
    if (refreshedOrder.supplementReason === 'excess_purchase') {
      reason.value = '';
      pendingLineId.value = '';
      return true;
    }
    if (!location.lineId) return true;
    const line = eligibleLines.value.find((item) => item.id === location.lineId);
    if (!line) {
      pendingLineId.value = '';
      EMessage.warning('指定采购行不属于该原单或已不可办理补单');
      return true;
    }
    if (reason.value) {
      await addLine(line);
      pendingLineId.value = '';
      const draft = findDraft(line.id);
      if (!draft) return true;
      if (location.receiptLineId || location.allocationId) {
        try {
          if (reason.value === 'quality_replacement') {
            const result = await procurementApi.qualityReplacementCandidates(line.id, {
              page: 1,
              pageSize: 1,
              receiptLineId: location.receiptLineId,
              allocationId: location.allocationId,
            });
            if (epoch !== currentEpoch || !visible.value || findDraft(line.id) !== draft)
              return true;
            const candidate = result.items.find(
              (item) =>
                item.allocationId === location.allocationId &&
                item.receiptLineId === location.receiptLineId,
            );
            if (candidate) draft.selectedQuality = candidate;
            else EMessage.warning('指定质量分配依据已不可用，请在原采购行重新选择');
          } else if (location.receiptLineId) {
            const result = await procurementApi.excessReceiptCandidates(line.id, {
              page: 1,
              pageSize: 1,
              receiptLineId: location.receiptLineId,
            });
            if (epoch !== currentEpoch || !visible.value || findDraft(line.id) !== draft)
              return true;
            const candidate = result.items.find((item) => item.id === location.receiptLineId);
            if (candidate) draft.selectedExcess = candidate;
            else EMessage.warning('指定到货依据已不可用，请在原采购行重新选择');
          }
        } catch (error) {
          if (epoch === currentEpoch && visible.value)
            EMessage.error(error, '定位补单依据失败，请手动核对来源');
        }
      }
    }
    return true;
  };
  const close = async (): Promise<boolean> => {
    if (!visible.value) return true;
    if (submittingCheck.value) return false;
    if (!(await command.canClose(dirty.value))) return false;
    visible.value = false;
    epoch += 1;
    read.invalidate();
    invalidateCandidates();
    return true;
  };
  const selectExcess = (
    draft: SupplementDraftLine,
    candidate: PurchaseExcessReceiptCandidate,
  ): void => {
    if (editingLocked.value) return;
    draft.selectedExcess = candidate;
    draft.basisError = false;
  };
  const selectQuality = (
    draft: SupplementDraftLine,
    candidate: PurchaseQualityReplacementCandidate,
  ): void => {
    if (editingLocked.value) return;
    draft.selectedQuality = candidate;
    draft.basisError = false;
  };
  const refreshBasis = async (draft: SupplementDraftLine): Promise<boolean> => {
    const currentEpoch = epoch;
    const targetOrder = order.value?.id;
    const targetReason = reason.value;
    const stillCurrent = (): boolean =>
      visible.value &&
      epoch === currentEpoch &&
      order.value?.id === targetOrder &&
      reason.value === targetReason &&
      findDraft(draft.line.id) === draft;
    try {
      if (reason.value === 'excess_purchase' && draft.selectedExcess) {
        const old = draft.selectedExcess;
        const result = await procurementApi.excessReceiptCandidates(draft.line.id, {
          page: 1,
          pageSize: 1,
          receiptLineId: old.id,
        });
        if (!stillCurrent()) return false;
        const latest = result.items.find((item) => item.id === old.id);
        if (!latest) {
          draft.basisError = true;
          return false;
        }
        draft.selectedExcess = latest;
        return JSON.stringify(old) === JSON.stringify(latest);
      }
      if (reason.value === 'quality_replacement' && draft.selectedQuality) {
        const old = draft.selectedQuality;
        const result = await procurementApi.qualityReplacementCandidates(draft.line.id, {
          page: 1,
          pageSize: 1,
          receiptLineId: old.receiptLineId,
          allocationId: old.allocationId,
        });
        if (!stillCurrent()) return false;
        const latest = result.items.find(
          (item) =>
            item.receiptLineId === old.receiptLineId && item.allocationId === old.allocationId,
        );
        if (!latest) {
          draft.basisError = true;
          return false;
        }
        draft.selectedQuality = latest;
        return JSON.stringify(old) === JSON.stringify(latest);
      }
      return false;
    } catch (error) {
      if (stillCurrent()) {
        draft.basisError = true;
        EMessage.error(error, '补单依据重新核对失败');
      }
      return false;
    }
  };
  const save = async (): Promise<void> => {
    if (!canSave.value || !order.value || !reason.value) return;
    const currentEpoch = epoch;
    submittingCheck.value = true;
    try {
      const before = order.value;
      if (!(await refreshOrder()) || !order.value) return;
      if (epoch !== currentEpoch || !visible.value) return;
      if (
        before.version !== order.value.version ||
        drafts.value.some((draft) => {
          const previous = before.items.find((item) => item.id === draft.line.id);
          return previous?.version !== draft.line.version;
        })
      ) {
        EMessage.warning('原采购单或采购行已变化，输入已保留。请核对最新资料后再次提交');
        return;
      }
      const results = await Promise.all(drafts.value.map(refreshBasis));
      if (epoch !== currentEpoch || !visible.value) return;
      if (results.some((current) => !current)) {
        EMessage.warning('到货或质量分配依据已变化，输入已保留。请核对最新依据后再次提交');
        return;
      }
      if (
        drafts.value.some(
          (draft) =>
            draft.basisError ||
            (!draft.selectedExcess && reason.value === 'excess_purchase') ||
            (!draft.selectedQuality && reason.value === 'quality_replacement'),
        )
      )
        return;
      const id = order.value.id;
      const body: CreatePurchaseOrderSupplementPayload = {
        supplementReason: reason.value,
        items: drafts.value.map((draft) => ({
          originOrderLineId: draft.line.id,
          originReceiptLineId:
            reason.value === 'excess_purchase'
              ? draft.selectedExcess!.id
              : draft.selectedQuality!.receiptLineId,
          ...(reason.value === 'quality_replacement'
            ? { originAllocationId: draft.selectedQuality!.allocationId }
            : {}),
          plannedQuantity: Number(draft.quantity),
          supplementEvidence: draft.evidence.trim(),
        })),
        remark: remark.value.trim() || null,
      };
      await command.run(
        { intentType: 'procurement.order.supplement', params: { id }, query: {}, body },
        (key) => procurementApi.createSupplement(id, body, key),
        reason.value === 'excess_purchase'
          ? '超量补单草稿已创建，请正式下单后由库管关联原到货定稿'
          : '质量补发草稿已创建，请核对后正式下单',
      );
    } finally {
      submittingCheck.value = false;
    }
  };
  onActivated(() => {
    if (visible.value && !editingLocked.value) {
      void refreshOrder();
      for (const draft of drafts.value) void loadCandidates(draft);
    }
  });
  return {
    visible,
    order,
    reason,
    drafts,
    remark,
    orderLoading,
    orderError,
    contextError,
    lineSearch,
    linePage,
    linePageSize,
    pendingLineId,
    requestedReason,
    eligibleLines,
    filteredLines,
    pagedLines,
    command,
    canSave,
    dirty,
    editingLocked,
    submittingCheck,
    open,
    close,
    chooseReason,
    addLine,
    removeLine,
    findDraft,
    loadCandidates,
    refreshOrder,
    selectExcess,
    selectQuality,
    save,
  };
}
