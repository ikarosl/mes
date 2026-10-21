import { computed, ref, watch, type Ref } from 'vue';
import type { ProductionExecutionRecordGroup } from '@company/contracts';

/** 展开仅持有展示状态；首次访问后保留正文实例，不改变选择、草稿或写意图。 */
export const useProductionExecutionSections = (
  selectedBatchId: Ref<string | null>,
  record: Ref<ProductionExecutionRecordGroup | null>,
) => {
  const taskDetailsExpanded = ref(false);
  const completionDetailsExpanded = ref(false);
  const expandedStepIds = ref(new Set<string>());
  const visitedStepIds = ref(new Set<string>());
  const quantityCheckStepIds = ref(new Set<string>());
  const processingDetailStepIds = ref(new Set<string>());
  let initializedBatchId: string | null = null;
  const currentSteps = computed(() => {
    const current = record.value;
    return current?.productionBatchId === selectedBatchId.value ? current.steps : [];
  });

  const expandStep = (stepId: string): void => {
    expandedStepIds.value.add(stepId);
    visitedStepIds.value.add(stepId);
  };
  watch(
    selectedBatchId,
    () => {
      initializedBatchId = null;
      expandedStepIds.value = new Set();
      visitedStepIds.value = new Set();
      quantityCheckStepIds.value = new Set();
      processingDetailStepIds.value = new Set();
      taskDetailsExpanded.value = false;
      completionDetailsExpanded.value = false;
    },
    { flush: 'sync' },
  );
  watch(
    record,
    (next) => {
      if (
        !next ||
        next.productionBatchId !== selectedBatchId.value ||
        initializedBatchId === next.productionBatchId
      )
        return;
      initializedBatchId = next.productionBatchId;
      const first = next.steps.find((step) => step.status === 'doing') ?? next.steps[0];
      if (first) expandStep(first.stepRecordId);
    },
    { immediate: true, flush: 'sync' },
  );

  const isStepExpanded = (stepId: string): boolean => expandedStepIds.value.has(stepId);
  const hasVisitedStep = (stepId: string): boolean => visitedStepIds.value.has(stepId);
  const toggleStep = (stepId: string): void => {
    if (!record.value?.steps.some((step) => step.stepRecordId === stepId)) return;
    if (expandedStepIds.value.has(stepId)) expandedStepIds.value.delete(stepId);
    else expandStep(stepId);
  };
  const canExpandAllSteps = computed(() =>
    currentSteps.value.some((step) => !isStepExpanded(step.stepRecordId)),
  );
  const canCollapseAllSteps = computed(() =>
    currentSteps.value.some((step) => isStepExpanded(step.stepRecordId)),
  );
  const expandAllSteps = (): void => {
    for (const step of currentSteps.value) expandStep(step.stepRecordId);
  };
  const collapseAllSteps = (): void => {
    for (const step of currentSteps.value) expandedStepIds.value.delete(step.stepRecordId);
  };
  const toggleLocalSection = (stepId: string, expanded: Ref<Set<string>>): void => {
    if (!record.value?.steps.some((step) => step.stepRecordId === stepId)) return;
    if (expanded.value.has(stepId)) expanded.value.delete(stepId);
    else expanded.value.add(stepId);
  };
  return {
    taskDetailsExpanded,
    completionDetailsExpanded,
    isStepExpanded,
    hasVisitedStep,
    toggleStep,
    canExpandAllSteps,
    canCollapseAllSteps,
    expandAllSteps,
    collapseAllSteps,
    isQuantityCheckExpanded: (stepId: string): boolean => quantityCheckStepIds.value.has(stepId),
    toggleQuantityCheck: (stepId: string): void => toggleLocalSection(stepId, quantityCheckStepIds),
    isProcessingDetailExpanded: (stepId: string): boolean =>
      processingDetailStepIds.value.has(stepId),
    toggleProcessingDetail: (stepId: string): void =>
      toggleLocalSection(stepId, processingDetailStepIds),
  };
};
