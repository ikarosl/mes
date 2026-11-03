import {
  initialInboundInspection,
  inboundInspectionInput,
  type InboundInspectionDraft,
} from '../../quality/inbound-inspection';
import { computed, ref, watch } from 'vue';
import type {
  BusinessTemplateItem,
  CorrectReceiptLinePayload,
  ProcurementReceiptCommandResult,
  ProcurementReceiptLine,
  ProcurementInboundInspectionDetail,
  QualityInboundCaseItem,
  ReceiptAllocationItem,
  StartReceiptReviewPayload,
} from '@company/contracts';
import { RequestError } from '@company/request';
import {
  BUSINESS_TEMPLATE_COLUMN_MODE,
  BUSINESS_TEMPLATE_STATUS,
  PURCHASE_ORDER_MAX_QUANTITY,
  QUALITY_INSPECTION_TEMPLATE_CHANGED,
} from '@company/constants';
import {
  normalizeBusinessTemplateColumnRules,
  normalizeJsonTable,
  toBeijingISOString,
} from '@company/utils';
import { procurementApi } from '../../../api/procurement';
import { incomingInspectionTemplateApi } from '../../../api/incoming-inspection-template';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { useProcurementCommand } from './useProcurementCommand';
import {
  canReviewReceipt,
  canRejectReceipt,
  canRevokeReceiptRejection,
  isReceiptRejected,
  isReceiptVoided,
} from '../receipt-round-presentation';

type ReceiptDispositionAction = 'correct' | 'return' | 'reject' | 'revoke';
type ReceiptInspectionAction = 'review' | 'inspect';
type ReceiptLineAction = ReceiptDispositionAction | ReceiptInspectionAction;
type ReceiptActionSource = ProcurementReceiptLine | ProcurementInboundInspectionDetail;
const hasReceiptAllocations = (source: ReceiptActionSource): source is ProcurementReceiptLine =>
  'allocations' in source;
