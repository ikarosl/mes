import { computed, onActivated, onScopeDispose, reactive, ref } from 'vue';
import { RequestError } from '@company/request';
import { PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS } from '@company/constants';
import type {
  FinishedInspectionTaskDetail,
  ProductionOutputInspection,
  ProductionOutputQuantities,
  RecordFinishedInspectionPayload,
} from '@company/contracts';
import { finishedInspectionsApi } from '../../../api/finished-inspections';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useIdempotentIntent } from '../../../composables/idempotency/useIdempotentIntent';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { useTabsStore } from '../../../stores/tabs';
import {
  inspectionQuantities,
  inspectionFormQuantities,
  type ProductionOutputInspectionForm,
} from '../finished-inspection';

const emptyForm = (): ProductionOutputInspectionForm => ({
  inspectionMethod: 'full',
  coveredQuantity: undefined,
  qualifiedQuantity: undefined,
  unqualifiedQuantity: undefined,
  releaseDecision: 'pending_reinspection',
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
    record.releasedQuantity === quantities.releasedQuantity
  );
}

export function useFinishedInspection(changed: () => void) {
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
  const inspection = reactive(emptyForm()),
    inspectionOpen = ref(false),
    inspectionVersion = ref<number | null>(null);
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
  let pending: { batchId: string; body: RecordFinishedInspectionPayload } | null = null;
  const busy = computed(() => loading.value || submitting.value);
  const locked = computed(() => submitting.value || unresolved.value);
  const inspectionStale = computed(
    () => inspectionOpen.value && inspectionVersion.value !== detail.value?.version,
  );
  const inspectionValid = computed(
    () =>
      inspectionFormQuantities(inspection) !== null &&
      !!inspection.inspectedAt &&
      Number.isFinite(Date.parse(inspection.inspectedAt)) &&
      !!inspection.resultNote.trim() &&
      inspection.resultNote.length <= 5000 &&
      !!inspection.evidenceReference.trim() &&
      inspection.evidenceReference.length <= 5000,
  );

  async function loadRecords() {
    if (!visible.value || !historyRead.isActive()) return;
    const target = batchId.value,
      current = historyRead.begin(() => visible.value && batchId.value === target);
    recordsLoading.value = true;
    recordsError.value = '';
    try {
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
  async function open(target: string) {
    if (locked.value || visible.value) return false;
    batchId.value = target;
    visible.value = true;
    detail.value = null;
    records.value = [];
    page.value = 1;
    total.value = 0;
    inspectionOpen.value = false;
    inspectionVersion.value = null;
    await refresh();
    return true;
  }
  function startInspection() {
    if (
      !detail.value?.canRecordInspection ||
      !detail.value.declared ||
      busy.value ||
      unresolved.value ||
      error.value ||
      inspectionOpen.value
    )
      return;
    const declared = detail.value.declared;
    Object.assign(inspection, emptyForm(), {
      inspectedAt: new Date().toISOString(),
    });
    Object.assign(inspectionDeclared, declared);
    inspectionVersion.value = detail.value.version;
    inspectionOpen.value = true;
  }
  function changeInspection(changes: Partial<ProductionOutputInspectionForm>) {
    if (busy.value || unresolved.value || !inspectionOpen.value) return;
    if (changes.inspectionMethod && changes.inspectionMethod !== inspection.inspectionMethod) {
      Object.assign(inspection, {
        coveredQuantity: undefined,
        qualifiedQuantity: undefined,
        unqualifiedQuantity: undefined,
      });
    }
    Object.assign(inspection, changes);
    if (inspection.inspectionMethod === 'zero_confirmation') {
      Object.assign(inspection, {
        coveredQuantity: 0,
        qualifiedQuantity: 0,
        unqualifiedQuantity: 0,
        releaseDecision: 'released',
      });
      return;
    }
    if (
      changes.inspectionMethod !== undefined ||
      'coveredQuantity' in changes ||
      'qualifiedQuantity' in changes ||
      'unqualifiedQuantity' in changes
    )
      inspection.releaseDecision = 'pending_reinspection';
  }
  async function discardInspection() {
    if (locked.value) return;
    try {
      await RouteMessageBox.confirm('放弃本次尚未保存的检验填写？', '放弃填写', {
        type: 'warning',
      });
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
    if (!quantities) return;
    const target = batchId.value,
      body: RecordFinishedInspectionPayload = {
        version: detail.value.version,
        inspectionMethod: inspection.inspectionMethod,
        qualifiedQuantity: quantities.qualifiedQuantity,
        unqualifiedQuantity: quantities.unqualifiedQuantity,
        ...(inspection.inspectionMethod === 'sampling'
          ? { coveredQuantity: quantities.coveredQuantity }
          : {}),
        releaseDecision: inspection.releaseDecision,
        inspectedAt: new Date(inspection.inspectedAt).toISOString(),
        resultNote: inspection.resultNote.trim(),
        evidenceReference: inspection.evidenceReference.trim(),
      };
    const declaredTotal = inspectionDeclared.availableQuantity + inspectionDeclared.extraQuantity;
    const difference = quantities.coveredQuantity - declaredTotal;
    const differenceNote =
      difference === 0
        ? ''
        : `实际送检总数与当时申报 ${declaredTotal} 件相差 ${difference > 0 ? '+' : ''}${difference} 件，产线草稿保持原记录。`;
    try {
      await RouteMessageBox.confirm(
        `实际整批送检 ${quantities.coveredQuantity} 件，本次检查 ${quantities.inspectedQuantity} 件，合格 ${body.qualifiedQuantity} 件，不合格 ${body.unqualifiedQuantity} 件，结论为“${PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS[inspection.releaseDecision]}”。${inspection.releaseDecision === 'released' ? `本次建议量 ${quantities.releasedQuantity} 件，数量差异不限制产出定稿。` : '当前结论阻断结案。'}${differenceNote}不合格不自动登记报废；保存后不可覆盖，复检另存记录。`,
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
    if (unresolved.value || inspectionOpen.value) {
      try {
        await RouteMessageBox.confirm(
          unresolved.value
            ? '提交结果尚未确认，请先核对检验历史。关闭会放弃本地重试标识，确认关闭？'
            : '存在未保存的检验填写，确认放弃并关闭？',
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
    pending = null;
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
    inspection,
    inspectionOpen,
    inspectionVersion,
    inspectionDeclared,
    busy,
    locked,
    inspectionStale,
    inspectionValid,
    open,
    close,
    refresh,
    loadRecords,
    startInspection,
    changeInspection,
    discardInspection,
    recordInspection,
    retry: run,
    changePage,
    changePageSize,
  };
}
