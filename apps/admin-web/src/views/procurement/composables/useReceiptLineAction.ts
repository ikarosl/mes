import { computed, onActivated, ref } from 'vue';
import type {
  CorrectReceiptLinePayload,
  ProcurementReceiptCommandResult,
  ProcurementReceiptLine,
  QualityInboundCaseItem,
  QualityInboundInspectionInput,
  ReceiptScopeItem,
  StartReceiptReviewPayload,
} from '@company/contracts';
import { PURCHASE_ORDER_MAX_QUANTITY } from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import { useProcurementCommand } from './useProcurementCommand';

export type ReceiptLineAction = 'correct' | 'return' | 'terminate' | 'review' | 'inspect';
const initialInspection = (quantity: number): QualityInboundInspectionInput => ({
  inspectionMethod: quantity === 0 ? 'review_only' : 'full',
  qualifiedQuantity: null,
  unqualifiedQuantity: null,
  sampleQuantity: null,
  sampleUnqualifiedQuantity: null,
  removedDefectQuantity: 0,
  inboundApproved: false,
  disposition: quantity === 0 ? 'receipt_zero_confirmed' : 'await_decision',
  remark: '',
  evidence: '',
});

export function useReceiptLineAction(
  onSaved: (result: ProcurementReceiptCommandResult) => void | Promise<void>,
) {
  const visible = ref(false),
    loading = ref(false),
    stale = ref(false),
    qualityContext = ref(false);
  const action = ref<ReceiptLineAction>('correct'),
    line = ref<ProcurementReceiptLine | null>(null),
    scope = ref<ReceiptScopeItem | null>(null),
    caseRecord = ref<QualityInboundCaseItem | null>(null);
  const reason = ref(''),
    quantity = ref<number | undefined>(),
    handoverEvidence = ref(''),
    returnedAt = ref(''),
    returnRemark = ref('');
  const caseType = ref<StartReceiptReviewPayload['caseType']>('initial');
  const adjustments = ref<Array<{ scope: ReceiptScopeItem; revisedQuantity: number }>>([]),
    newRemainderQuantity = ref(0),
    physicalIdentityConfirmed = ref(false);
  const inspection = ref<QualityInboundInspectionInput>(initialInspection(1)),
    inspectionValid = ref(false);
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  const command = useProcurementCommand<ProcurementReceiptCommandResult>(async (result) => {
    visible.value = false;
    await onSaved(result);
  }, '到货处置');
  const disposedQuantity = computed(
    () =>
      Number(line.value?.quantities.inboundQuantity ?? 0) +
      Number(line.value?.quantities.returnedQuantity ?? 0),
  );
  const correctedQuantity = computed(
    () =>
      disposedQuantity.value +
      adjustments.value.reduce((sum, item) => sum + Number(item.revisedQuantity), 0) +
      Number(newRemainderQuantity.value),
  );
  const changedAdjustments = computed(() =>
    adjustments.value.filter((item) => item.revisedQuantity !== Number(item.scope.quantity)),
  );
  const snapshot = (): string =>
    JSON.stringify({
      action: action.value,
      reason: reason.value,
      quantity: quantity.value,
      handoverEvidence: handoverEvidence.value,
      returnedAt: returnedAt.value,
      returnRemark: returnRemark.value,
      caseType: caseType.value,
      adjustments: adjustments.value.map((row) => row.revisedQuantity),
      newRemainderQuantity: newRemainderQuantity.value,
      physicalIdentityConfirmed: physicalIdentityConfirmed.value,
      inspection: inspection.value,
    });
  let baseline = '';
  const canConfirm = computed(() => {
    if (!line.value || command.locked.value || loading.value || stale.value) return false;
    if (action.value === 'inspect') return Boolean(caseRecord.value && inspectionValid.value);
    if (action.value === 'return')
      return Boolean(scope.value && returnedAt.value && handoverEvidence.value.trim());
    if (!reason.value.trim()) return false;
    if (action.value === 'correct')
      return (
        physicalIdentityConfirmed.value &&
        (changedAdjustments.value.length > 0 || newRemainderQuantity.value > 0) &&
        Number.isInteger(correctedQuantity.value) &&
        correctedQuantity.value <= PURCHASE_ORDER_MAX_QUANTITY &&
        correctedQuantity.value >= disposedQuantity.value &&
        adjustments.value.every(
          (entry) => Number.isInteger(entry.revisedQuantity) && entry.revisedQuantity >= 0,
        ) &&
        Number.isInteger(newRemainderQuantity.value) &&
        newRemainderQuantity.value >= 0
      );
    return Boolean(
      scope.value &&
      Number.isInteger(quantity.value) &&
      Number(quantity.value) > 0 &&
      Number(quantity.value) <= Number(scope.value.quantity),
    );
  });
  const check = async (): Promise<boolean> => {
    const target = line.value;
    if (!target || !visible.value || !read.isActive()) return false;
    const current = read.begin(() => visible.value && line.value?.id === target.id);
    loading.value = true;
    try {
      const latest = qualityContext.value
        ? await procurementApi.inspectionReceiptLine(target.id, current.signal)
        : (await procurementApi.getReceipt(target.receiptId, current.signal)).items.find(
            (item) => item.id === target.id,
          );
      if (!current.isCurrent()) return false;
      stale.value =
        !latest ||
        latest.version !== target.version ||
        latest.currentReceiptRevisionId !== target.currentReceiptRevisionId;
      if (
        scope.value &&
        !latest?.scopes.some(
          (item) => item.id === scope.value?.id && item.version === scope.value.version,
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
    sourceScope?: ReceiptScopeItem,
    qualityCase?: QualityInboundCaseItem,
    forQuality = false,
  ): void => {
    if (visible.value || command.locked.value) return;
    line.value = JSON.parse(JSON.stringify(target)) as ProcurementReceiptLine;
    scope.value = sourceScope ? { ...sourceScope } : null;
    caseRecord.value = qualityCase ? { ...qualityCase } : null;
    action.value = kind;
    qualityContext.value = forQuality;
    stale.value = false;
    reason.value = '';
    handoverEvidence.value = '';
    returnRemark.value = '';
    returnedAt.value = new Date().toISOString();
    quantity.value = sourceScope ? Number(sourceScope.quantity) : undefined;
    caseType.value = sourceScope?.inspectionId ? 'reinspection' : 'initial';
    adjustments.value = target.scopes.map((item) => ({
      scope: { ...item },
      revisedQuantity: Number(item.quantity),
    }));
    newRemainderQuantity.value = 0;
    physicalIdentityConfirmed.value = false;
    inspection.value = initialInspection(Number(qualityCase?.coveredQuantity ?? 1));
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
  const confirm = async (): Promise<void> => {
    if (!canConfirm.value || !(await check()) || !line.value) return;
    const target = line.value,
      range = scope.value,
      qualityCase = caseRecord.value;
    if (action.value === 'correct') {
      const body: CorrectReceiptLinePayload = {
        version: target.version,
        previousRevisionId: target.currentReceiptRevisionId,
        receivedQuantity: correctedQuantity.value,
        reason: reason.value.trim(),
        physicalIdentityConfirmed: true,
        adjustments: changedAdjustments.value.map((row) => ({
          scopeId: row.scope.id,
          scopeVersion: row.scope.version,
          revisedQuantity: row.revisedQuantity,
        })),
        newRemainderQuantity: newRemainderQuantity.value,
      };
      await command.run(
        { intentType: 'procurement.receipt.correct', params: { id: target.id }, query: {}, body },
        (key) => procurementApi.correctReceipt(target.id, body, key),
        '实收修订已保存，受影响范围已进入质检复核',
      );
    } else if (action.value === 'inspect' && qualityCase) {
      const body = {
        ...inspection.value,
        remark: inspection.value.remark.trim(),
        evidence: inspection.value.evidence.trim(),
        version: target.version,
        caseId: qualityCase.id,
        caseVersion: qualityCase.version,
        receiptRevisionId: qualityCase.receiptRevisionId,
      };
      await command.run(
        { intentType: 'procurement.receipt.inspect', params: { id: target.id }, query: {}, body },
        (key) => procurementApi.inspectReceipt(target.id, body, key),
        '检验结论已追加，仓库待办已更新',
      );
    } else if (action.value === 'review' && range) {
      const body = {
        version: target.version,
        scopeId: range.id,
        scopeVersion: range.version,
        quantity: Number(quantity.value),
        caseType: caseType.value,
        reason: reason.value.trim(),
      };
      await command.run(
        { intentType: 'procurement.receipt.review', params: { id: target.id }, query: {}, body },
        (key) => procurementApi.startReview(target.id, body, key),
        '已明确发起检验，该范围暂停入库及实际退回',
      );
    } else if (action.value === 'terminate' && range) {
      const body = {
        version: target.version,
        scopeId: range.id,
        scopeVersion: range.version,
        quantity: Number(quantity.value),
        reason: reason.value.trim(),
      };
      await command.run(
        { intentType: 'procurement.receipt.terminate', params: { id: target.id }, query: {}, body },
        (key) => procurementApi.terminateReceiptScope(target.id, body, key),
        '该范围已指定为采购终止待退，尚未实际退回',
      );
    } else if (action.value === 'return' && range) {
      const body = {
        version: target.version,
        scopeId: range.id,
        scopeVersion: range.version,
        receiptRevisionId: range.receiptRevisionId,
        returnedAt: returnedAt.value,
        handoverEvidence: handoverEvidence.value.trim(),
        remark: returnRemark.value.trim() || null,
      };
      await command.run(
        { intentType: 'procurement.receipt.return', params: { id: target.id }, query: {}, body },
        (key) => procurementApi.confirmSupplierReturn(target.id, body, key),
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
    scope,
    caseRecord,
    reason,
    quantity,
    handoverEvidence,
    returnedAt,
    returnRemark,
    caseType,
    adjustments,
    newRemainderQuantity,
    physicalIdentityConfirmed,
    inspection,
    inspectionValid,
    disposedQuantity,
    correctedQuantity,
    canConfirm,
    command,
    open,
    close,
    check,
    confirm,
  };
}
