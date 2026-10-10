<template>
  <div class="step-report-progress">
    <div class="progress-caption">
      <span
        >已报 <strong>{{ formatQuantity(reportedQuantity) }}</strong
        >／上限 <strong>{{ formatQuantity(upperLimitQuantity) }}</strong> {{ unit }}</span
      >
      <span>{{ formatReportPercentage(reportedQuantity, upperLimitQuantity) }}</span>
    </div>
    <el-progress
      v-if="percentage !== null"
      :percentage="Math.min(100, Math.max(0, percentage))"
      :stroke-width="6"
      :show-text="false"
    />
    <div
      v-if="showComposition"
      class="quantity-caption"
    >
      直接正常 {{ formatQuantity(directNormalQuantity) }} · 直接异常
      {{ formatQuantity(directAbnormalQuantity) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatQuantity, formatReportPercentage, reportPercentage } from '../production-status';

const props = withDefaults(
  defineProps<{
    reportedQuantity: string;
    upperLimitQuantity: string;
    directNormalQuantity?: string;
    directAbnormalQuantity?: string;
    unit?: string;
    showComposition?: boolean;
  }>(),
  { unit: '', directNormalQuantity: '0', directAbnormalQuantity: '0', showComposition: true },
);
const percentage = computed(() =>
  reportPercentage(props.reportedQuantity, props.upperLimitQuantity),
);
</script>

<style scoped>
.step-report-progress {
  display: grid;
  gap: 7px;
  min-width: 200px;
}
.progress-caption {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--el-text-color-primary);
  font-size: 13px;
}
.quantity-caption {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
