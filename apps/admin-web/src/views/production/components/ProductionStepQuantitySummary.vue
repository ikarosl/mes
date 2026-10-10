<template>
  <div class="step-quantity-summary">
    <div class="quota-values">
      <span
        ><i
          v-if="showDistribution"
          class="normal-swatch"
          aria-hidden="true"
        />正常 <strong>{{ formatQuantity(step.effectiveNormalQuantity) }}</strong>
        {{ step.unit }}</span
      >
      <span
        ><i
          v-if="showDistribution"
          class="scrapped-swatch"
          aria-hidden="true"
        />已报废 <strong>{{ classificationQuantity(distribution.scrappedQuantity) }}</strong>
        {{ step.unit }}</span
      >
      <span
        :class="{ 'no-processing': displayable && Number(distribution.processingQuantity) === 0 }"
        ><i
          v-if="showDistribution"
          class="processing-swatch"
          aria-hidden="true"
        />处理中 <strong>{{ classificationQuantity(distribution.processingQuantity) }}</strong>
        {{ step.unit }}</span
      >
      <span
        ><i
          v-if="showDistribution"
          class="available-swatch"
          aria-hidden="true"
        />剩余额度 <strong>{{ formatQuantity(step.availableReportQuantity) }}</strong>
        {{ step.unit }}</span
      >
    </div>
    <div
      v-if="showDistribution && segments?.length"
      class="distribution-bar"
      role="img"
      :aria-label="
        segments.map((segment) => `${segment.label} ${segment.quantity} ${step.unit}`).join('，')
      "
    >
      <span
        v-for="segment in segments"
        :key="segment.key"
        :class="`distribution-segment ${segment.key}-swatch`"
        :style="{ width: segment.width }"
        :title="`${segment.label} ${segment.quantity} ${step.unit}`"
      />
    </div>
    <div class="normal-source">
      <span>正常来源：直接正常 {{ formatQuantity(step.effectiveDirectNormalQuantity) }}</span>
      <span
        >＋ {{ BATCH_STEP_REWORK_RESULT_LABELS.normal }}
        {{ formatQuantity(stepReworkRecoveredQuantity(step)) }} {{ step.unit }}</span
      >
    </div>
    <ProductionQuotaBasis
      :quota="step"
      :planned-quantity="plannedQuantity"
      :show-reopen-hint="showReopenHint"
    />
    <div
      v-if="displayable && Number(distribution.terminatedQuantity) > 0"
      class="terminated-quantity"
    >
      已终止未恢复 {{ formatQuantity(distribution.terminatedQuantity) }} {{ step.unit }}
    </div>
    <div
      v-if="!displayable"
      class="classification-unavailable"
      role="status"
    >
      {{ distribution.unavailableReason || '额度分类尚待核对，请在工序记录中查看处理情况。' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { BATCH_STEP_REWORK_RESULT_LABELS } from '@company/constants';
import type { ProductionWorkerTaskItem } from '@company/contracts';
import { formatQuantity } from '../production-status';
import {
  stepQuotaDistributionSegments,
  stepReworkRecoveredQuantity,
} from '../production-step-quantity-presentation';
import ProductionQuotaBasis from './ProductionQuotaBasis.vue';

defineOptions({ name: 'ProductionStepQuantitySummary' });
const props = withDefaults(
  defineProps<{
    step: Pick<
      ProductionWorkerTaskItem,
      | 'status'
      | 'unit'
      | 'effectiveNormalQuantity'
      | 'effectiveDirectNormalQuantity'
      | 'availableReportQuantity'
      | 'upperLimitQuantity'
      | 'activatedSupplementInputQuantity'
      | 'pendingSupplementInputQuantity'
      | 'quotaDistribution'
    >;
    plannedQuantity: string;
    showReopenHint: boolean;
    showDistribution?: boolean;
  }>(),
  { showDistribution: false },
);
const distribution = computed(() => props.step.quotaDistribution);
const segments = computed(() => stepQuotaDistributionSegments(props.step));
const displayable = computed(() => segments.value !== null);
const classificationQuantity = (quantity: string | null): string =>
  displayable.value && quantity !== null ? formatQuantity(quantity) : '待核对';
</script>

<style scoped>
.step-quantity-summary {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.quota-values,
.normal-source {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 14px;
}
.quota-values {
  color: var(--el-text-color-primary);
  font-size: 13px;
}
.quota-values > span,
.normal-source > span {
  white-space: nowrap;
}
.quota-values strong {
  font-size: 15px;
  font-weight: 600;
}
.quota-values i {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 5px;
  border-radius: 2px;
}
.distribution-bar {
  display: flex;
  height: 8px;
  overflow: hidden;
  border-radius: 4px;
  background: var(--el-fill-color-light);
}
.distribution-segment {
  flex: 0 0 auto;
}
.normal-swatch {
  background: var(--el-color-primary);
}
.scrapped-swatch {
  background: var(--el-color-danger);
}
.processing-swatch {
  background: var(--el-color-warning);
}
.available-swatch {
  background: var(--el-fill-color-darker);
}
.terminated-swatch {
  background: var(--el-text-color-placeholder);
}
.normal-source {
  gap: 4px;
  color: var(--el-text-color-regular);
  font-size: 12px;
}
.no-processing,
.terminated-quantity {
  color: var(--el-text-color-secondary);
}
.terminated-quantity,
.classification-unavailable {
  font-size: 12px;
  line-height: 1.6;
}
.classification-unavailable {
  color: var(--el-color-warning-dark-2);
}
</style>
