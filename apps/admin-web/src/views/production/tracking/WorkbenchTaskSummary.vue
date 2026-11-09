<template>
  <section
    class="task-summary"
    aria-label="当前任务生产概览"
    :aria-busy="loading"
  >
    <div class="summary-item">
      <el-icon><Tickets /></el-icon>
      <span>当前任务 · 流转中</span>
      <strong>{{ context ? context.summary.inProgressCardCount : '—' }}<small>盘</small></strong>
    </div>
    <div class="summary-item">
      <el-icon><CircleCheck /></el-icon>
      <span
        >已定稿<small class="scrapped-summary"
          >整盘报废 {{ context ? context.summary.scrappedCardCount : '—' }} 盘</small
        ></span
      >
      <strong>{{ context ? context.summary.completedCardCount : '—' }}<small>盘</small></strong>
    </div>
    <div class="summary-item">
      <el-icon><Box /></el-icon>
      <span>实际可用产出</span>
      <strong>{{ context ? formatQuantity(context.summary.availableQuantity) : '—' }}</strong>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Box, CircleCheck, Tickets } from '@element-plus/icons-vue';
import type { ProductionTrackingWorkbench } from '@company/contracts';
import { formatQuantity } from '../../../utils/quantity';

defineProps<{ context: ProductionTrackingWorkbench | null; loading: boolean }>();
</script>

<style scoped>
.task-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 6px 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.summary-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 12px 20px;
}
.summary-item + .summary-item {
  border-left: 1px solid var(--el-border-color-lighter);
}
.summary-item > .el-icon {
  color: var(--el-text-color-secondary);
  font-size: 18px;
}
.summary-item > span {
  color: var(--el-text-color-regular);
  font-size: 14px;
}
.summary-item .scrapped-summary {
  display: block;
  margin: 4px 0 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.summary-item strong {
  margin-left: auto;
  color: var(--el-text-color-primary);
  font-size: 24px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.summary-item small {
  margin-left: 6px;
  color: var(--el-text-color-regular);
  font-size: 12px;
  font-weight: 400;
}
@media (max-width: 1100px) {
  .summary-item {
    gap: 8px;
    padding: 12px 16px;
  }
  .summary-item > .el-icon {
    display: none;
  }
}
</style>
