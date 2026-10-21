<template>
  <div
    class="step-quantity-summary"
    :class="{ 'is-compact': compact }"
  >
    <span class="quota-unit">数量（{{ step.unit }}）</span>
    <div class="quota-values">
      <div class="quota-tile normal-value">
        <span>正常</span>
        <strong>{{ formatQuantity(step.effectiveNormalQuantity) }}</strong>
      </div>
      <div class="quota-tile scrapped-value">
        <span>已报废</span>
        <strong>{{ classificationQuantity(distribution.scrappedQuantity) }}</strong>
      </div>
      <div class="quota-tile processing-value">
        <span>处理中</span>
        <strong>{{ classificationQuantity(distribution.processingQuantity) }}</strong>
      </div>
      <div class="quota-tile available-value">
        <span>剩余可报</span>
        <strong>{{ formatQuantity(step.availableReportQuantity) }}</strong>
      </div>
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
  isStepQuotaDistributionReliable,
  stepReworkRecoveredQuantity,
} from '../production-step-quantity-presentation';
import ProductionQuotaBasis from './ProductionQuotaBasis.vue';

defineOptions({ name: 'ProductionStepQuantitySummary' });
const props = defineProps<{
  compact?: boolean;
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
}>();
const distribution = computed(() => props.step.quotaDistribution);
const displayable = computed(() => isStepQuotaDistributionReliable(props.step));
const classificationQuantity = (quantity: string | null): string =>
  displayable.value && quantity !== null ? formatQuantity(quantity) : '待核对';
</script>

<style scoped>
.step-quantity-summary {
  display: grid;
  gap: 8px;
  min-width: 0;
  container-type: inline-size;
}
.normal-source {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 14px;
}
.quota-values {
  display: grid;
  width: 100%;
  max-width: 640px;
  justify-self: start;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: 1fr;
  gap: 8px;
}
.normal-source > span {
  white-space: nowrap;
}
.quota-tile {
  display: flex;
  min-width: 0;
  min-height: 88px;
  box-sizing: border-box;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-left: 3px solid var(--quota-color);
  border-radius: 6px;
  background: var(--quota-background);
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.4;
}
.quota-tile strong {
  color: var(--quota-color);
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.normal-value {
  --quota-color: var(--el-color-primary);
  --quota-background: var(--el-color-primary-light-9);
}
.scrapped-value {
  --quota-color: var(--el-color-danger);
  --quota-background: var(--el-color-danger-light-9);
}
.processing-value {
  --quota-color: var(--el-color-warning);
  --quota-background: var(--el-color-warning-light-9);
}
.available-value {
  --quota-color: var(--el-text-color-secondary);
  --quota-background: var(--el-fill-color-light);
}
@container (max-width: 560px) {
  .quota-values {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.is-compact .quota-values {
  display: flex;
  flex-wrap: wrap;
  max-width: none;
  gap: 4px 14px;
}
.is-compact .quota-tile {
  min-height: 0;
  flex-direction: row;
  align-items: center;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  white-space: nowrap;
}
.is-compact .quota-tile::before {
  content: '';
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--quota-color);
}
.is-compact .quota-tile strong {
  color: var(--el-text-color-primary);
  font-size: 13px;
}
.normal-source {
  gap: 4px;
  color: var(--el-text-color-regular);
  font-size: 12px;
}
.quota-unit,
.terminated-quantity {
  color: var(--el-text-color-secondary);
}
.quota-unit,
.terminated-quantity,
.classification-unavailable {
  font-size: 12px;
  line-height: 1.6;
}
.classification-unavailable {
  color: var(--el-color-warning-dark-2);
}
</style>
