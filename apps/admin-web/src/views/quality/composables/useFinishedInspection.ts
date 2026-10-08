import { computed, onActivated, onScopeDispose, reactive, ref } from 'vue';
import { RequestError } from '@company/request';
import { toBeijingISOString } from '@company/utils';
import { PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS } from '@company/constants';
import type {
  BeginFinishedReinspectionPayload,
  FinishedInspectionTaskDetail,
  ProductionOutputInspection,
  ProductionOutputQuantities,
  RecordFinishedInspectionPayload,
} from '@company/contracts';
import { finishedInspectionsApi } from '../../../api/finished-inspections';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useIdempotentIntent } from '../../../composables/idempotency/useIdempotentIntent';
import { EMessage } from '../../../utils/message';
import { toBeijingDateTimeInputValue } from '../../../utils/date';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { useTabsStore } from '../../../stores/tabs';
import {
  inspectionQuantities,
  inspectionFormQuantities,
  type ProductionOutputInspectionForm,
} from '../finished-inspection';

const emptyForm = (): ProductionOutputInspectionForm => ({
  inspectionMethod: 'full',
  qualifiedQuantity: undefined,
  unqualifiedQuantity: undefined,
  releaseDecision: undefined,
  zeroConfirmed: false,
  inspectedAt: '',
  resultNote: '',
  evidenceReference: '',
});

function isValidInspectionRecord(record: ProductionOutputInspection, target: string) {
  if (!record || record.batchId !== target) return false;
  const quantities = inspectionQuantities(record);
  return (
    quantities !== null &&
    record.qualifiedQuantity === quantities.qualifiedQuantity &&
    record.inspectedQuantity === quantities.inspectedQuantity
  );
}

