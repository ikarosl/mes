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
} from '../../quality/inbound-inspection';
import { useProcurementCommand } from './useProcurementCommand';

/** Each arrival material owns its draft and immutable report history independently of warehouse entry. */
export function useInboundInspection(onChanged: () => void) {
  const visible = ref(false),
    lineId = ref(''),
    line = ref<ProcurementReceiptLine | null>(null);
  const loading = ref(false),
    error = ref(''),
    activeTab = ref<'current' | 'history'>('current');
  const form = ref(initialInboundInspection());
  let original = JSON.stringify(form.value);
  let needsInitialTemplate = true;
  let editorRevision = 0;
  let openingRevision = 0;
  let draftRevision = 0;
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
  const dirty = computed(() => JSON.stringify(form.value) !== original);
  const records = ref<QualityIncomingInspectionReportSummary[]>([]),
    recordsLoading = ref(false),
    recordsError = ref('');
  const page = ref(1),
    pageSize = ref(10),
    total = ref(0),
    recordsLoaded = ref(false);
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
  const reportRead = useLatestReadRequest(() => {
    reportLoading.value = false;
  });
  const templateRead = useLatestReadRequest(() => {
    templateLoading.value = false;
  });
  const command = useProcurementCommand<QualityIncomingInspectionReportItem>(async (result) => {
    if (!visible.value || result.receiptLineId !== lineId.value) return;
    resetForm();
    selectedReport.value = result;
    focusedReportId.value = result.id;
    reportError.value = '';
    activeTab.value = 'history';
    recordsLoaded.value = false;
    onChanged();
    await loadRecords();
  }, '进料检验报告');
  const locked = computed(() => command.locked.value || checking.value || templateLoading.value);
  const canSave = computed(() =>
    Boolean(
      line.value &&
      !line.value.void &&
      !loading.value &&
      !error.value &&
      !locked.value &&
      sourceRead.isActive() &&
      inboundInspectionInput(form.value),
    ),
  );
  function resetForm(): void {
    templateRead.invalidate();
    form.value = initialInboundInspection();
    original = JSON.stringify(form.value);
    needsInitialTemplate = true;
  }
  async function applyLastTemplate(): Promise<void> {
    if (
      !needsInitialTemplate ||
      !visible.value ||
      activeTab.value !== 'current' ||
      loading.value ||
      error.value ||
      !line.value ||
      line.value.id !== lineId.value ||
      line.value.void ||
      dirty.value ||
      form.value.previousRecordId ||
      !templateRead.isActive()
    )
      return;
    needsInitialTemplate = false;
    const id = getLastInboundInspectionTemplateId();
    if (!id) return;
    const target = lineId.value,
      draft = form.value,
      revision = draftRevision;
    const current = templateRead.begin(
      () =>
        visible.value &&
        lineId.value === target &&
        form.value === draft &&
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
    const target = lineId.value;
    const current = sourceRead.begin(() => visible.value && lineId.value === target);
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
  async function loadRecords(): Promise<void> {
    if (!visible.value || !lineId.value || !historyRead.isActive()) return;
    const target = lineId.value,
      requestedPage = page.value;
    const current = historyRead.begin(
      () => visible.value && lineId.value === target && page.value === requestedPage,
    );
    recordsLoading.value = true;
    try {
      const result = await procurementApi.inspectionReports(
        target,
        { page: requestedPage, pageSize: pageSize.value },
        current.signal,
      );
      if (current.isCurrent()) {
        records.value = result.items;
        total.value = result.total;
        recordsLoaded.value = true;
        recordsError.value = '';
      }
    } catch (cause) {
      if (current.isCurrent()) {
        recordsError.value = '检验报告目录读取失败，请重试；旧内容仅供核对。';
        EMessage.error(cause, '检验报告目录读取失败');
      }
    } finally {
      if (current.isCurrent()) recordsLoading.value = false;
    }
  }
  async function showReport(id: string): Promise<QualityIncomingInspectionReportItem | null> {
    if (!visible.value || !reportRead.isActive()) return null;
    const target = lineId.value;
    focusedReportId.value = id;
    const current = reportRead.begin(
      () => visible.value && focusedReportId.value === id && lineId.value === target,
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
  function captureDraft(): () => boolean {
    const target = lineId.value,
      draft = form.value,
      editor = editorRevision,
      revision = draftRevision;
    return () =>
      visible.value &&
      sourceRead.isActive() &&
      editorRevision === editor &&
      lineId.value === target &&
      form.value === draft &&
      draftRevision === revision;
  }
  async function mayReplaceDraft(isCurrent: () => boolean): Promise<boolean> {
    if (locked.value || loading.value || !line.value || error.value || !isCurrent()) return false;
    if (!dirty.value) return true;
    try {
      await RouteMessageBox.confirm(
        '当前报告填写尚未保存，确定放弃并重新填写吗？',
        '更换报告草稿',
        { type: 'warning', confirmButtonText: '放弃当前填写' },
      );
      return !locked.value && isCurrent();
    } catch {
      return false;
    }
  }
  async function newReport(): Promise<void> {
    const isCurrent = captureDraft();
    if (!(await mayReplaceDraft(isCurrent)) || !isCurrent() || line.value?.void) return;
    resetForm();
    activeTab.value = 'current';
    await applyLastTemplate();
  }
  async function correctReport(id: string): Promise<void> {
    const isCurrent = captureDraft();
    if (!(await mayReplaceDraft(isCurrent)) || !isCurrent()) return;
    const record = await showReport(id);
    if (!record || !isCurrent() || focusedReportId.value !== id) return;
    if (!record || record.id !== id || record.correctedByRecordId || line.value?.void) {
      EMessage.warning('该报告已更正或到货已作废，请查看最新记录');
      return;
    }
    templateRead.invalidate();
    form.value = correctionInboundInspection(record);
    original = JSON.stringify(form.value);
    needsInitialTemplate = false;
    activeTab.value = 'current';
  }
  async function save(): Promise<void> {
    if (!canSave.value) return;
    const body = inboundInspectionInput(form.value),
      target = lineId.value;
    if (!body) return;
    checking.value = true;
    try {
      if (
        !(await loadDetail()) ||
        !line.value ||
        line.value.void ||
        !visible.value ||
        target !== lineId.value ||
        !sourceRead.isActive()
      )
        return;
      if (body.previousRecordId) {
        const previous = await procurementApi.getInspection(body.previousRecordId);
        if (!visible.value || target !== lineId.value || !sourceRead.isActive()) return;
        if (previous.receiptLineId !== target || previous.correctedByRecordId) {
          EMessage.warning('原报告已被更正，填写已保留，请核对报告历史后重新选择');
          return;
        }
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
            Number(record.unqualifiedQuantity) !== body.unqualifiedQuantity
          )
            throw new RequestError('检验报告保存结果不完整，请核对历史后重试本次提交', 502);
          return record;
        },
        body.previousRecordId ? '更正报告已保存，原记录已保留' : '进料检验报告已保存',
      );
    } catch (cause) {
      EMessage.error(cause, '检验报告核对失败，当前填写已保留');
    } finally {
      checking.value = false;
    }
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
    selectedReport.value = null;
    reportError.value = '';
    focusedReportId.value = '';
    page.value = 1;
    total.value = 0;
    resetForm();
    activeTab.value = reportId ? 'history' : 'current';
    visible.value = true;
    if (reportId) {
      const loadedReport = await showReport(reportId);
      if (!loadedReport || !isCurrent()) return false;
      lineId.value = loadedReport.receiptLineId;
    }
    const source = await loadDetail();
    if (!source || !isCurrent()) return false;
    activeTab.value = reportId || source.void ? 'history' : 'current';
    if (activeTab.value === 'history') await loadRecords();
    else await applyLastTemplate();
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
    reportRead.invalidate();
    templateRead.invalidate();
    return true;
  }
  async function refresh(): Promise<void> {
    if (locked.value) return;
    const revision = editorRevision;
    const source = await loadDetail();
    if (!visible.value || editorRevision !== revision || !sourceRead.isActive()) return;
    if (source && activeTab.value === 'current') await applyLastTemplate();
    if (!visible.value || editorRevision !== revision || !sourceRead.isActive()) return;
    if (activeTab.value === 'history') await loadRecords();
    if (focusedReportId.value) await showReport(focusedReportId.value);
  }
  async function changePage(value: number): Promise<void> {
    page.value = value;
    await loadRecords();
  }
  async function changePageSize(value: number): Promise<void> {
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
  watch(activeTab, (tab) => {
    if (tab === 'current') void applyLastTemplate();
    if (visible.value && tab === 'history' && !recordsLoaded.value) void loadRecords();
  });
  return {
    visible,
    lineId,
    line,
    loading,
    error,
    activeTab,
    form,
    dirty,
    records,
    recordsLoading,
    recordsError,
    page,
    pageSize,
    total,
    selectedReport,
    reportLoading,
    reportError,
    focusedReportId,
    command,
    locked,
    checking,
    templateLoading,
    canSave,
    open,
    close,
    refresh,
    loadRecords,
    showReport,
    newReport,
    correctReport,
    save,
    changePage,
    changePageSize,
  };
}
