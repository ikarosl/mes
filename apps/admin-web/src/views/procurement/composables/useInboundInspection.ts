import { computed, onDeactivated, onScopeDispose, ref, watch } from 'vue';
import { RequestError } from '@company/request';
import { normalizeJsonTable } from '@company/utils';
import { BUSINESS_TEMPLATE_STATUS } from '@company/constants';
import type {
  ProcurementReceiptLine,
  QualityIncomingInspectionReportItem,
  QualityIncomingInspectionReportSummary,
} from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import { businessTemplatesApi } from '../../../api/templates';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import {
  initialInboundInspection,
  correctionInboundInspection,
  inboundInspectionInput,
  getLastInboundInspectionTemplateId,
  type InboundInspectionDraft,
} from '../../quality/inbound-inspection';
import { useProcurementCommand } from './useProcurementCommand';

/** The source owns one current report; its draft and immutable history have separate lifetimes. */
export function useInboundInspection(onChanged: () => void) {
  const visible = ref(false),
    lineId = ref(''),
    line = ref<ProcurementReceiptLine | null>(null);
  const loading = ref(false),
    error = ref(''),
    activeTab = ref<'current' | 'history'>('current'),
    mode = ref<'view' | 'register' | 'revise'>('view');
  const form = ref(initialInboundInspection());
  let original = JSON.stringify(form.value);
  let needsInitialTemplate = false;
  let editorRevision = 0;
  let openingRevision = 0;
  let draftRevision = 0;
  let reportSelectionRevision = 0;
  watch(
    form,
    () => {
      draftRevision += 1;
      needsInitialTemplate = false;
    },
    { deep: true, flush: 'sync' },
  );
  const invalidateEditor = (): void => {
    editorRevision += 1;
  };
  onDeactivated(invalidateEditor);
  onScopeDispose(invalidateEditor);
  const editing = computed(() => mode.value !== 'view');
  const dirty = computed(() => editing.value && JSON.stringify(form.value) !== original);
  const records = ref<QualityIncomingInspectionReportSummary[]>([]),
    recordsLoading = ref(false),
    recordsError = ref('');
  const page = ref(1),
    pageSize = ref(10),
    total = ref(0),
    recordsLoaded = ref(false);
  const currentReportId = ref<string | null>(null),
    currentReport = ref<QualityIncomingInspectionReportItem | null>(null),
    currentReportLoading = ref(false),
    currentReportError = ref('');
  const selectedReport = ref<QualityIncomingInspectionReportItem | null>(null),
    reportLoading = ref(false),
    reportError = ref('');
  const focusedReportId = ref(''),
    checking = ref(false),
    templateLoading = ref(false);
  const { canAccessRoute } = useRouteAccess();
  const sourceRead = useLatestReadRequest(() => {
    loading.value = false;
  });
  const historyRead = useLatestReadRequest(() => {
    recordsLoading.value = false;
  });
  const currentRead = useLatestReadRequest(() => {
    currentReportLoading.value = false;
  });
  const reportRead = useLatestReadRequest(() => {
    reportLoading.value = false;
  });
  const templateRead = useLatestReadRequest(() => {
    templateLoading.value = false;
  });
  const command = useProcurementCommand<QualityIncomingInspectionReportItem>(async (result) => {
    if (!visible.value || result.receiptLineId !== lineId.value) return;
    reportRead.invalidate();
    historyRead.invalidate();
    currentRead.invalidate();
    reportSelectionRevision += 1;
    replaceDraft(initialInboundInspection());
    mode.value = 'view';
    selectedReport.value = result;
    focusedReportId.value = result.id;
    currentReportId.value = result.id;
    currentReport.value = result;
    currentReportError.value = '';
    reportError.value = '';
    activeTab.value = 'current';
    records.value = [];
    recordsLoaded.value = false;
    recordsError.value = '';
    page.value = 1;
    total.value = 0;
    onChanged();
    if (sourceRead.isActive()) {
      const selection = reportSelectionRevision;
      await loadRecords(true);
      if (
        visible.value &&
        result.receiptLineId === lineId.value &&
        sourceRead.isActive() &&
        reportSelectionRevision === selection
      )
        selectCurrentReport();
    }
  }, '进料检验报告');
  const locked = computed(() => command.locked.value || checking.value || templateLoading.value);
  const canRead = computed(
    () =>
      visible.value &&
      sourceRead.isActive() &&
      !command.busy.value &&
      !checking.value &&
      !templateLoading.value,
  );
  const recordsReady = computed(
    () => recordsLoaded.value && !recordsLoading.value && !recordsError.value,
  );
  const currentReportReady = computed(() => {
    if (!recordsReady.value || currentReportLoading.value || currentReportError.value) return false;
    if (!currentReportId.value) return total.value === 0;
    return (
      currentReport.value?.id === currentReportId.value &&
      currentReport.value.receiptLineId === lineId.value
    );
  });
  const draftConflict = computed(() => {
    if (!editing.value || !recordsReady.value) return '';
    if ((form.value.previousRecordId ?? null) === currentReportId.value) return '';
    if (mode.value === 'register')
      return '此到货物料已有当前报告，登记填写已保留；请核对当前报告后取消本次登记。';
    return '当前报告已变化，修订填写已保留；请取消本次修订，核对当前报告后重新修订。';
  });
  const sourceReady = computed(() =>
    Boolean(
      visible.value &&
      line.value?.id === lineId.value &&
      !line.value.void &&
      !loading.value &&
      !error.value &&
      sourceRead.isActive(),
    ),
  );
  const canRevise = computed(() =>
    Boolean(
      !editing.value &&
      sourceReady.value &&
      !locked.value &&
      currentReportReady.value &&
      currentReportId.value &&
      selectedReport.value?.id === currentReportId.value &&
      focusedReportId.value === currentReportId.value &&
      !reportLoading.value &&
      !reportError.value,
    ),
  );
  const canSave = computed(() =>
    Boolean(
      editing.value &&
      sourceReady.value &&
      !locked.value &&
      currentReportReady.value &&
      !draftConflict.value &&
      inboundInspectionInput(form.value),
    ),
  );
  function replaceDraft(draft: InboundInspectionDraft, applyPreference = false): void {
    templateRead.invalidate();
    form.value = draft;
    original = JSON.stringify(form.value);
    needsInitialTemplate = applyPreference;
  }
  async function applyLastTemplate(): Promise<void> {
    if (
      !needsInitialTemplate ||
      !visible.value ||
      mode.value !== 'register' ||
      activeTab.value !== 'current' ||
      !sourceReady.value ||
      !currentReportReady.value ||
      currentReportId.value ||
      dirty.value ||
      !templateRead.isActive()
    )
      return;
    needsInitialTemplate = false;
    const id = getLastInboundInspectionTemplateId();
    if (!id) return;
    const target = lineId.value,
      draft = form.value,
      revision = draftRevision,
      editor = editorRevision;
    const current = templateRead.begin(
      () =>
        visible.value &&
        editorRevision === editor &&
        lineId.value === target &&
        form.value === draft &&
        mode.value === 'register' &&
        !currentReportId.value &&
        activeTab.value === 'current',
    );
    templateLoading.value = true;
    try {
      if (!canAccessRoute({ name: 'system-templates' }))
        throw new Error('无法读取上次使用的检验模板：需系统模板查看权限。已保留默认检查记录。');
      const item = await businessTemplatesApi.detail(id, current.signal);
      if (!current.isCurrent() || draftRevision !== revision) return;
      if (item.id !== id) throw new Error('上次使用的检验模板与读取结果不匹配，请重新应用模板');
      if (item.status !== BUSINESS_TEMPLATE_STATUS.enabled)
        throw new Error('上次使用的检验模板已停用，已保留默认检查记录，请重新应用其他模板。');
      draft.inspectionDetails = normalizeJsonTable(item.content);
      original = JSON.stringify(draft);
    } catch (cause) {
      if (current.isCurrent() && draftRevision === revision)
        EMessage.error(cause, '上次使用的检验模板读取失败，请重新应用模板');
    } finally {
      if (current.isCurrent()) templateLoading.value = false;
    }
  }
  async function loadDetail(): Promise<ProcurementReceiptLine | null> {
    if (!visible.value || !lineId.value || !sourceRead.isActive()) return null;
    const target = lineId.value,
      revision = editorRevision;
    const current = sourceRead.begin(
      () => visible.value && lineId.value === target && editorRevision === revision,
    );
    loading.value = true;
    try {
      const result = await procurementApi.inspectionReceiptLine(target, current.signal);
      if (!current.isCurrent()) return null;
      if (result.id !== target) throw new Error('检验来源与到货明细不匹配');
      line.value = result;
      error.value = '';
      return result;
    } catch (cause) {
      if (current.isCurrent()) {
        error.value = '到货来源读取失败，当前输入已保留；请刷新后核对。';
        EMessage.error(cause, '检验来源读取失败');
      }
      return null;
    } finally {
      if (current.isCurrent()) loading.value = false;
    }
  }
  async function loadCurrentReport(force = false): Promise<boolean> {
    if (!visible.value || !recordsLoaded.value || !currentRead.isActive()) return false;
    const id = currentReportId.value;
    if (!id) {
      currentRead.invalidate();
      currentReport.value = null;
      currentReportError.value = '';
      return total.value === 0;
    }
    if (
      !force &&
      currentReport.value?.id === id &&
      !currentReportLoading.value &&
      !currentReportError.value
    )
      return true;
    const target = lineId.value,
      revision = editorRevision;
    const current = currentRead.begin(
      () =>
        visible.value &&
        lineId.value === target &&
        editorRevision === revision &&
        currentReportId.value === id,
    );
    currentReportLoading.value = true;
    try {
      const result = await procurementApi.getInspection(id, current.signal);
      if (!current.isCurrent()) return false;
      if (result.id !== id || result.receiptLineId !== target)
        throw new Error('当前报告已变化或与到货物料不匹配，请刷新核对');
      currentReport.value = result;
      currentReportError.value = '';
      if (focusedReportId.value === id) {
        selectedReport.value = result;
        reportError.value = '';
      }
      return true;
    } catch (cause) {
      if (current.isCurrent()) {
        currentReportError.value = '当前报告读取失败，不能登记或修订；请刷新后核对。';
        EMessage.error(cause, '当前检验报告读取失败');
      }
      return false;
    } finally {
      if (current.isCurrent()) currentReportLoading.value = false;
    }
  }
  async function loadRecords(verifyCurrent = false): Promise<boolean> {
    if (!visible.value || !lineId.value || !historyRead.isActive()) return false;
    const target = lineId.value,
      requestedPage = page.value,
      requestedSize = pageSize.value,
      revision = editorRevision;
    const current = historyRead.begin(
      () =>
        visible.value &&
        lineId.value === target &&
        page.value === requestedPage &&
        pageSize.value === requestedSize &&
        editorRevision === revision,
    );
    recordsLoading.value = true;
    recordsLoaded.value = false;
    records.value = [];
    total.value = 0;
    try {
      const result = await procurementApi.inspectionReports(
        target,
        { page: requestedPage, pageSize: requestedSize },
        current.signal,
      );
      if (!current.isCurrent()) return false;
      if (
        result.page !== requestedPage ||
        result.pageSize !== requestedSize ||
        !Number.isSafeInteger(result.total) ||
        result.total < 0 ||
        (result.currentReportId !== null &&
          (typeof result.currentReportId !== 'string' || !result.currentReportId)) ||
        (result.total === 0) !== (result.currentReportId === null) ||
        result.items.some((record) => record.receiptLineId !== target) ||
        new Set(result.items.map((record) => record.id)).size !== result.items.length ||
        result.items.length > requestedSize ||
        result.items.length > result.total
      )
        throw new Error('检验报告目录不完整或与到货物料不匹配，请刷新核对');
      if (currentReportId.value !== result.currentReportId) {
        currentRead.invalidate();
        currentReport.value = null;
        currentReportError.value = '';
      }
      records.value = result.items;
      total.value = result.total;
      currentReportId.value = result.currentReportId;
      recordsLoaded.value = true;
      recordsError.value = '';
      const verified = await loadCurrentReport(verifyCurrent);
      return current.isCurrent() && verified;
    } catch (cause) {
      if (current.isCurrent()) {
        recordsError.value = '检验报告目录读取失败，不能登记或修订；请刷新重试。';
        EMessage.error(cause, '检验报告目录读取失败');
      }
      return false;
    } finally {
      if (current.isCurrent()) recordsLoading.value = false;
    }
  }
  async function showReport(id: string): Promise<QualityIncomingInspectionReportItem | null> {
    if (!visible.value || !reportRead.isActive() || !id) return null;
    reportSelectionRevision += 1;
    const target = lineId.value,
      revision = editorRevision;
    if (focusedReportId.value !== id) selectedReport.value = null;
    focusedReportId.value = id;
    const current = reportRead.begin(
      () =>
        visible.value &&
        focusedReportId.value === id &&
        lineId.value === target &&
        editorRevision === revision,
    );
    reportLoading.value = true;
    try {
      const result = await procurementApi.getInspection(id, current.signal);
      if (!current.isCurrent()) return null;
      if (result.id !== id || (target && result.receiptLineId !== target))
        throw new Error('报告不属于当前到货物料，请核对来源');
      selectedReport.value = result;
      reportError.value = '';
      return result;
    } catch (cause) {
      if (current.isCurrent()) {
        reportError.value = '指定报告读取失败，请重新读取；不会替换为其他报告。';
        EMessage.error(cause, '进料检验报告读取失败');
      }
      return null;
    } finally {
      if (current.isCurrent()) reportLoading.value = false;
    }
  }
  function selectCurrentReport(): void {
    if (!currentReportReady.value || !currentReport.value) return;
    reportSelectionRevision += 1;
    reportRead.invalidate();
    selectedReport.value = currentReport.value;
    focusedReportId.value = currentReport.value.id;
    reportError.value = '';
  }
  async function viewCurrentReport(): Promise<void> {
    if (!canRead.value) return;
    const selection = reportSelectionRevision;
    if (!(await loadRecords(true)) || reportSelectionRevision !== selection) return;
    selectCurrentReport();
    activeTab.value = editing.value ? 'history' : 'current';
  }
  function captureDraft(): () => boolean {
    const target = lineId.value,
      draft = form.value,
      editor = editorRevision,
      revision = draftRevision,
      draftMode = mode.value;
    return () =>
      visible.value &&
      sourceRead.isActive() &&
      editorRevision === editor &&
      lineId.value === target &&
      form.value === draft &&
      mode.value === draftMode &&
      draftRevision === revision;
  }
  async function reviseCurrentReport(): Promise<void> {
    if (!canRevise.value) return;
    const isCurrent = captureDraft(),
      id = currentReportId.value,
      selection = reportSelectionRevision;
    checking.value = true;
    try {
      if (
        !(await loadDetail()) ||
        !(await loadRecords(true)) ||
        !isCurrent() ||
        reportSelectionRevision !== selection
      )
        return;
      if (currentReportId.value !== id || !currentReport.value || !sourceReady.value) {
        EMessage.warning('当前报告或到货已变化，请先核对当前报告后修订');
        return;
      }
      replaceDraft(correctionInboundInspection(currentReport.value));
      mode.value = 'revise';
      activeTab.value = 'current';
    } finally {
      checking.value = false;
    }
  }
  async function cancelEditing(): Promise<void> {
    if (!editing.value || locked.value) return;
    if (mode.value === 'register') {
      await close();
      return;
    }
    const isCurrent = captureDraft();
    if (dirty.value) {
      try {
        await RouteMessageBox.confirm('本次修订尚未保存，确定放弃修订吗？', '取消修订', {
          type: 'warning',
          confirmButtonText: '放弃修订',
        });
      } catch {
        return;
      }
    }
    if (!isCurrent() || locked.value) return;
    replaceDraft(initialInboundInspection());
    mode.value = 'view';
    activeTab.value = 'current';
    reportRead.invalidate();
    reportSelectionRevision += 1;
    focusedReportId.value = currentReportId.value ?? '';
    selectedReport.value = currentReport.value;
    reportError.value = '';
    const selection = reportSelectionRevision;
    checking.value = true;
    try {
      if ((await loadRecords(true)) && reportSelectionRevision === selection) selectCurrentReport();
    } finally {
      checking.value = false;
    }
  }
  async function save(): Promise<void> {
    if (!canSave.value) return;
    const body = inboundInspectionInput(form.value),
      target = lineId.value,
      isCurrent = captureDraft();
    if (!body) return;
    checking.value = true;
    try {
      if (
        !(await loadDetail()) ||
        !(await loadRecords(true)) ||
        !isCurrent() ||
        !sourceReady.value ||
        !currentReportReady.value
      )
        return;
      if ((body.previousRecordId ?? null) !== currentReportId.value) {
        EMessage.warning('当前报告已变化，填写已保留；请核对当前报告后重新修订');
        return;
      }
      await command.run(
        {
          intentType: 'quality.incoming-report.record',
          params: { receiptLineId: target },
          query: {},
          body,
        },
        async (key) => {
          const record = await procurementApi.inspectReceipt(target, body, key);
          let detailsMatch = false;
          try {
            detailsMatch =
              JSON.stringify(normalizeJsonTable(record?.inspectionDetails)) ===
              JSON.stringify(body.inspectionDetails);
          } catch {
            // 不完整的成功响应仍按结果未知处理，保留原键和完整请求。
          }
          if (
            !record ||
            record.receiptLineId !== target ||
            !record.id ||
            !record.reportNo ||
            !detailsMatch ||
            record.inspectionMethod !== body.inspectionMethod ||
            Number(record.qualifiedQuantity) !== body.qualifiedQuantity ||
            Number(record.unqualifiedQuantity) !== body.unqualifiedQuantity ||
            record.previousRecordId !== (body.previousRecordId ?? null) ||
            record.correctionReason !== (body.correctionReason ?? null) ||
            Date.parse(record.inspectedAt) !== Date.parse(body.inspectedAt) ||
            record.expiresOn !== (body.expiresOn ?? null) ||
            record.remark !== (body.remark ?? null) ||
            record.evidence !== (body.evidence ?? null)
          )
            throw new RequestError('检验报告保存结果不完整，请核对报告后重试本次提交', 502);
          return record;
        },
        body.previousRecordId ? '修订报告已保存，历史版本已保留' : '进料检验报告已登记',
      );
    } catch (cause) {
      EMessage.error(cause, '检验报告核对失败，当前填写已保留');
    } finally {
      checking.value = false;
    }
  }
  async function beginRegistration(): Promise<void> {
    if (
      mode.value !== 'view' ||
      focusedReportId.value ||
      !sourceReady.value ||
      !currentReportReady.value ||
      currentReportId.value
    )
      return;
    replaceDraft(initialInboundInspection(), true);
    mode.value = 'register';
    activeTab.value = 'current';
    await applyLastTemplate();
  }
  async function open(id: string, reportId = ''): Promise<boolean> {
    const opening = ++openingRevision;
    if (!sourceRead.isActive()) return false;
    if (visible.value) {
      const closed = await close();
      if (opening !== openingRevision || (!closed && visible.value)) return false;
    }
    if (!sourceRead.isActive() || opening !== openingRevision) return false;
    const revision = ++editorRevision;
    const isCurrent = (): boolean =>
      visible.value && editorRevision === revision && sourceRead.isActive();
    lineId.value = id;
    line.value = null;
    error.value = '';
    records.value = [];
    recordsLoaded.value = false;
    recordsError.value = '';
    currentReportId.value = null;
    currentReport.value = null;
    currentReportError.value = '';
    selectedReport.value = null;
    reportError.value = '';
    focusedReportId.value = '';
    page.value = 1;
    total.value = 0;
    replaceDraft(initialInboundInspection());
    mode.value = 'view';
    activeTab.value = 'current';
    visible.value = true;
    if (reportId) {
      const loadedReport = await showReport(reportId);
      if (!loadedReport || !isCurrent()) return false;
      lineId.value = loadedReport.receiptLineId;
    }
    if (!(await loadDetail()) || !isCurrent()) return false;
    if (!(await loadRecords(true)) || !isCurrent()) return false;
    if (!reportId) {
      if (currentReportId.value) selectCurrentReport();
      else await beginRegistration();
    }
    return isCurrent();
  }
  async function close(): Promise<boolean> {
    const revision = editorRevision,
      draft = form.value,
      input = JSON.stringify(draft);
    if (checking.value || !(await command.canClose(dirty.value))) return false;
    if (
      editorRevision !== revision ||
      form.value !== draft ||
      (JSON.stringify(draft) !== input && dirty.value)
    )
      return false;
    invalidateEditor();
    visible.value = false;
    sourceRead.invalidate();
    historyRead.invalidate();
    currentRead.invalidate();
    reportRead.invalidate();
    templateRead.invalidate();
    return true;
  }
  async function refresh(): Promise<void> {
    if (!canRead.value) return;
    const revision = editorRevision,
      previousHead = currentReportId.value,
      focused = focusedReportId.value,
      selection = reportSelectionRevision,
      currentMode = mode.value,
      wasViewingCurrent = mode.value === 'view' && focused && focused === previousHead;
    if (!lineId.value && focused) {
      const report = await showReport(focused);
      if (!report || !visible.value || editorRevision !== revision) return;
      lineId.value = report.receiptLineId;
    }
    const source = await loadDetail();
    if (!visible.value || editorRevision !== revision || !sourceRead.isActive()) return;
    if (!(await loadRecords(true))) return;
    if (!visible.value || editorRevision !== revision || !sourceRead.isActive()) return;
    // A user selection made while refreshing takes precedence over this read's original focus.
    if (reportSelectionRevision !== selection || mode.value !== currentMode) return;
    if (wasViewingCurrent || (!focused && mode.value === 'view' && currentReportId.value))
      selectCurrentReport();
    else if (focused) await showReport(focused);
    if (!visible.value || editorRevision !== revision || !sourceRead.isActive()) return;
    if (source && !focusedReportId.value && mode.value === 'view') await beginRegistration();
    if (mode.value === 'register' && activeTab.value === 'current') await applyLastTemplate();
  }
  async function changePage(value: number): Promise<void> {
    if (!canRead.value || value === page.value) return;
    records.value = [];
    recordsLoaded.value = false;
    total.value = 0;
    page.value = value;
    await loadRecords();
  }
  async function changePageSize(value: number): Promise<void> {
    if (!canRead.value || value === pageSize.value) return;
    records.value = [];
    recordsLoaded.value = false;
    total.value = 0;
    pageSize.value = value;
    page.value = 1;
    await loadRecords();
  }
  watch(
    activeTab,
    (tab) => {
      if (tab !== 'current') templateRead.invalidate();
    },
    { flush: 'sync' },
  );
  return {
    visible,
    lineId,
    line,
    loading,
    error,
    activeTab,
    mode,
    editing,
    form,
    dirty,
    draftConflict,
    records,
    recordsLoading,
    recordsLoaded,
    recordsError,
    page,
    pageSize,
    total,
    currentReportId,
    currentReportLoading,
    currentReportError,
    selectedReport,
    reportLoading,
    reportError,
    focusedReportId,
    command,
    locked,
    checking,
    templateLoading,
    canRead,
    canRevise,
    canSave,
    open,
    close,
    refresh,
    loadRecords,
    showReport,
    viewCurrentReport,
    reviseCurrentReport,
    cancelEditing,
    save,
    changePage,
    changePageSize,
  };
}
