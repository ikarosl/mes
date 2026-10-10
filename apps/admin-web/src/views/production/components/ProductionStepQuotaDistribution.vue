<template>
  <div class="step-quota-distribution">
    <div class="quota-values">
      <span class="quota-unit">数量（{{ step.unit }}）</span>
      <span
        ><i
          class="normal-swatch"
          aria-hidden="true"
        />正常 <strong>{{ formatQuantity(step.effectiveNormalQuantity) }}</strong></span
      >
      <button
        v-if="!displayable || Number(distribution.scrappedQuantity) > 0"
        type="button"
        class="quota-value-action"
        :disabled="disabled"
        aria-label="查看报废明细"
        @click="$emit('view-scraps')"
      >
        <i
          class="scrapped-swatch"
          aria-hidden="true"
        />已报废 <strong>{{ classificationQuantity(distribution.scrappedQuantity) }}</strong
        ><span class="detail-action">查看明细</span>
      </button>
      <span v-else
        ><i
          class="scrapped-swatch"
          aria-hidden="true"
        />已报废 <strong>0</strong></span
      >
      <button
        v-if="displayable && Number(distribution.processingQuantity) > 0"
        type="button"
        class="quota-value-action processing-value"
        :disabled="disabled"
        :aria-expanded="processingExpanded"
        :aria-controls="`step-processing-${step.stepRecordId}`"
        @click="$emit('toggle-processing')"
      >
        <i
          class="processing-swatch"
          aria-hidden="true"
        />处理中 <strong>{{ classificationQuantity(distribution.processingQuantity) }}</strong
        ><span class="detail-action">{{ processingExpanded ? '收起明细' : '查看明细' }}</span>
      </button>
      <span
        v-else
        :class="{ 'no-processing': displayable }"
        ><i
          class="processing-swatch"
          aria-hidden="true"
        />处理中 <strong>{{ classificationQuantity(distribution.processingQuantity) }}</strong
        ><span
          v-if="displayable"
          class="quiet-note"
          >无待处理异常</span
        ></span
      >
      <span
        ><i
          class="available-swatch"
          aria-hidden="true"
        />剩余额度 <strong>{{ formatQuantity(step.availableReportQuantity) }}</strong></span
      >
    </div>
    <div
      v-if="segments?.length"
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
import { stepQuotaDistributionSegments } from '../production-step-quantity-presentation';
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
const segments = computed(() => stepQuotaDistributionSegments(props.step));
const displayable = computed(() => segments.value !== null);
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
}
.quota-values,
.quota-basis,
.processing-detail-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 16px;
}
.quota-values {
  color: var(--el-text-color-primary);
  font-size: 13px;
}
.quota-values > span,
.quota-value-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.quota-values strong {
  font-size: 15px;
  font-weight: 600;
}
.quota-values i,
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
.no-processing,
.quiet-note,
.quota-unit {
  color: var(--el-text-color-secondary);
}
.quiet-note {
  font-size: 12px;
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
