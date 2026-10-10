<template>
  <el-dialog
    :model-value="modelValue"
    title="核对报工历史"
    :width="DialogWidth.workbench"
    workbench
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <InlineHint>
      原提交内容继续保留。请按报工单号、冲销关系和替代关系核对结果；查看记录不会重新提交或放弃原请求。
    </InlineHint>
    <p class="selected-count">本次核对 {{ reportIds.length }} 条原报工。</p>
    <el-tabs v-model="activeStepId">
      <el-tab-pane
        v-for="step in steps"
        :key="step.stepRecordId"
        :name="step.stepRecordId"
        :label="`${step.stepOrder}. ${step.stepName}`"
      />
    </el-tabs>
    <ProductionStepReportTable
      v-if="modelValue && activeStep"
      :batch-id="activeStep.productionBatchId"
      :step-record-id="activeStep.stepRecordId"
      :version="activeStep.version"
      :show-actions="false"
      :active="modelValue"
      @view-detail="reportTrace.open"
      @view-report="reportTrace.open"
      @view-process="reportTrace.open"
    />
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">返回原请求</el-button>
    </template>
  </el-dialog>
  <ProductionReportTraceDialog :reader="reportTrace" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import InlineHint from '../../../components/InlineHint.vue';
import { DialogWidth } from '../../../utils/dialog';
import type { ProductionReportVerificationStep } from '../production-report-selection';
import ProductionStepReportTable from './ProductionStepReportTable.vue';
import ProductionReportTraceDialog from './ProductionReportTraceDialog.vue';
import { useProductionReportTrace } from '../composables/useProductionReportTrace';

const props = defineProps<{
  modelValue: boolean;
  steps: ProductionReportVerificationStep[];
  reportIds: string[];
}>();
defineEmits<{ 'update:modelValue': [open: boolean] }>();
const activeStepId = ref('');
const activeStep = computed(() =>
  props.steps.find((step) => step.stepRecordId === activeStepId.value),
);
const reportTrace = useProductionReportTrace({
  contextId: () =>
    activeStep.value
      ? `${activeStep.value.productionBatchId}:${activeStep.value.stepRecordId}`
      : null,
});
watch(
  () => props.modelValue,
  (open) => {
    if (!open) reportTrace.close();
  },
  { flush: 'sync' },
);
watch(
  [() => props.modelValue, () => props.steps],
  () => {
    if (!props.steps.some((step) => step.stepRecordId === activeStepId.value))
      activeStepId.value = props.steps[0]?.stepRecordId ?? '';
  },
  { immediate: true },
);
</script>

<style scoped>
.selected-count {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}
</style>
