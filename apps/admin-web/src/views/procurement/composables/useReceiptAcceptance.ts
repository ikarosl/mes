import { computed, onActivated, ref } from 'vue';
import type {
  ConfirmReceiptAcceptancePayload,
  ProcurementReceiptCommandResult,
  ProcurementReceiptLine,
  QualityInboundCaseItem,
  ReceiptAllocationInput,
} from '@company/contracts';
import { RequestError } from '@company/request';
import { PURCHASE_ORDER_MAX_QUANTITY } from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import { useProcurementCommand } from './useProcurementCommand';
import { useReceiptAllocationOptions } from './useReceiptAllocationOptions';

export function useReceiptAcceptance(
  onSaved: (result: ProcurementReceiptCommandResult) => void | Promise<void>,
) {
  const visible = ref(false),
    loading = ref(false),
    stale = ref(false),
    remark = ref(''),
    overrideReason = ref(''),
    quantity = ref<number | undefined>(),
    physicalIdentityConfirmed = ref(false);
  const line = ref<ProcurementReceiptLine | null>(null),
    review = ref<QualityInboundCaseItem | null>(null);
  const details = ref<ReceiptAllocationInput[]>([]);
  const retainedOwners = computed(() =>
    (line.value?.ownershipSources ?? []).filter((row) => Number(row.quantity) > 0),
  );
  const allocationOptions = useReceiptAllocationOptions(
    () => (visible.value ? line.value?.id : undefined),
    () =>
      details.value.flatMap((row) => (row.purchaseOrderLineId ? [row.purchaseOrderLineId] : [])),
    // 下拉输入存在防抖；复核或写入期间，迟到的搜索不得取消提交前读取。
    () => visible.value && !loading.value && !stale.value && !command.locked.value,
  );
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  const command = useProcurementCommand<ProcurementReceiptCommandResult>(async (result) => {
    visible.value = false;
    read.invalidate();
    allocationOptions.invalidate();
    await onSaved(result);
  }, '来料正式清单');
  const inspection = computed(() => review.value?.inspection ?? null);
  const inspectionExecution = computed(() => ({
    inboundQuantity: Number(line.value?.currentInspectionExecution.inboundQuantity ?? 0),
    qualityReturnedQuantity: Number(
      line.value?.currentInspectionExecution.qualityReturnedQuantity ?? 0,
    ),
    otherReturnedQuantity: Number(
      line.value?.currentInspectionExecution.otherReturnedQuantity ?? 0,
    ),
  }));
  const totalInspectionExecuted = computed(
    () =>
      inspectionExecution.value.inboundQuantity +
      inspectionExecution.value.qualityReturnedQuantity +
      inspectionExecution.value.otherReturnedQuantity,
  );
  const fullLimitBeforeFloor = computed(() => {
    const record = inspection.value;
    if (!record || record.inspectionMethod !== 'full') return null;
    return (
      Number(record.inspectedQuantity) -
      inspectionExecution.value.inboundQuantity -
      inspectionExecution.value.otherReturnedQuantity -
      Math.max(
        inspectionExecution.value.qualityReturnedQuantity,
        Number(record.unqualifiedQuantity),
      )
    );
  });
  const limit = computed(() => {
    const record = inspection.value;
    const count = Number(quantity.value);
    if (
      !record ||
      record.releaseDecision !== 'released' ||
      !Number.isSafeInteger(count) ||
      count < 0
    )
      return null;
    if (record.inspectionMethod === 'full') return Math.max(0, fullLimitBeforeFloor.value ?? 0);
    return Number(record.inspectedQuantity) > count || Number(record.unqualifiedQuantity) > count
      ? null
      : count - Number(record.unqualifiedQuantity);
  });
  const total = computed(() => details.value.reduce((sum, row) => sum + Number(row.quantity), 0));
  const inboundTotal = computed(() =>
    details.value
      .filter((row) => row.disposition === 'inbound')
      .reduce((sum, row) => sum + Number(row.quantity), 0),
  );
  const correctedTotal = computed(
    () =>
      Number(line.value?.quantities.inboundQuantity ?? 0) +
      Number(line.value?.quantities.returnedQuantity ?? 0) +
      Number(quantity.value),
  );
  const quantityMismatch = computed(
    () =>
      correctedTotal.value !== Number(line.value?.quantities.receivedQuantity ?? 0) ||
      (inspection.value?.inspectionMethod === 'full' &&
        Number(inspection.value.inspectedQuantity) - totalInspectionExecuted.value !==
          Number(quantity.value)),
  );
  const overrideRequired = computed(
    () =>
      Number.isSafeInteger(quantity.value) &&
      Number(quantity.value) >= 0 &&
      (limit.value === null || inboundTotal.value > limit.value),
  );
  const snapshot = () =>
    JSON.stringify([
      details.value,
      quantity.value,
      remark.value,
      overrideReason.value,
      physicalIdentityConfirmed.value,
    ]);
  let baseline = '';
  const canConfirm = computed(
    () =>
      !loading.value &&
      allocationOptions.selectionReady.value &&
      !stale.value &&
      !command.locked.value &&
      inspection.value?.releaseDecision === 'released' &&
      Number.isSafeInteger(quantity.value) &&
      Number(quantity.value) >= 0 &&
      correctedTotal.value <= PURCHASE_ORDER_MAX_QUANTITY &&
      total.value === quantity.value &&
      details.value.length <= 100 &&
      physicalIdentityConfirmed.value &&
      !!remark.value.trim() &&
      (!overrideRequired.value || !!overrideReason.value.trim()) &&
      details.value.every(
        (row) =>
          Number.isSafeInteger(row.quantity) &&
          row.quantity > 0 &&
          row.quantity <= PURCHASE_ORDER_MAX_QUANTITY &&
          (row.disposition !== 'inbound' || !!row.purchaseOrderLineId) &&
          (row.disposition !== 'return' || !!row.returnReason),
      ),
  );
  const check = async () => {
    const target = line.value;
    if (!target || !visible.value || !read.isActive()) return false;
    const request = read.begin(() => visible.value && line.value?.id === target.id);
    loading.value = true;
    try {
      const [latest, options] = await Promise.all([
        procurementApi.getReceiptLine(target.id, request.signal),
        allocationOptions.load(),
      ]);
      if (!request.isCurrent()) return false;
      stale.value =
        latest.version !== target.version ||
        latest.currentReceiptRevisionId !== target.currentReceiptRevisionId ||
        latest.currentRound.id !== target.currentRound.id ||
        latest.currentRound.version !== target.currentRound.version ||
        latest.currentRound.inspectionId !== inspection.value?.id ||
        latest.currentInspectionExecution.inboundQuantity !==
          target.currentInspectionExecution.inboundQuantity ||
        latest.currentInspectionExecution.qualityReturnedQuantity !==
          target.currentInspectionExecution.qualityReturnedQuantity ||
        latest.currentInspectionExecution.otherReturnedQuantity !==
          target.currentInspectionExecution.otherReturnedQuantity ||
        !latest.cases.some(
          (row) =>
            row.id === review.value?.id &&
            row.status === 'completed' &&
            row.inspection?.id === inspection.value?.id,
        );
      return !stale.value && !!options && allocationOptions.selectionReady.value;
    } catch (error) {
      if (request.isCurrent()) {
        stale.value = true;
        EMessage.error(error, '清单依据核对失败，输入已保留');
      }
      return false;
    } finally {
      if (request.isCurrent()) loading.value = false;
    }
  };
  const refreshCandidates = async () => {
    if (command.locked.value || stale.value || loading.value) return;
    await allocationOptions.search('');
  };
  const initializeDraft = (
    target: ProcurementReceiptLine,
    record: NonNullable<QualityInboundCaseItem['inspection']>,
  ): ReceiptAllocationInput[] => {
    if (target.currentRound.status === 'finalized')
      return target.allocations
        .filter(
          (row) =>
            row.isCurrent &&
            Number(row.remainingQuantity) > 0 &&
            row.returnReason !== 'manual_rejection',
        )
        .map((row) => ({
          purchaseOrderLineId: row.purchaseOrderLineId,
          disposition: row.disposition,
          quantity: Number(row.remainingQuantity),
          returnReason: row.returnReason,
          remark: row.remark ?? '',
        }));
    const retained = target.ownershipSources.filter(
      (row) => row.purchaseOrderLineId !== target.purchaseOrderLineId && Number(row.quantity) > 0,
    );
    const retainedQuantity = retained.reduce((sum, row) => sum + Number(row.quantity), 0);
    const draft: ReceiptAllocationInput[] = retained.map((row) => ({
      purchaseOrderLineId: row.purchaseOrderLineId,
      disposition: 'pending',
      quantity: Number(row.quantity),
      returnReason: null,
    }));
    const remaining = Math.max(0, Number(quantity.value) - retainedQuantity);
    const available = Math.min(remaining, Math.max(0, limit.value ?? 0));
    const approved = Math.min(available, Number(target.originalRemainingPlannedQuantity));
    const unreturnedBad =
      record.inspectionMethod === 'full'
        ? Math.max(
            0,
            Number(record.unqualifiedQuantity) -
              Number(target.currentInspectionExecution.qualityReturnedQuantity),
          )
        : Number(record.unqualifiedQuantity);
    const bad = Math.min(unreturnedBad, remaining - approved);
    if (approved > 0)
      draft.push({
        purchaseOrderLineId: target.purchaseOrderLineId,
        disposition: 'inbound',
        quantity: approved,
        returnReason: null,
      });
    if (bad > 0)
      draft.push({
        purchaseOrderLineId: target.purchaseOrderLineId,
        disposition: 'return',
        quantity: bad,
        returnReason: 'quality',
      });
    const pending = remaining - approved - bad;
    if (pending > 0)
      draft.push({
        purchaseOrderLineId: null,
        disposition: 'pending',
        quantity: pending,
        returnReason: null,
      });
    return draft;
  };
  const open = async (target: ProcurementReceiptLine) => {
    if (visible.value || command.locked.value) return;
    const record = target.cases.find(
      (row) => row.inspection?.id === target.currentRound.inspectionId,
    );
    if (
      !record?.inspection ||
      record.status !== 'completed' ||
      record.inspection.releaseDecision !== 'released' ||
      !['awaiting_acceptance', 'finalized'].includes(target.currentRound.status) ||
      target.currentRound.triggerType === 'manual_rejection'
    ) {
      EMessage.warning('本批尚无有效明确放行结论，不能进行可入定稿');
      return;
    }
    line.value = JSON.parse(JSON.stringify(target)) as ProcurementReceiptLine;
    review.value = JSON.parse(JSON.stringify(record)) as QualityInboundCaseItem;
    quantity.value = Number(target.quantities.unprocessedQuantity);
    details.value = initializeDraft(target, record.inspection);
    remark.value = '';
    overrideReason.value = '';
    physicalIdentityConfirmed.value = false;
    allocationOptions.reset();
    allocationOptions.seedLabels([
      { purchaseOrderLineId: target.purchaseOrderLineId, purchaseNo: target.purchaseNo },
      ...target.ownershipSources,
    ]);
    stale.value = false;
    baseline = snapshot();
    visible.value = true;
    await refreshCandidates();
  };
  const close = async () => {
    if (!visible.value) return true;
    if (!(await command.canClose(snapshot() !== baseline))) return false;
    visible.value = false;
    read.invalidate();
    allocationOptions.invalidate();
    return true;
  };
  const confirm = async () => {
    if (!canConfirm.value || !(await check()) || !line.value || !review.value || !inspection.value)
      return;
    const target = line.value;
    const body: ConfirmReceiptAcceptancePayload = {
      version: target.version,
      receiptRevisionId: target.currentReceiptRevisionId,
      roundId: target.currentRound.id,
      roundVersion: target.currentRound.version,
      confirmedQuantity: Number(quantity.value),
      overrideReason: overrideReason.value.trim() || null,
      caseId: review.value.id,
      inspectionId: inspection.value.id,
      physicalIdentityConfirmed: true,
      remark: remark.value.trim(),
      details: details.value.map((row) => ({
        ...row,
        returnReason: row.disposition === 'return' ? row.returnReason : null,
      })),
    };
    await command.run(
      { intentType: 'procurement.receipt.accept', params: { id: target.id }, query: {}, body },
      async (key) => {
        const result = await procurementApi
          .acceptReceipt(target.id, body, key)
          .catch((error: unknown) => {
            if (error instanceof RequestError && error.status === 409) stale.value = true;
            throw error;
          });
        if (
          !result.acceptanceId ||
          result.receiptLineId !== target.id ||
          result.inspectionId !== body.inspectionId
        )
          throw new Error('清单确认结果不完整，请核对后重试原操作');
        return result;
      },
      '正式清单已确认，可按清单办理实际入库或退回',
    );
  };
  onActivated(() => {
    if (!visible.value || command.locked.value) return;
    void check();
  });
  return {
    visible,
    loading,
    stale,
    remark,
    overrideReason,
    overrideRequired,
    quantityMismatch,
    physicalIdentityConfirmed,
    line,
    inspection,
    inspectionExecution,
    fullLimitBeforeFloor,
    retainedOwners,
    allocationOptions,
    refreshCandidates,
    details,
    quantity,
    limit,
    total,
    inboundTotal,
    correctedTotal,
    canConfirm,
    command,
    open,
    close,
    confirm,
  };
}
