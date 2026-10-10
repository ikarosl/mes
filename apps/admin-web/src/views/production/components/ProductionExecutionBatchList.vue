<template>
  <aside class="batch-list">
    <div class="batch-list-heading">
      <strong>生产批次</strong>
      <span>点击切换记录</span>
    </div>
    <form
      class="batch-search"
      @submit.prevent="$emit('search')"
    >
      <el-input
        :model-value="keyword"
        :disabled="disabled || loading"
        clearable
        placeholder="批次号 / 工单号 / 产品"
        aria-label="搜索生产批次"
        @update:model-value="$emit('update:keyword', $event)"
      />
      <div class="batch-search-actions">
        <el-button
          native-type="submit"
          size="small"
          type="primary"
          :disabled="disabled"
          :loading="loading"
          >查询</el-button
        >
        <el-button
          native-type="button"
          size="small"
          :disabled="disabled || loading"
          @click="$emit('reset-search')"
          >重置</el-button
        >
      </div>
      <span class="applied-filter">当前筛选：{{ appliedKeyword || '全部批次' }}</span>
    </form>
    <el-alert
      v-if="errorText"
      class="batch-error"
      :title="errorText"
      type="error"
      :closable="false"
      show-icon
    />
    <div
      v-loading="loading"
      class="batch-items"
    >
      <button
        v-for="batch in batches"
        :key="batch.id"
        type="button"
        :disabled="disabled || loading"
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
          <span>计划完成 {{ formatDateForDisplay(batch.planEndDate) }}</span>
          <strong
            v-if="executionBatchOverdueDays(batch) > 0"
            class="overdue-text"
            >已逾期 {{ executionBatchOverdueDays(batch) }} 天</strong
          >
        </div>
      </button>
      <el-empty
        v-if="!loading && !errorText && batches.length === 0"
        description="未找到匹配的生产批次"
        :image-size="72"
      />
    </div>
    <div class="batch-footer">
      <div
        class="batch-page-summary"
        aria-live="polite"
      >
        <span>共 {{ total }} 条</span>
        <span>第 {{ currentPage }} / {{ pageCount }} 页 · {{ pageSize }} 条/页</span>
      </div>
      <el-pagination
        class="batch-pagination"
        small
        layout="prev, pager, next"
        :pager-count="5"
        :disabled="disabled || loading"
        :current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        @update:current-page="changePage"
      />
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { ProductionExecutionBatchSummary } from '@company/contracts';
import { computed } from 'vue';
import { formatDateForDisplay } from '../../../utils/date';
import { batchStatusMeta, formatQuantity } from '../production-status';
import {
  executionBatchHasAbnormal,
  executionBatchOverdueDays,
  executionBatchProgressPercentage,
  executionBatchRiskClass,
} from '../production-execution-risk';

defineOptions({ name: 'ProductionExecutionBatchList' });
const props = defineProps<{
  batches: ProductionExecutionBatchSummary[];
  loading: boolean;
  selectedBatchId: string | null;
  currentPage: number;
  total: number;
  pageSize: number;
  keyword: string;
  appliedKeyword: string;
  errorText: string;
  disabled: boolean;
}>();
const emit = defineEmits<{
  select: [batchId: string];
  'change-page': [page: number];
  'update:keyword': [keyword: string];
  search: [];
  'reset-search': [];
}>();
const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
const changePage = (page: number): void => {
  // 总数变化会触发 Element Plus 的页码校正，读取中由资源所有者同步页码。
  if (!props.loading && !props.disabled && !props.errorText && page !== props.currentPage)
    emit('change-page', page);
};
</script>

<style scoped>
.batch-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 16px;
  border-right: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
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
.batch-list-heading {
  flex: 0 0 auto;
}
.batch-list-heading strong {
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.batch-list-heading span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.batch-items {
  display: grid;
  flex: 1;
  align-content: start;
  gap: 8px;
  min-height: 0;
  margin-top: 14px;
  overflow-y: auto;
}
.batch-item {
  display: grid;
  gap: 4px;
  width: 100%;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
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
  color: var(--el-text-color-regular);
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
.batch-search {
  display: grid;
  flex: 0 0 auto;
  gap: 8px;
  margin-top: 12px;
}
.batch-search-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.batch-search-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.applied-filter {
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.batch-error {
  flex: 0 0 auto;
  margin-top: 8px;
}
.batch-item:disabled {
  cursor: default;
}
.batch-footer {
  flex: 0 0 auto;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.batch-page-summary {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--el-text-color-regular);
  font-size: 12px;
}
.batch-pagination {
  justify-content: center;
  margin-top: 8px;
}
@media (max-width: 1000px) {
  .batch-list {
    border-right: 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }
}
</style>
