<template>
  <div class="step-quota-distribution">
    <span class="quota-unit">数量（{{ step.unit }}）</span>
    <div class="quota-values">
      <div class="quota-tile normal-value">
        <span>正常</span>
        <strong>{{ formatQuantity(step.effectiveNormalQuantity) }}</strong>
      </div>
      <button
        v-if="!displayable || Number(distribution.scrappedQuantity) > 0"
        type="button"
        class="quota-tile quota-value-action scrapped-value"
        :disabled="disabled"
        aria-label="查看报废明细"
        @click="$emit('view-scraps')"
      >
        <span>已报废</span>
        <strong>{{ classificationQuantity(distribution.scrappedQuantity) }}</strong>
        <span class="detail-action">查看明细</span>
      </button>
      <div
        v-else
        class="quota-tile scrapped-value"
      >
        <span>已报废</span>
        <strong>0</strong>
      </div>
      <button
        v-if="displayable && Number(distribution.processingQuantity) > 0"
        type="button"
        class="quota-tile quota-value-action processing-value"
        :disabled="disabled"
        :aria-expanded="processingExpanded"
        :aria-controls="`step-processing-${step.stepRecordId}`"
        @click="$emit('toggle-processing')"
      >
        <span>处理中</span>
        <strong>{{ classificationQuantity(distribution.processingQuantity) }}</strong>
        <span class="detail-action">{{ processingExpanded ? '收起明细' : '查看明细' }}</span>
      </button>
      <div
        v-else
        class="quota-tile processing-value"
      >
        <span>处理中</span>
        <strong>{{ classificationQuantity(distribution.processingQuantity) }}</strong>
        <span
          v-if="displayable"
          class="quiet-note"
          >无待处理异常</span
        >
      </div>
      <div class="quota-tile available-value">
        <span>剩余可报</span>
        <strong>{{ formatQuantity(step.availableReportQuantity) }}</strong>
      </div>
    </div>
    <ProductionQuotaBasis
      :quota="step"
      :planned-quantity="plannedQuantity"
      :show-reopen-hint="batchDoing"
    />
    <div
      v-if="displayable && Number(distribution.terminatedQuantity) > 0"
      class="quota-basis"
    >
      <button
        v-if="displayable && Number(distribution.terminatedQuantity) > 0"
        type="button"
        class="quota-value-action terminated-value"
        :disabled="disabled"
        :aria-expanded="processingExpanded"
        :aria-controls="`step-processing-${step.stepRecordId}`"
        @click="$emit('toggle-processing')"
      >
        <i
          class="terminated-swatch"
          aria-hidden="true"
        />已终止未恢复 {{ formatQuantity(distribution.terminatedQuantity) }} {{ step.unit
        }}<span class="detail-action">{{ processingExpanded ? '收起记录' : '查看记录' }}</span>
      </button>
    </div>
    <div
      v-if="!displayable"
      class="distribution-unavailable"
    >
      <span>{{
        distribution.unavailableReason || '额度分类尚待核对，请查看报工和异常处理记录。'
      }}</span>
      <button
        v-if="detailGroups.length"
        type="button"
        class="quota-value-action"
        :disabled="disabled"
        :aria-expanded="processingExpanded"
        @click="$emit('toggle-processing')"
      >
        {{ processingExpanded ? '收起相关记录' : '查看相关记录' }}
      </button>
    </div>
    <div
      v-show="processingExpanded"
      :id="`step-processing-${step.stepRecordId}`"
      class="processing-details"
    >
      <section
        v-for="group in detailGroups"
        :key="group.label"
        class="processing-detail-group"
      >
        <strong>{{ group.label }}</strong>
        <div
          v-for="item in group.items"
          :key="detailKey(item)"
          class="processing-detail-row"
        >
          <span>{{ 'reworkNo' in item ? item.reworkNo : item.dispositionNo }}</span>
          <span>{{ formatQuantity(item.quantity) }} {{ step.unit }}</span>
          <span v-if="'reworkNo' in item">处置 {{ item.dispositionNo }}</span>
          <el-button
            link
            type="primary"
            @click="$emit('view-report', item.sourceReport)"
            >来源 {{ item.sourceReport.reportNo }}</el-button
          >
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  BatchStepExecutionRecordItem,
  BatchStepReportReference,
  ProductionStepQuotaDispositionReference,
  ProductionStepQuotaReworkReference,
} from '@company/contracts';
import { REWORK_STATUS_LABELS } from '@company/constants';
import { formatQuantity } from '../production-status';
import { isStepQuotaDistributionReliable } from '../production-step-quantity-presentation';
import ProductionQuotaBasis from './ProductionQuotaBasis.vue';

const props = defineProps<{
  step: BatchStepExecutionRecordItem;
  plannedQuantity: string;
  batchDoing: boolean;
  processingExpanded: boolean;
  disabled: boolean;
}>();
defineEmits<{
  'view-scraps': [];
  'toggle-processing': [];
  'view-report': [report: BatchStepReportReference];
}>();
const distribution = computed(() => props.step.quotaDistribution);
const displayable = computed(() => isStepQuotaDistributionReliable(props.step));
const classificationQuantity = (quantity: string | null): string =>
  displayable.value && quantity !== null ? formatQuantity(quantity) : '待核对';
const detailGroups = computed(() =>
  [
    { label: '待审核', items: distribution.value.pendingDispositions },
    { label: REWORK_STATUS_LABELS.pending, items: distribution.value.pendingReworks },
    { label: REWORK_STATUS_LABELS.doing, items: distribution.value.doingReworks },
    { label: '已终止处置', items: distribution.value.terminatedDispositions },
    { label: '已取消返工', items: distribution.value.cancelledReworks },
  ].filter((group) => group.items.length),
);
const detailKey = (
  item: ProductionStepQuotaDispositionReference | ProductionStepQuotaReworkReference,
): string => ('reworkId' in item ? `rework:${item.reworkId}` : `disposition:${item.dispositionId}`);
</script>

<style scoped>
.step-quota-distribution {
  display: grid;
  flex: 0 0 100%;
  gap: 6px;
  min-width: 0;
  container-type: inline-size;
}
.quota-basis,
.processing-detail-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 16px;
}
.quota-value-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.quota-basis i {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 2px;
}
.quota-value-action {
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.quota-value-action:disabled {
  cursor: default;
  opacity: 0.6;
}
.quota-value-action:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 3px;
}
.detail-action {
  color: var(--el-color-primary);
  font-size: 12px;
}
.quota-value-action:hover .detail-action {
  text-decoration: underline;
}
.quiet-note,
.quota-unit {
  color: var(--el-text-color-secondary);
}
.quiet-note,
.quota-unit {
  font-size: 12px;
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
.terminated-swatch {
  background: var(--el-text-color-placeholder);
}
.quota-basis {
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.6;
}
.terminated-value {
  color: var(--el-text-color-secondary);
}
.distribution-unavailable {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  padding: 6px 10px;
  border-left: 3px solid var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning-dark-2);
  font-size: 12px;
  line-height: 1.6;
}
.processing-details {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-light);
}
.processing-detail-group {
  display: grid;
  gap: 5px;
  font-size: 12px;
}
.processing-detail-group > strong {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.processing-detail-row {
  gap: 4px 12px;
  color: var(--el-text-color-regular);
}
.processing-detail-row > span {
  white-space: nowrap;
}
</style>
