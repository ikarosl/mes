<template>
  <aside class="batch-list">
    <div class="batch-list-heading">
      <strong>生产批次</strong>
      <span>点击切换记录</span>
    </div>
    <div
      v-loading="loading"
      class="batch-items"
    >
      <button
        v-for="batch in batches"
        :key="batch.id"
        type="button"
        :class="[
          'batch-item',
          executionBatchRiskClass(batch),
          { active: selectedBatchId === batch.id },
        ]"
        @click="$emit('select', batch.id)"
      >
        <div class="batch-item-title">
          <strong>{{ batch.batchNo }}</strong>
          <el-tag
            size="small"
            :type="batchStatusMeta(batch.status).type"
            effect="light"
            >{{ batchStatusMeta(batch.status).label }}</el-tag
          >
        </div>
        <span>{{ batch.workOrderNo }}</span>
        <small>{{ batch.productCode }} / {{ batch.productName }}</small>
        <div class="batch-item-progress">
          <span>工序 {{ batch.completedStepCount }} / {{ batch.totalStepCount }}</span>
          <strong
            v-if="executionBatchHasAbnormal(batch)"
            class="danger-text"
            >异常 {{ formatQuantity(batch.effectiveAbnormalQuantity) }} · 待处置
            {{ batch.pendingAbnormalCount }}</strong
          >
        </div>
        <el-progress
          :percentage="executionBatchProgressPercentage(batch)"
          :stroke-width="6"
          :show-text="false"
          :status="executionBatchHasAbnormal(batch) ? 'exception' : undefined"
        />
        <div
          v-if="batch.planEndDate"
          class="batch-item-deadline"
        >
          <span>计划完成 {{ batch.planEndDate }}</span>
          <strong
            v-if="executionBatchOverdueDays(batch) > 0"
            class="overdue-text"
            >已逾期 {{ executionBatchOverdueDays(batch) }} 天</strong
          >
        </div>
      </button>
      <el-empty
        v-if="!loading && batches.length === 0"
        description="未找到生产批次"
        :image-size="72"
      />
    </div>
    <el-pagination
      v-if="total > 20"
      class="batch-pagination"
      small
      layout="prev, pager, next"
      :current-page="currentPage"
      :page-size="20"
      :total="total"
      @current-change="$emit('change-page', $event)"
    />
  </aside>
</template>

<script setup lang="ts">
import type { ProductionExecutionBatchSummary } from '@company/contracts';
import { batchStatusMeta, formatQuantity } from '../production-status';
import {
  executionBatchHasAbnormal,
  executionBatchOverdueDays,
  executionBatchProgressPercentage,
  executionBatchRiskClass,
} from '../production-execution-risk';

defineOptions({ name: 'ProductionExecutionBatchList' });
defineProps<{
  batches: ProductionExecutionBatchSummary[];
  loading: boolean;
  selectedBatchId: string | null;
  currentPage: number;
  total: number;
}>();
defineEmits<{
  select: [batchId: string];
  'change-page': [page: number];
}>();
</script>

<style scoped>
.batch-list {
  padding: 16px;
  border-right: 1px solid #e5e7eb;
  background: #f9fafb;
}
.batch-list-heading,
.batch-item-title,
.batch-item-progress,
.batch-item-deadline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.batch-list-heading strong {
  color: #1f2937;
  font-size: 14px;
}
.batch-list-heading span {
  color: #9ca3af;
  font-size: 12px;
}
.batch-items {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}
.batch-item {
  display: grid;
  gap: 4px;
  width: 100%;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.batch-item.risk-warning {
  border-color: var(--el-color-warning);
}
.batch-item.risk-error {
  border-color: var(--el-color-danger);
}
.batch-item.active {
  background: var(--el-color-primary-light-9);
  box-shadow: inset 3px 0 0 var(--el-color-primary);
}
.batch-item span,
.batch-item small {
  color: #6b7280;
}
.batch-item-title :deep(.el-tag) {
  flex: 0 0 auto;
}
.batch-item-progress,
.batch-item-deadline,
.batch-item-progress .danger-text,
.batch-item-deadline .overdue-text {
  font-size: 12px;
}
.overdue-text {
  color: var(--el-color-warning-dark-2);
}
.danger-text {
  color: var(--el-color-danger);
}
.batch-pagination {
  justify-content: center;
  margin-top: 14px;
}
@media (max-width: 1000px) {
  .batch-list {
    border-right: 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }
}
</style>
