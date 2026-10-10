import { computed, ref, watch, type Ref } from 'vue';
import type {
  BatchStepExecutionRecordItem,
  BatchStepReportView,
  ProductionExecutionRecordGroup,
} from '@company/contracts';
import { MAX_BATCH_STEP_REPORT_REVERSALS } from '@company/constants';
import { EMessage } from '../../../utils/message';
import type { SelectedProductionReport } from '../production-report-selection';

/** 明确持有同任务的选中记录，分页与工序切换不隐含增选或移除。 */
export const useProductionReportSelection = (selectedBatchId: Ref<string | null>) => {
  const selectedReports = ref<SelectedProductionReport[]>([]);
  const selectionVisible = ref(false),
    bulkVisible = ref(false),
    bulkLocked = ref(false);
  const selectedReportIds = computed(() => selectedReports.value.map((item) => item.reportId));
  watch(
    selectedBatchId,
    () => {
      selectedReports.value = [];
      selectionVisible.value = false;
      bulkVisible.value = false;
    },
    { flush: 'sync' },
  );
  const clearSelection = (): void => {
    if (!bulkLocked.value) selectedReports.value = [];
  };
  const removeSelection = (id: string): void => {
    if (!bulkLocked.value)
      selectedReports.value = selectedReports.value.filter((item) => item.reportId !== id);
  };
  const selectReport = (
    step: BatchStepExecutionRecordItem,
    report: BatchStepReportView,
    selected: boolean,
  ): void => {
    if (bulkLocked.value) return;
    if (!selected) {
      removeSelection(report.reportId);
      return;
    }
    if (report.sourceKind !== 'direct_normal' || !report.isEffective || !report.canReverse) return;
    if (selectedReportIds.value.includes(report.reportId)) return;
    if (selectedReports.value.length >= MAX_BATCH_STEP_REPORT_REVERSALS) {
      EMessage.warning(`每次最多选择 ${MAX_BATCH_STEP_REPORT_REVERSALS} 条记录`);
      return;
    }
    selectedReports.value = [
      ...selectedReports.value,
      {
        reportId: report.reportId,
        stepRecordId: step.stepRecordId,
        version: step.version,
        stepOrder: step.stepOrder,
        stepName: step.stepName,
        report: { ...report },
      },
    ];
  };
  const updateSelectionVersions = (record: ProductionExecutionRecordGroup): void => {
    if (bulkLocked.value) return;
    selectedReports.value = selectedReports.value.map((selection) => {
      const step = record.steps.find((item) => item.stepRecordId === selection.stepRecordId);
      return step ? { ...selection, version: step.version } : selection;
    });
  };
  return {
    selectedReports,
    selectedReportIds,
    selectionVisible,
    bulkVisible,
    bulkLocked,
    clearSelection,
    removeSelection,
    selectReport,
    updateSelectionVersions,
  };
};