export function useReceiptLineAction(
  onSaved: (
    result: ProcurementReceiptCommandResult,
  ) =>
    void | ProcurementInboundInspectionDetail | Promise<void | ProcurementInboundInspectionDetail>,
) {
  const visible = ref(false),
    loading = ref(false),
    stale = ref(false);
  const action = ref<ReceiptLineAction>('correct'),
    line = ref<ReceiptActionSource | null>(null),
    allocation = ref<ReceiptAllocationItem | null>(null),
    caseRecord = ref<QualityInboundCaseItem | null>(null);
  const qualityContext = computed(() => line.value !== null && !hasReceiptAllocations(line.value));
  const reason = ref(''),
    handoverEvidence = ref(''),
    returnedAt = ref(''),
    returnRemark = ref('');
  const correctedQuantity = ref<number | undefined>(),
    physicalIdentityConfirmed = ref(false);
  const inspection = ref<InboundInspectionDraft>(initialInboundInspection()),
    inspectionValid = ref(false);
  const inspectionTemplate = ref<BusinessTemplateItem | null>(null);
  const inspectionTemplateLoading = ref(false);
  const inspectionTemplateError = ref('');
  let inspectionGeneration = 0;
  let initialInspectionBaseline: InboundInspectionDraft | null = null;
  const templateRead = useLatestReadRequest(() => (inspectionTemplateLoading.value = false));
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  const command = useProcurementCommand<ProcurementReceiptCommandResult>(async (result) => {
    const continuing = action.value === 'review' && qualityContext.value ? line.value : null;
    visible.value = false;
    templateRead.invalidate();
    const refreshed = await onSaved(result);
    if (continuing && result.caseIds.length === 1 && read.isActive()) {
      try {
        const current = read.begin(
          () =>
            read.isActive() &&
            line.value?.id === continuing.id &&
            action.value === 'review' &&
            !visible.value,
        );
        const latest =
          refreshed && refreshed.id === continuing.id
            ? refreshed
            : await procurementApi.inspectionReceiptLine(continuing.id, current.signal);
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
          resetInspectionDraft();
          reason.value = '';
          baseline = snapshot();
          visible.value = true;
          void loadInspectionTemplate();
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
  const snapshot = (inspectionOverride?: InboundInspectionDraft): string =>
    JSON.stringify({
      action: action.value,
      reason: reason.value,
      correctedQuantity: correctedQuantity.value,
      handoverEvidence: handoverEvidence.value,
      returnedAt: returnedAt.value,
      returnRemark: returnRemark.value,
      physicalIdentityConfirmed: physicalIdentityConfirmed.value,
      inspection: inspectionOverride ?? inspection.value,
    });
  let baseline = '';
  const resetInspectionDraft = (): void => {
    inspectionGeneration += 1;
    templateRead.invalidate();
    inspectionTemplate.value = null;
    inspectionTemplateError.value = '';
    inspection.value = initialInboundInspection();
    inspectionValid.value = false;
    initialInspectionBaseline = {
      ...inspection.value,
      inspectionDetails: { columns: [], rows: [] },
    };
  };
  const loadInspectionTemplate = async (): Promise<void> => {
    const draft = inspection.value;
    const qualityCase = caseRecord.value;
    const generation = inspectionGeneration;
    if (
      !visible.value ||
      action.value !== 'inspect' ||
      !qualityCase ||
      command.locked.value ||
      stale.value ||
      inspectionTemplateLoading.value ||
      !templateRead.isActive()
    )
      return;
    const previous = draft.inspectionDetails;
    const template = inspectionTemplate.value;
    const hasInput = previous.rows.some((row) =>
      previous.columns.some(
        ({ key }) =>
          template?.columnRules?.[key] !== BUSINESS_TEMPLATE_COLUMN_MODE.fixed && row[key]?.trim(),
      ),
    );
    if (hasInput) {
      try {
        await RouteMessageBox.confirm(
          '重新加载会替换当前检验表并清空已填写的输入单元格，数量、结论、检验时间和凭据保留，确认继续？',
          '重新加载模板',
          { type: 'warning', confirmButtonText: '替换检验表' },
        );
      } catch {
        return;
      }
    }
    const matchesDraft = (): boolean =>
      visible.value &&
      action.value === 'inspect' &&
      inspectionGeneration === generation &&
      inspection.value === draft &&
      draft.inspectionDetails === previous &&
      caseRecord.value?.id === qualityCase.id;
    if (!matchesDraft() || !templateRead.isActive() || command.locked.value || stale.value) return;
    const { isCurrent, signal } = templateRead.begin(matchesDraft);
    inspectionTemplateLoading.value = true;
    inspectionTemplateError.value = '';
    try {
      const result = await incomingInspectionTemplateApi.get(signal);
      if (!isCurrent()) return;
      if (command.locked.value || stale.value) return;
      const latest = result.template;
      if (!latest || latest.status !== BUSINESS_TEMPLATE_STATUS.enabled || !latest.columnRules)
        throw new Error('来料检验默认模板不可用，请联系管理员检查配置');
      const rules = normalizeBusinessTemplateColumnRules(latest.columnRules, latest.content);
      const content = normalizeJsonTable(latest.content);
      const details = {
        columns: content.columns,
        rows: content.rows.map((row) =>
          Object.fromEntries(
            content.columns.map(({ key }) => [
              key,
              rules?.[key] === BUSINESS_TEMPLATE_COLUMN_MODE.fixed ? row[key] : '',
            ]),
          ),
        ),
      };
      // 只更新本草稿的模板部分，数量、结论、时间和凭据可在加载期间继续填写。
      inspectionTemplateLoading.value = false;
      inspectionTemplate.value = latest;
      draft.inspectionTemplateId = latest.id;
      draft.inspectionTemplateVersion = latest.version;
      draft.inspectionDetails = details;
      if (initialInspectionBaseline) {
        baseline = snapshot({
          ...initialInspectionBaseline,
          inspectionTemplateId: latest.id,
          inspectionTemplateVersion: latest.version,
          inspectionDetails: details,
        });
        initialInspectionBaseline = null;
      }
    } catch (error) {
      if (isCurrent())
        inspectionTemplateError.value =
          error instanceof Error ? error.message : '默认模板读取失败，请重试';
    } finally {
      if (isCurrent()) inspectionTemplateLoading.value = false;
    }
  };
  watch(command.locked, (locked) => {
    // 发起检验成功后先延续到填写草稿，再等待该写命令解锁才能读取默认模板。
    if (
      !locked &&
      visible.value &&
      action.value === 'inspect' &&
      initialInspectionBaseline &&
      !inspectionTemplateError.value
    )
      void loadInspectionTemplate();
  });
  const canConfirm = computed(() => {
    if (
      !line.value ||
      isReceiptVoided(line.value) ||
      command.locked.value ||
      loading.value ||
      stale.value
    )
      return false;
    if (action.value === 'inspect')
      return Boolean(
        caseRecord.value &&
        inspectionTemplate.value &&
        !inspectionTemplateLoading.value &&
        !inspectionTemplateError.value &&
        inspectionValid.value,
      );
    if (action.value === 'return')
      return Boolean(allocation.value && returnedAt.value && handoverEvidence.value.trim());
    if (!reason.value.trim()) return false;
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
  const check = async (source?: ReceiptActionSource): Promise<boolean> => {
    const target = line.value;
    if (!target || !visible.value || !read.isActive()) return false;
    const current = read.begin(() => visible.value && line.value?.id === target.id);
    loading.value = true;
    try {
      const latest: ReceiptActionSource =
        source ??
        (qualityContext.value
          ? await procurementApi.inspectionReceiptLine(target.id, current.signal)
          : await procurementApi.getReceiptLine(target.id, current.signal));
      if (!current.isCurrent()) return false;
      stale.value =
        !latest ||
        isReceiptVoided(latest) ||
        latest.id !== target.id ||
        latest.version !== target.version ||
        latest.currentReceiptRevisionId !== target.currentReceiptRevisionId ||
        latest.currentRound.id !== target.currentRound.id ||
        latest.currentRound.status !== target.currentRound.status ||
        latest.currentRound.version !== target.currentRound.version;
      const checkedAllocation = allocation.value;
      if (
        checkedAllocation &&
        (!hasReceiptAllocations(latest) ||
          !latest.allocations.some(
            (item) =>
              item.id === checkedAllocation.id &&
              item.isCurrent &&
              item.remainingQuantity === checkedAllocation.remainingQuantity,
          ))
      )
        stale.value = true;
      if (
        caseRecord.value &&
        (hasReceiptAllocations(latest) ||
          !latest.cases.some(
            (item) =>
              item.id === caseRecord.value?.id &&
              item.version === caseRecord.value.version &&
              item.status === 'reviewing',
          ))
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
  const initialize = (
    target: ReceiptActionSource,
    kind: ReceiptLineAction,
    sourceAllocation?: ReceiptAllocationItem,
    qualityCase?: QualityInboundCaseItem,
  ): void => {
    if (visible.value || command.locked.value || isReceiptVoided(target)) return;
    line.value = JSON.parse(JSON.stringify(target)) as ReceiptActionSource;
    allocation.value = sourceAllocation ? { ...sourceAllocation } : null;
    caseRecord.value = qualityCase ? { ...qualityCase } : null;
    action.value = kind;
    stale.value = false;
    reason.value = '';
    handoverEvidence.value = '';
    returnRemark.value = '';
    returnedAt.value = toBeijingISOString(Date.now());
    correctedQuantity.value = Number(target.quantities.receivedQuantity);
    physicalIdentityConfirmed.value = false;
    resetInspectionDraft();
    baseline = snapshot();
    visible.value = true;
    void check();
    if (kind === 'inspect') void loadInspectionTemplate();
  };
  const open = (
    target: ProcurementReceiptLine,
    kind: ReceiptDispositionAction,
    sourceAllocation?: ReceiptAllocationItem,
  ): void => initialize(target, kind, sourceAllocation);
  const openInspection = (
    target: ProcurementInboundInspectionDetail,
    kind: ReceiptInspectionAction,
    qualityCase?: QualityInboundCaseItem,
  ): void => initialize(target, kind, undefined, qualityCase);
  const close = async (): Promise<boolean> => {
    if (!(await command.canClose(snapshot() !== baseline))) return false;
    visible.value = false;
    read.invalidate();
    templateRead.invalidate();
    inspectionGeneration += 1;
    return true;
  };
  const submitCurrent = async (submit: () => Promise<ProcurementReceiptCommandResult>) => {
    try {
      return await submit();
    } catch (error) {
      if (error instanceof RequestError && error.code === QUALITY_INSPECTION_TEMPLATE_CHANGED)
        inspectionTemplateError.value =
          '默认模板已变化，当前填写已保留；请重新加载模板后核对并填写。';
      else if (error instanceof RequestError && error.status === 409) stale.value = true;
      throw error;
    }
  };
  const confirm = async (): Promise<void> => {
    if (
      !canConfirm.value ||
      !(await check()) ||
      !read.isActive() ||
      !canConfirm.value ||
      !line.value
    )
      return;
    const target = line.value,
      range = allocation.value,
      qualityCase = caseRecord.value;
    const round = { roundId: target.currentRound.id, roundVersion: target.currentRound.version };
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
          ? '到货量更正已保存，本批无剩余实物；已入库、已退回记录保留'
          : '到货量更正已保存，整批剩余实物待重新检验；已入库、已退回记录保留',
      );
    } else if (action.value === 'inspect' && qualityCase) {
      const facts = inboundInspectionInput(inspection.value, inspectionTemplate.value);
      if (!facts) return;
      const body = {
        ...facts,
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
      const body: StartReceiptReviewPayload = {
        version: target.version,
        ...round,
        reason: reason.value.trim(),
      };
      await command.run(
        { intentType: 'procurement.receipt.review', params: { id: target.id }, query: {}, body },
        (key) => submitCurrent(() => procurementApi.startReview(target.id, body, key)),
        '已发起检验，全部剩余实物暂停入库及实际退回',
      );
    } else if (action.value === 'reject') {
      const body = {
        version: target.version,
        ...round,
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
        returnedAt: toBeijingISOString(returnedAt.value),
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
    physicalIdentityConfirmed,
    inspection,
    inspectionValid,
    inspectionTemplate,
    inspectionTemplateLoading,
    inspectionTemplateError,
    loadInspectionTemplate,
    disposedQuantity,
    correctedQuantity,
    remainingQuantity,
    correctedRemaining,
    rejected,
    canConfirm,
    command,
    open,
    openInspection,
    close,
    check,
    confirm,
  };
}
