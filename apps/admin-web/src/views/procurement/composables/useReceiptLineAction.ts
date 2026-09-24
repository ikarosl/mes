import {
  initialInboundInspection,
  inboundInspectionInput,
  type InboundInspectionDraft,
} from '../../quality/inbound-inspection';
import { computed, onActivated, ref } from 'vue';
import type {
  CorrectReceiptLinePayload,
  ProcurementReceiptCommandResult,
  ProcurementReceiptLine,
  QualityInboundCaseItem,
  ReceiptAllocationItem,
  StartReceiptReviewPayload,
} from '@company/contracts';
import { RequestError } from '@company/request';
import { PURCHASE_ORDER_MAX_QUANTITY } from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import { useProcurementCommand } from './useProcurementCommand';
import {
  canReviewReceipt,
  canRejectReceipt,
  canRevokeReceiptRejection,
  isReceiptRejected,
} from '../receipt-round-presentation';

export type ReceiptLineAction = 'correct' | 'return' | 'reject' | 'revoke' | 'review' | 'inspect';
export function useReceiptLineAction(
  onSaved: (result: ProcurementReceiptCommandResult) => void | Promise<void>,
) {
  const visible = ref(false),
    loading = ref(false),
    stale = ref(false),
    qualityContext = ref(false);
  const action = ref<ReceiptLineAction>('correct'),
    line = ref<ProcurementReceiptLine | null>(null),
    allocation = ref<ReceiptAllocationItem | null>(null),
    caseRecord = ref<QualityInboundCaseItem | null>(null);
  const reason = ref(''),
    handoverEvidence = ref(''),
    returnedAt = ref(''),
    returnRemark = ref('');
  const caseType = ref<StartReceiptReviewPayload['caseType']>('initial');
  const correctedQuantity = ref<number | undefined>(),
    physicalIdentityConfirmed = ref(false);
  const ownership = ref<
    Array<{
      purchaseOrderLineId: string;
      purchaseNo: string;
      previousQuantity: number;
      quantity: number | undefined;
    }>
  >([]);
  const inspection = ref<InboundInspectionDraft>(initialInboundInspection()),
    inspectionValid = ref(false);
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  const command = useProcurementCommand<ProcurementReceiptCommandResult>(async (result) => {
    const continuing = action.value === 'review' && qualityContext.value ? line.value : null;
    visible.value = false;
    await onSaved(result);
    if (continuing && result.caseIds.length === 1) {
      try {
        const current = read.begin(
          () =>
            read.isActive() &&
            line.value?.id === continuing.id &&
            action.value === 'review' &&
            !visible.value,
        );
        const latest = await procurementApi.inspectionReceiptLine(continuing.id, current.signal);
        if (!current.isCurrent()) return;
        const nextCase = latest.cases.find(
          (record) => record.id === result.caseIds[0] && record.status === 'reviewing',
        );
        if (nextCase) {
          line.value = latest;
          allocation.value = null;
          caseRecord.value = nextCase;
          action.value = 'inspect';
          stale.value = false;
          inspection.value = initialInboundInspection();
          inspectionValid.value = false;
          reason.value = '';
          baseline = snapshot();
          visible.value = true;
        }
      } catch (error) {
        EMessage.error(error, '检验已发起，结果录入页读取失败；请从检验待办继续登记');
      }
    }
  }, '到货处置');
  const disposedQuantity = computed(
    () =>
      Number(line.value?.quantities.inboundQuantity ?? 0) +
      Number(line.value?.quantities.returnedQuantity ?? 0),
  );
  const remainingQuantity = computed(
    () => Number(line.value?.quantities.receivedQuantity ?? 0) - disposedQuantity.value,
  );
  const correctedRemaining = computed(
    () => Number(correctedQuantity.value) - disposedQuantity.value,
  );
  const rejected = computed(() => !!line.value && isReceiptRejected(line.value));
  const ownershipTarget = computed(() =>
    action.value === 'correct' ? correctedRemaining.value : remainingQuantity.value,
  );
  const ownershipChanged = computed(
    () =>
      ownership.value.some(
        (source) => source.purchaseOrderLineId !== line.value?.purchaseOrderLineId,
      ) &&
      Number.isSafeInteger(ownershipTarget.value) &&
      ownershipTarget.value >= 0 &&
      Number(line.value?.ownershipSourceQuantity) !== ownershipTarget.value,
  );
  const ownershipRequired = computed(() => ownershipChanged.value && action.value === 'reject');
  const ownershipTotal = computed(() =>
    ownership.value.reduce((sum, row) => sum + Number(row.quantity), 0),
  );
  const ownershipValid = computed(
    () =>
      !ownershipRequired.value ||
      (ownership.value.length <= 100 &&
        ownershipTotal.value === ownershipTarget.value &&
        ownership.value.every(
          (row) =>
            Number.isSafeInteger(row.quantity) &&
            Number(row.quantity) >= 0 &&
            Number(row.quantity) <= PURCHASE_ORDER_MAX_QUANTITY,
        )),
  );
  const snapshot = (): string =>
    JSON.stringify({
      action: action.value,
      reason: reason.value,
      correctedQuantity: correctedQuantity.value,
      handoverEvidence: handoverEvidence.value,
      returnedAt: returnedAt.value,
      returnRemark: returnRemark.value,
      caseType: caseType.value,
      physicalIdentityConfirmed: physicalIdentityConfirmed.value,
      inspection: inspection.value,
      ownership: ownership.value,
    });
  let baseline = '';
  const canConfirm = computed(() => {
    if (!line.value || command.locked.value || loading.value || stale.value) return false;
    if (action.value === 'inspect') return Boolean(caseRecord.value && inspectionValid.value);
    if (action.value === 'return')
      return Boolean(allocation.value && returnedAt.value && handoverEvidence.value.trim());
    if (!reason.value.trim() || !ownershipValid.value) return false;
    if (action.value === 'correct')
      return (
        physicalIdentityConfirmed.value &&
        Number.isSafeInteger(correctedQuantity.value) &&
        Number(correctedQuantity.value) <= PURCHASE_ORDER_MAX_QUANTITY &&
        Number(correctedQuantity.value) >= disposedQuantity.value &&
        Number(correctedQuantity.value) !== Number(line.value.quantities.receivedQuantity)
      );
    if (action.value === 'revoke') return canRevokeReceiptRejection(line.value);
    return action.value === 'review' ? canReviewReceipt(line.value) : canRejectReceipt(line.value);
  });
  const check = async (): Promise<boolean> => {
    const target = line.value;
    if (!target || !visible.value || !read.isActive()) return false;
    const current = read.begin(() => visible.value && line.value?.id === target.id);
    loading.value = true;
    try {
      const latest = qualityContext.value
        ? await procurementApi.inspectionReceiptLine(target.id, current.signal)
        : await procurementApi.getReceiptLine(target.id, current.signal);
      if (!current.isCurrent()) return false;
      stale.value =
        !latest ||
        latest.version !== target.version ||
        latest.currentReceiptRevisionId !== target.currentReceiptRevisionId ||
        latest.currentRound.id !== target.currentRound.id ||
        latest.currentRound.version !== target.currentRound.version;
      if (
        allocation.value &&
        !latest?.allocations.some(
          (item) =>
            item.id === allocation.value?.id &&
            item.isCurrent &&
            item.remainingQuantity === allocation.value.remainingQuantity,
        )
      )
        stale.value = true;
      if (
        caseRecord.value &&
        !latest?.cases.some(
          (item) =>
            item.id === caseRecord.value?.id &&
            item.version === caseRecord.value.version &&
            item.status === 'reviewing',
        )
      )
        stale.value = true;
      return !stale.value;
    } catch (error) {
      if (current.isCurrent()) {
        stale.value = true;
        EMessage.error(error, '处置依据核对失败，当前输入已保留');
      }
      return false;
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  };
  const open = (
    target: ProcurementReceiptLine,
    kind: ReceiptLineAction,
    sourceAllocation?: ReceiptAllocationItem,
    qualityCase?: QualityInboundCaseItem,
    forQuality = false,
  ): void => {
    if (visible.value || command.locked.value) return;
    line.value = JSON.parse(JSON.stringify(target)) as ProcurementReceiptLine;
    allocation.value = sourceAllocation ? { ...sourceAllocation } : null;
    caseRecord.value = qualityCase ? { ...qualityCase } : null;
    action.value = kind;
    qualityContext.value = forQuality;
    stale.value = false;
    reason.value = '';
    handoverEvidence.value = '';
    returnRemark.value = '';
    returnedAt.value = new Date().toISOString();
    correctedQuantity.value = Number(target.quantities.receivedQuantity);
    caseType.value = target.currentRound.status === 'uninspected' ? 'initial' : 'reinspection';
    physicalIdentityConfirmed.value = false;
    ownership.value = target.ownershipSources.map((source) => ({
      purchaseOrderLineId: source.purchaseOrderLineId,
      purchaseNo: source.purchaseNo,
      previousQuantity: Number(source.quantity),
      quantity: undefined,
    }));
    inspection.value = initialInboundInspection();
    inspectionValid.value = false;
    baseline = snapshot();
    visible.value = true;
    void check();
  };
  const close = async (): Promise<boolean> => {
    if (!(await command.canClose(snapshot() !== baseline))) return false;
    visible.value = false;
    read.invalidate();
    return true;
  };
  const submitCurrent = async (submit: () => Promise<ProcurementReceiptCommandResult>) => {
    try {
      return await submit();
    } catch (error) {
      if (error instanceof RequestError && error.status === 409) stale.value = true;
      throw error;
    }
  };
  const confirm = async (): Promise<void> => {
    if (!canConfirm.value || !(await check()) || !line.value) return;
    const target = line.value,
      range = allocation.value,
      qualityCase = caseRecord.value;
    const round = { roundId: target.currentRound.id, roundVersion: target.currentRound.version };
    const ownershipInput = ownershipRequired.value
      ? {
          ownership: ownership.value.map((row) => ({
            purchaseOrderLineId: row.purchaseOrderLineId,
            quantity: Number(row.quantity),
          })),
        }
      : {};
    if (action.value === 'correct') {
      const body: CorrectReceiptLinePayload = {
        version: target.version,
        previousRevisionId: target.currentReceiptRevisionId,
        receivedQuantity: Number(correctedQuantity.value),
        ...round,
        reason: reason.value.trim(),
        physicalIdentityConfirmed: true,
      };
      await command.run(
        { intentType: 'procurement.receipt.correct', params: { id: target.id }, query: {}, body },
        (key) => submitCurrent(() => procurementApi.correctReceipt(target.id, body, key)),
        Number(correctedQuantity.value) === disposedQuantity.value
          ? '实收修订已保存，本批无剩余实物；已入已退保留'
          : '实收修订已保存，整批剩余实物待重新检验；已入已退保留',
      );
    } else if (action.value === 'inspect' && qualityCase) {
      const facts = inboundInspectionInput(inspection.value);
      if (!facts) return;
      const body = {
        ...facts,
        remark: inspection.value.remark.trim(),
        evidence: inspection.value.evidence.trim(),
        version: target.version,
        ...round,
        caseId: qualityCase.id,
        caseVersion: qualityCase.version,
        receiptRevisionId: qualityCase.receiptRevisionId,
      };
      await command.run(
        { intentType: 'procurement.receipt.inspect', params: { id: target.id }, query: {}, body },
        (key) => submitCurrent(() => procurementApi.inspectReceipt(target.id, body, key)),
        facts.releaseDecision === 'released'
          ? '检验记录已保存，待库管核对清单'
          : '检验记录已保存，本批继续阻断正常定稿及入库',
      );
    } else if (action.value === 'review') {
      const body = {
        version: target.version,
        ...round,
        caseType: caseType.value,
        reason: reason.value.trim(),
      };
      await command.run(
        { intentType: 'procurement.receipt.review', params: { id: target.id }, query: {}, body },
        (key) => submitCurrent(() => procurementApi.startReview(target.id, body, key)),
        '已发起整批检验，全部剩余实物暂停入库及实际退回',
      );
    } else if (action.value === 'reject') {
      const body = {
        version: target.version,
        ...round,
        ...ownershipInput,
        reason: reason.value.trim(),
      };
      await command.run(
        { intentType: 'procurement.receipt.reject', params: { id: target.id }, query: {}, body },
        (key) => submitCurrent(() => procurementApi.rejectReceipt(target.id, body, key)),
        '本批剩余实物已人工拒收，待实际交接退回',
      );
    } else if (action.value === 'revoke') {
      const body = { version: target.version, ...round, reason: reason.value.trim() };
      await command.run(
        {
          intentType: 'procurement.receipt.revoke-rejection',
          params: { id: target.id },
          query: {},
          body,
        },
        (key) => submitCurrent(() => procurementApi.revokeReceiptRejection(target.id, body, key)),
        '已撤销本轮拒收，剩余实物回到待检；请重新质检和定稿',
      );
    } else if (action.value === 'return' && range) {
      const body = {
        version: target.version,
        ...round,
        allocationId: range.id,
        receiptRevisionId: range.receiptRevisionId,
        returnedAt: returnedAt.value,
        handoverEvidence: handoverEvidence.value.trim(),
        remark: returnRemark.value.trim() || null,
      };
      await command.run(
        { intentType: 'procurement.receipt.return', params: { id: target.id }, query: {}, body },
        (key) => submitCurrent(() => procurementApi.confirmSupplierReturn(target.id, body, key)),
        '已确认该范围全部退回供应商',
      );
    }
  };
  onActivated(() => {
    if (visible.value && !command.locked.value) void check();
  });
  return {
    visible,
    loading,
    stale,
    action,
    line,
    allocation,
    caseRecord,
    reason,
    handoverEvidence,
    returnedAt,
    returnRemark,
    caseType,
    physicalIdentityConfirmed,
    inspection,
    inspectionValid,
    disposedQuantity,
    correctedQuantity,
    remainingQuantity,
    correctedRemaining,
    rejected,
    ownership,
    ownershipRequired,
    ownershipChanged,
    ownershipTarget,
    ownershipTotal,
    canConfirm,
    command,
    open,
    close,
    check,
    confirm,
  };
}