export function useFinishedInspection(
  changed: () => void,
  extraDraftMessage: () => string | null = () => null,
) {
  const visible = ref(false),
    batchId = ref(''),
    detail = ref<FinishedInspectionTaskDetail | null>(null);
  const loading = ref(false),
    submitting = ref(false),
    unresolved = ref(false),
    error = ref('');
  const records = ref<ProductionOutputInspection[]>([]),
    total = ref(0),
    page = ref(1),
    pageSize = ref(10);
  const recordsLoading = ref(false),
    recordsError = ref('');
  const focusedRecordId = ref<string | null>(null);
  const inspection = reactive(emptyForm()),
    inspectionOpen = ref(false),
    inspectionVersion = ref<number | null>(null),
    inspectionBaseline = ref<number | null>(null);
  const inspectionDeclared = reactive<ProductionOutputQuantities>({
    availableQuantity: 0,
    extraQuantity: 0,
    additionalScrapQuantity: 0,
  });
  const read = useLatestReadRequest(() => {
    loading.value = false;
  });
  const historyRead = useLatestReadRequest(() => {
    recordsLoading.value = false;
  });
  const intent = useIdempotentIntent('质检记录');
  const startIntent = useIdempotentIntent('开始成品质检');
  const reinspectionIntent = useIdempotentIntent('开始成品复检');
  let pendingStart: { batchId: string; version: number } | null = null;
  let pendingReinspection: { batchId: string; body: BeginFinishedReinspectionPayload } | null =
    null;
  let pending: { batchId: string; body: RecordFinishedInspectionPayload } | null = null;
  const busy = computed(() => loading.value || submitting.value);
  const locked = computed(() => submitting.value || unresolved.value);
  const inspectionStale = computed(
    () => inspectionOpen.value && inspectionVersion.value !== detail.value?.version,
  );
  const inspectionValid = computed(
    () =>
      inspectionFormQuantities(inspection) !== null &&
      inspectionBaseline.value !== null &&
      !!inspection.releaseDecision &&
      (inspection.inspectionMethod !== 'zero_confirmation' || inspection.zeroConfirmed) &&
      !!inspection.inspectedAt &&
      !!toBeijingDateTimeInputValue(inspection.inspectedAt) &&
      !!inspection.resultNote.trim() &&
      inspection.resultNote.length <= 5000 &&
      !!inspection.evidenceReference.trim() &&
      inspection.evidenceReference.length <= 5000,
  );

  async function loadRecords() {
    if (!visible.value || !historyRead.isActive()) return;
    const target = batchId.value,
      recordId = focusedRecordId.value,
      current = historyRead.begin(
        () => visible.value && batchId.value === target && focusedRecordId.value === recordId,
      );
    recordsLoading.value = true;
    recordsError.value = '';
    try {
      if (recordId) {
        const result = await finishedInspectionsApi.getRecord(target, recordId, current.signal);
        if (!current.isCurrent()) return;
        if (!result || result.id !== recordId || !isValidInspectionRecord(result, target))
          throw new Error('检验记录与定位对象不一致，请刷新重试');
        records.value = [result];
        total.value = 1;
        return;
      }
      const result = await finishedInspectionsApi.records(
        target,
        { page: page.value, pageSize: pageSize.value },
        current.signal,
      );
      if (!current.isCurrent()) return;
      if (
        !Array.isArray(result.items) ||
        result.items.some((row) => !isValidInspectionRecord(row, target))
      )
        throw new Error('检验历史响应格式异常，请刷新重试');
      records.value = result.items;
      total.value = result.total;
    } catch (failure) {
      if (current.isCurrent())
        recordsError.value = failure instanceof Error ? failure.message : '检验历史加载失败';
    } finally {
      if (current.isCurrent()) recordsLoading.value = false;
    }
  }
  async function load() {
    if (!visible.value || !read.isActive()) return;
    const target = batchId.value,
      current = read.begin(() => visible.value && batchId.value === target);
    loading.value = true;
    error.value = '';
    try {
      const result = await finishedInspectionsApi.detail(target, current.signal);
      if (!current.isCurrent()) return;
      if (
        result.batchId !== target ||
        !Number.isInteger(result.version) ||
        (result.latestInspection && !isValidInspectionRecord(result.latestInspection, target))
      )
        throw new Error('成品质检任务响应格式异常，请刷新重试');
      detail.value = result;
    } catch (failure) {
      if (current.isCurrent())
        error.value = failure instanceof Error ? failure.message : '成品质检任务加载失败';
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  }
  async function refresh() {
    await Promise.all([load(), loadRecords()]);
  }
  async function open(target: string, recordId?: string) {
    if (locked.value || visible.value) return false;
    batchId.value = target;
    visible.value = true;
    detail.value = null;
    records.value = [];
    focusedRecordId.value = recordId ?? null;
    page.value = 1;
    total.value = 0;
    inspectionOpen.value = false;
    inspectionVersion.value = null;
    inspectionBaseline.value = null;
    await refresh();
    return visible.value && batchId.value === target;
  }
  async function focusRecord(recordId: string | null) {
    historyRead.invalidate();
    focusedRecordId.value = recordId;
    records.value = [];
    recordsError.value = '';
    page.value = 1;
    total.value = 0;
    await loadRecords();
  }
  function openInspectionForm() {
    if (!detail.value?.canRecordInspection || !detail.value.declared) return;
    Object.assign(inspection, emptyForm(), { inspectedAt: toBeijingISOString(Date.now()) });
    Object.assign(inspectionDeclared, detail.value.declared);
    inspectionVersion.value = detail.value.version;
    inspectionBaseline.value =
      detail.value.baselinePlannedReceived === null || detail.value.baselineExtraReceived === null
        ? null
        : Number(detail.value.baselinePlannedReceived) + Number(detail.value.baselineExtraReceived);
    inspectionOpen.value = true;
  }
  async function runStart() {
    if (submitting.value || !pendingStart) return;
    const command = pendingStart;
    submitting.value = true;
    try {
      await startIntent.execute(
        {
          intentType: 'quality.finished-inspection.start',
          params: { batchId: command.batchId },
          query: {},
          body: { version: command.version },
        },
        async (key) => {
          const result = await finishedInspectionsApi.start(
            command.batchId,
            { version: command.version },
            key,
          );
          if (
            !result ||
            result.batchId !== command.batchId ||
            !/^[1-9]\d*$/.test(result.roundId) ||
            result.version !== command.version + 1
          )
            throw new RequestError('服务器未返回完整的检验开始结果，请刷新后核对。', 502);
          return result;
        },
      );
      pendingStart = null;
      unresolved.value = false;
      changed();
      await refresh();
      if (batchId.value === command.batchId) openInspectionForm();
    } catch (failure) {
      unresolved.value = startIntent.getStatus() !== 'idle';
      if (!unresolved.value) pendingStart = null;
      EMessage.error(failure);
    } finally {
      submitting.value = false;
    }
  }
  async function startInspection() {
    if (
      !detail.value ||
      !detail.value.declared ||
      busy.value ||
      unresolved.value ||
      error.value ||
      inspectionOpen.value
    )
      return;
    if (detail.value.canRecordInspection) {
      openInspectionForm();
      return;
    }
    if (!detail.value.canStartInspection) return;
    const command = { batchId: batchId.value, version: detail.value.version };
    try {
      await RouteMessageBox.confirm(
        '本轮送检范围已在产出草稿保存时固定。确认后进入检验中，可继续填写检查事实。',
        '开始本轮成品质检',
        { confirmButtonText: '开始检验' },
      );
    } catch {
      return;
    }
    if (
      !visible.value ||
      batchId.value !== command.batchId ||
      detail.value?.version !== command.version
    )
      return;
    pendingStart = command;
    await runStart();
  }
  async function runReinspection(): Promise<boolean> {
    if (submitting.value || !pendingReinspection) return false;
    const command = pendingReinspection;
    submitting.value = true;
    try {
      await reinspectionIntent.execute(
        {
          intentType: 'quality.finished-inspection.reinspect',
          params: { batchId: command.batchId },
          query: {},
          body: command.body,
        },
        async (key) => {
          const result = await finishedInspectionsApi.beginReinspection(
            command.batchId,
            command.body,
            key,
          );
          if (
            !result ||
            result.batchId !== command.batchId ||
            !/^[1-9]\d*$/.test(result.roundId) ||
            result.version !== command.body.version + 1
          )
            throw new RequestError('服务器未返回完整的复检开始结果，请刷新后核对当前轮。', 502);
          return result;
        },
      );
      pendingReinspection = null;
      unresolved.value = false;
      changed();
      await refresh();
      if (batchId.value === command.batchId) openInspectionForm();
      return true;
    } catch (failure) {
      unresolved.value = reinspectionIntent.getStatus() !== 'idle';
      if (!unresolved.value) pendingReinspection = null;
      EMessage.error(failure);
      return false;
    } finally {
      submitting.value = false;
    }
  }
  async function beginReinspection(reason: string): Promise<boolean> {
    if (
      !detail.value?.canBeginReinspection ||
      !reason.trim() ||
      reason.trim().length > 5000 ||
      busy.value ||
      unresolved.value ||
      error.value ||
      inspectionOpen.value
    )
      return false;
    const command = {
      batchId: batchId.value,
      body: {
        version: detail.value.version,
        currentRevisionId: detail.value.currentRevisionId,
        reason: reason.trim(),
      },
    };
    pendingReinspection = command;
    return runReinspection();
  }
  function changeInspection(changes: Partial<ProductionOutputInspectionForm>) {
    if (busy.value || unresolved.value || !inspectionOpen.value) return;
    if (changes.inspectionMethod && changes.inspectionMethod !== inspection.inspectionMethod) {
      Object.assign(inspection, {
        qualifiedQuantity: undefined,
        unqualifiedQuantity: undefined,
        releaseDecision: undefined,
        zeroConfirmed: false,
      });
    }
    Object.assign(inspection, changes);
    if (inspection.inspectionMethod === 'zero_confirmation') {
      Object.assign(inspection, {
        qualifiedQuantity: 0,
        unqualifiedQuantity: 0,
        releaseDecision: 'released',
      });
      return;
    }
    if (
      changes.inspectionMethod !== undefined ||
      'qualifiedQuantity' in changes ||
      'unqualifiedQuantity' in changes
    )
      inspection.releaseDecision = undefined;
  }
  async function discardInspection() {
    if (locked.value) return;
    try {
      await RouteMessageBox.confirm(
        '放弃本地填写？当前检验轮保持办理中；如已发起复检，剩余入库仍暂停。',
        '放弃填写',
        {
          type: 'warning',
        },
      );
    } catch {
      return;
    }
    inspectionOpen.value = false;
  }
  async function run() {
    if (submitting.value || !pending) return;
    const command = pending;
    submitting.value = true;
    try {
      await intent.execute(
        {
          intentType: 'quality.finished-inspection.record',
          params: { batchId: command.batchId },
          query: {},
          body: command.body,
        },
        async (key) => {
          const result = await finishedInspectionsApi.record(command.batchId, command.body, key);
          if (
            !result ||
            result.batchId !== command.batchId ||
            typeof result.inspectionId !== 'string' ||
            !/^[1-9]\d*$/.test(result.inspectionId) ||
            !Number.isSafeInteger(result.version) ||
            result.version !== command.body.version + 1
          )
            throw new RequestError('服务器未返回完整的质检登记结果，请核对历史并原样重试。', 502);
          return result;
        },
      );
      pending = null;
      unresolved.value = false;
      inspectionOpen.value = false;
      EMessage.success('质检记录已留存，产线管理员可核对清单并引用本次记录');
      changed();
      page.value = 1;
      await refresh();
    } catch (failure) {
      unresolved.value = intent.getStatus() !== 'idle';
      if (!unresolved.value) pending = null;
      EMessage.error(failure);
    } finally {
      submitting.value = false;
    }
  }
  async function recordInspection() {
    if (
      !detail.value?.canRecordInspection ||
      busy.value ||
      unresolved.value ||
      error.value ||
      !inspectionOpen.value ||
      !inspectionValid.value ||
      inspectionStale.value
    )
      return;
    const quantities = inspectionFormQuantities(inspection);
    const decision = inspection.releaseDecision;
    if (!quantities || !decision) return;
    const target = batchId.value,
      body: RecordFinishedInspectionPayload = {
        version: detail.value.version,
        inspectionMethod: inspection.inspectionMethod,
        qualifiedQuantity: quantities.qualifiedQuantity,
        unqualifiedQuantity: quantities.unqualifiedQuantity,
        releaseDecision: decision,
        inspectedAt: toBeijingISOString(inspection.inspectedAt),
        resultNote: inspection.resultNote.trim(),
        evidenceReference: inspection.evidenceReference.trim(),
      };
    if (inspectionBaseline.value === null) return;
    try {
      await RouteMessageBox.confirm(
        `本次${inspection.inspectionMethod === 'sampling' ? '样本' : ''}检查 ${quantities.inspectedQuantity} 件，合格 ${body.qualifiedQuantity} 件，不合格 ${body.unqualifiedQuantity} 件，结论为“${PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS[decision]}”。${decision === 'released' ? '产线管理员仍须核对产出清单。' : '当前结论阻断结案。'}不合格不自动登记报废；保存后不可覆盖，复检另存记录。`,
        '保存成品质检记录',
        { confirmButtonText: '确认保存' },
      );
    } catch {
      return;
    }
    if (
      !visible.value ||
      batchId.value !== target ||
      detail.value.version !== body.version ||
      busy.value ||
      unresolved.value
    )
      return;
    pending = { batchId: target, body };
    await run();
  }
  async function close(): Promise<boolean> {
    if (submitting.value) return false;
    const extraDraft = extraDraftMessage();
    if (unresolved.value || inspectionOpen.value || extraDraft) {
      try {
        await RouteMessageBox.confirm(
          unresolved.value
            ? '提交结果尚未确认，请先核对检验历史。关闭会放弃本地重试标识，确认关闭？'
            : inspectionOpen.value
              ? '存在未保存的检验填写，确认放弃本地输入并关闭？当前检验轮保持办理中；如已发起复检，剩余入库仍暂停。'
              : (extraDraft ?? ''),
          '关闭成品质检',
          { type: 'warning' },
        );
      } catch {
        return false;
      }
    }
    read.invalidate();
    historyRead.invalidate();
    intent.reset();
    startIntent.reset();
    reinspectionIntent.reset();
    pending = null;
    pendingStart = null;
    pendingReinspection = null;
    unresolved.value = false;
    inspectionOpen.value = false;
    visible.value = false;
    return true;
  }
  async function changePage(value: number) {
    page.value = value;
    await loadRecords();
  }
  const tabs = useTabsStore();
  onScopeDispose(tabs.registerCloseGuard('quality-finished-inspections', close));
  async function changePageSize(value: number) {
    pageSize.value = value;
    page.value = 1;
    await loadRecords();
  }
  onActivated(() => {
    if (visible.value && !submitting.value) void refresh();
  });
  return {
    visible,
    detail,
    loading,
    submitting,
    unresolved,
    error,
    records,
    total,
    page,
    pageSize,
    recordsLoading,
    recordsError,
    focusedRecordId,
    inspection,
    inspectionOpen,
    inspectionVersion,
    inspectionBaseline,
    inspectionDeclared,
    busy,
    locked,
    inspectionStale,
    inspectionValid,
    open,
    close,
    refresh,
    loadRecords,
    focusRecord,
    startInspection,
    beginReinspection,
    changeInspection,
    discardInspection,
    recordInspection,
    retry: async () =>
      pendingReinspection ? runReinspection() : pendingStart ? runStart() : run(),
    changePage,
    changePageSize,
  };
}
