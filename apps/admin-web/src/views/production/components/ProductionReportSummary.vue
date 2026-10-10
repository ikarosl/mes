<template>
  <div class="report-business-summary">
    <div class="report-identity">
      <strong>{{ task.batchNo }}</strong>
      <span>{{ task.stepOrder }}. {{ task.stepName }}</span>
    </div>
    <ProductionStepQuantitySummary
      :step="task"
      :planned-quantity="task.plannedQuantity"
      :show-reopen-hint="!historical"
    />
  </div>
</template>

<script setup lang="ts">
import type { ProductionReportContext } from '../production-report-selection';
import ProductionStepQuantitySummary from './ProductionStepQuantitySummary.vue';

defineProps<{ task: ProductionReportContext; historical: boolean }>();
</script>

<style scoped>
.report-business-summary {
  display: grid;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.report-identity {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 14px;
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.report-identity > span {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
</style>
