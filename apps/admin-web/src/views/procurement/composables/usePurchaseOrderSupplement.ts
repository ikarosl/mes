import { computed, ref } from 'vue';
import type {
  CreatePurchaseOrderSupplementPayload,
  PurchaseOrderDetail,
  PurchaseOrderSupplementReason,
} from '@company/contracts';
import {
  PURCHASE_ORDER_MAX_LINES,
  PURCHASE_ORDER_MAX_QUANTITY,
  PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH,
} from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import {
  copySupplementBasis,
  supplementBasisSignature,
  type SupplementBasisChoice,
  type SupplementBasisConfirmation,
} from '../supplement-basis';
import { useProcurementCommand } from './useProcurementCommand';

export interface SupplementDraftLine extends SupplementBasisChoice {
  quantity: number | undefined;
  taxExclusiveAmount: string;
  taxInclusiveAmount: string;
  evidence: string;
  basisError: boolean;
}

export interface SupplementLocation {
  lineId?: string;
  reason?: PurchaseOrderSupplementReason;
  receiptLineId?: string;
}

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
    pendingLocation = ref<SupplementLocation | null>(null),
    requestedReason = ref<PurchaseOrderSupplementReason>(),
    submittingCheck = ref(false);
  const read = useLatestReadRequest(() => {
    orderLoading.value = false;
  });
  const basisRead = useLatestReadRequest(() => {
    // save 的 finally 统一结束本轮核对，取消读取不清空用户输入。
  });
  let epoch = 0;
  const command = useProcurementCommand((result) => {
    visible.value = false;
    epoch += 1;
    read.invalidate();
    basisRead.invalidate();
    onSaved(result.purchaseOrderId);
  });
  const eligibleLines = computed(() =>
    order.value?.orderedAt
      ? order.value.items.filter(
          (line) => line.fulfillmentMode === 'new_arrival' && line.status !== 'cancelled',
        )
      : [],
  );
  const dirty = computed(
    () => Boolean(reason.value || remark.value.trim()) || drafts.value.length > 0,
  );
  const editingLocked = computed(() => command.locked.value || submittingCheck.value);
  const canSave = computed(
    () =>
      Boolean(order.value && reason.value && order.value.supplementReason !== 'excess_purchase') &&
      !editingLocked.value &&
      read.isActive() &&
      !orderLoading.value &&
      !orderError.value &&
      !contextError.value &&
      drafts.value.length > 0 &&
      drafts.value.length <= PURCHASE_ORDER_MAX_LINES &&
      drafts.value.every(
        (draft) =>
          !draft.basisError &&
          Boolean(
            reason.value === 'excess_purchase' ? draft.selectedExcess : draft.selectedQuality,
          ) &&
          Number.isInteger(draft.quantity) &&
          Number(draft.quantity) > 0 &&
          Number(draft.quantity) <= PURCHASE_ORDER_MAX_QUANTITY &&
          draft.taxExclusiveAmount.trim().length <= PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH &&
          draft.taxInclusiveAmount.trim().length <= PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH &&
          Boolean(draft.evidence.trim()),
      ),
  );
  const findDraft = (lineId: string): SupplementDraftLine | undefined =>
    drafts.value.find((draft) => draft.line.id === lineId);
  const updateContextError = (): void => {
    contextError.value = drafts.value.some(
      (draft) => !eligibleLines.value.some((line) => line.id === draft.line.id),
    );
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
      for (const draft of drafts.value) {
        const line = eligibleLines.value.find((item) => item.id === draft.line.id);
        if (line) draft.line = line;
      }
      updateContextError();
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
  const adoptChoices = (confirmation: SupplementBasisConfirmation): boolean => {
    if (
      !visible.value ||
      editingLocked.value ||
      orderLoading.value ||
      orderError.value ||
      order.value?.id !== confirmation.orderId ||
      order.value.supplementReason === 'excess_purchase' ||
      reason.value !== confirmation.reason
    )
      return false;
    const { choices, replacingLineId } = confirmation;
    const ids = choices.map((choice) => choice.line.id);
    if (
      !choices.length ||
      new Set(ids).size !== ids.length ||
      choices.some(
        (choice) =>
          !eligibleLines.value.some((line) => line.id === choice.line.id) ||
          !(reason.value === 'excess_purchase' ? choice.selectedExcess : choice.selectedQuality),
      )
    ) {
      EMessage.warning('所选采购行或依据已变化，请重新核对');
      return false;
    }
    if (replacingLineId) {
      const draft = findDraft(replacingLineId);
      const choice = choices[0];
      if (!draft || choices.length !== 1 || choice?.line.id !== replacingLineId) return false;
      const changed =
        draft.selectedExcess?.id !== choice.selectedExcess?.id ||
        draft.selectedQuality?.receiptLineId !== choice.selectedQuality?.receiptLineId;
      Object.assign(draft, copySupplementBasis(choice), { basisError: false });
      if (changed) EMessage.warning('依据已更换，数量与说明已保留，请重新核对');
      return true;
    }
    if (ids.some((id) => findDraft(id))) {
      EMessage.warning('部分采购行已经添加，请移除重复选择');
      return false;
    }
    if (drafts.value.length + choices.length > PURCHASE_ORDER_MAX_LINES) {
      EMessage.warning(`一张补单最多 ${PURCHASE_ORDER_MAX_LINES} 行，请另单办理`);
      return false;
    }
    drafts.value.push(
      ...choices.map((choice) => ({
        ...copySupplementBasis(choice),
        quantity: undefined,
        taxExclusiveAmount: '',
        taxInclusiveAmount: '',
        evidence: '',
        basisError: false,
      })),
    );
    updateContextError();
    return true;
  };
  const removeLine = (lineId: string): void => {
    if (editingLocked.value) return;
    drafts.value = drafts.value.filter((draft) => draft.line.id !== lineId);
    updateContextError();
  };
  const chooseReason = async (next: PurchaseOrderSupplementReason): Promise<boolean> => {
    if (reason.value === next) return true;
    if (editingLocked.value || order.value?.supplementReason === 'excess_purchase') return false;
    const currentEpoch = epoch;
    if (drafts.value.length || remark.value.trim()) {
      try {
        await RouteMessageBox.confirm(
          '切换补单类型将清空已选明细和填写内容，确认切换吗？',
          '切换补单类型',
          { type: 'warning' },
        );
      } catch {
        return false;
      }
    }
    if (!visible.value || editingLocked.value || epoch !== currentEpoch) return false;
    epoch += 1;
    basisRead.invalidate();
    drafts.value = [];
    remark.value = '';
    reason.value = next;
    contextError.value = false;
    return true;
  };
  const open = async (id: string, location: SupplementLocation = {}): Promise<boolean> => {
    if (visible.value || editingLocked.value) return false;
    const currentEpoch = ++epoch;
    targetId.value = id;
    order.value = null;
    requestedReason.value = location.reason;
    pendingLocation.value = location.lineId ? { ...location } : null;
    reason.value = location.reason ?? '';
    drafts.value = [];
    remark.value = '';
    orderError.value = false;
    contextError.value = false;
    visible.value = true;
    if (!(await refreshOrder()) || epoch !== currentEpoch) return true;
    const refreshedOrder = order.value as PurchaseOrderDetail | null;
    if (!refreshedOrder) return true;
    if (refreshedOrder.supplementReason === 'excess_purchase') {
      reason.value = '';
      pendingLocation.value = null;
    } else if (
      location.lineId &&
      !eligibleLines.value.some((line) => line.id === location.lineId)
    ) {
      pendingLocation.value = null;
      EMessage.warning('指定采购行不属于该原单或已不可办理补单');
    }
    return true;
  };
  const close = async (): Promise<boolean> => {
    if (!visible.value) return true;
    if (submittingCheck.value || !(await command.canClose(dirty.value))) return false;
    visible.value = false;
    epoch += 1;
    read.invalidate();
    basisRead.invalidate();
    return true;
  };
  const refreshBasis = async (
    draft: SupplementDraftLine,
    current: ReturnType<typeof basisRead.begin>,
  ): Promise<boolean> => {
    const stillCurrent = (): boolean => current.isCurrent() && findDraft(draft.line.id) === draft;
    try {
      if (reason.value === 'excess_purchase' && draft.selectedExcess) {
        const old = draft.selectedExcess;
        const result = await procurementApi.excessReceiptCandidates(
          draft.line.id,
          { page: 1, pageSize: 1, receiptLineId: old.id },
          current.signal,
        );
        if (!stillCurrent()) return false;
        const latest = result.items.find((item) => item.id === old.id);
        if (!latest) {
          draft.basisError = true;
          return false;
        }
        draft.selectedExcess = latest;
        draft.basisError = false;
        return supplementBasisSignature(old) === supplementBasisSignature(latest);
      }
      if (reason.value === 'quality_replacement' && draft.selectedQuality) {
        const old = draft.selectedQuality;
        const result = await procurementApi.qualityReplacementCandidates(
          draft.line.id,
          {
            page: 1,
            pageSize: 1,
            receiptLineId: old.receiptLineId,
          },
          current.signal,
        );
        if (!stillCurrent()) return false;
        const latest = result.items.find((item) => item.receiptLineId === old.receiptLineId);
        if (!latest) {
          draft.basisError = true;
          return false;
        }
        draft.selectedQuality = latest;
        draft.basisError = false;
        return supplementBasisSignature(old) === supplementBasisSignature(latest);
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
    if (!canSave.value || !order.value || !reason.value || !basisRead.isActive()) return;
    const currentEpoch = epoch;
    submittingCheck.value = true;
    try {
      const before = order.value;
      if (!(await refreshOrder()) || !order.value) return;
      if (epoch !== currentEpoch || !visible.value || !basisRead.isActive()) return;
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
      const id = order.value.id;
      const targetReason = reason.value;
      const current = basisRead.begin(
        () =>
          visible.value &&
          epoch === currentEpoch &&
          order.value?.id === id &&
          reason.value === targetReason,
      );
      const results = await Promise.all(drafts.value.map((draft) => refreshBasis(draft, current)));
      if (!current.isCurrent()) return;
      if (results.some((valid) => !valid)) {
        EMessage.warning('到货依据已变化，输入已保留。请核对最新依据后再次提交');
        return;
      }
      const body: CreatePurchaseOrderSupplementPayload = {
        supplementReason: targetReason,
        items: drafts.value.map((draft) => ({
          originOrderLineId: draft.line.id,
          originReceiptLineId:
            targetReason === 'excess_purchase'
              ? draft.selectedExcess!.id
              : draft.selectedQuality!.receiptLineId,
          plannedQuantity: Number(draft.quantity),
          taxExclusiveAmount: draft.taxExclusiveAmount.trim() || null,
          taxInclusiveAmount: draft.taxInclusiveAmount.trim() || null,
          supplementEvidence: draft.evidence.trim(),
        })),
        remark: remark.value.trim() || null,
      };
      await command.run(
        { intentType: 'procurement.order.supplement', params: { id }, query: {}, body },
        (key) => procurementApi.createSupplement(id, body, key),
        targetReason === 'excess_purchase'
          ? '超量补单草稿已创建，请核对后正式下单'
          : '质量补发草稿已创建，请核对后正式下单',
      );
    } finally {
      submittingCheck.value = false;
    }
  };
  return {
    visible,
    order,
    reason,
    drafts,
    remark,
    orderLoading,
    orderError,
    contextError,
    pendingLocation,
    requestedReason,
    eligibleLines,
    command,
    canSave,
    dirty,
    editingLocked,
    submittingCheck,
    open,
    close,
    chooseReason,
    adoptChoices,
    removeLine,
    refreshOrder,
    save,
  };
}
