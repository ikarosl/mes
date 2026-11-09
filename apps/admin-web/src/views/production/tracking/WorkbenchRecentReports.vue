<template>
  <section class="recent-reports">
    <header class="reports-heading">
      <div class="reports-title">
        <h2>最近报工</h2>
        <span>{{ taskDescription }}</span>
      </div>
      <div class="reports-tools">
        <el-button
          link
          :icon="Refresh"
          :loading="loading"
          :disabled="!taskSelected"
          @click="$emit('refresh')"
          >刷新</el-button
        >
        <el-button
          v-if="taskSelected && canOpenTracking"
          link
          type="primary"
          @click="$emit('history')"
        >
          查看全部 <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
    </header>
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
      class="reports-error"
    />
    <el-table
      v-loading="loading"
      :data="items"
      row-key="id"
    >
      <el-table-column
        label="追踪卡编号"
        min-width="205"
      >
        <template #default="{ row }"
          ><el-button
            link
            type="primary"
            class="card-link"
            @click="$emit('card', row)"
            >{{ row.cardNo }}</el-button
          ></template
        >
      </el-table-column>
      <el-table-column
        label="工序"
        min-width="160"
        ><template #default="{ row }"
          >{{ row.stepOrder }}. {{ row.stepName }}</template
        ></el-table-column
      >
      <el-table-column
        prop="personnelName"
        label="登记人"
        min-width="110"
      />
      <el-table-column
        label="完成数量"
        min-width="125"
        align="right"
        ><template #default="{ row }"
          ><strong>{{ formatQuantity(row.reportedQuantity) }}</strong> {{ row.unit }}</template
        ></el-table-column
      >
      <el-table-column
        label="交接 / 完工时间"
        min-width="185"
        ><template #default="{ row }">{{
          formatDateTimeForDisplay(row.completedAt)
        }}</template></el-table-column
      >
      <template #empty>{{ emptyDescription }}</template>
    </el-table>
    <div
      v-if="taskSelected"
      class="reports-note"
    >
      <span v-if="total !== null">当前任务共 {{ total }} 条报工记录。</span>
      按工序交接与完工统计，报工量不等于最终可用产出。
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight, Refresh } from '@element-plus/icons-vue';
import type { ProductionTrackingVisit } from '@company/contracts';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../../utils/quantity';

const props = defineProps<{
  batchNo: string;
  taskSelected: boolean;
  items: ProductionTrackingVisit[];
  loading: boolean;
  error: string;
  total: number | null;
  canOpenTracking: boolean;
}>();
defineEmits<{
  (event: 'refresh'): void;
  (event: 'history'): void;
  (event: 'card', report: ProductionTrackingVisit): void;
}>();
const emptyDescription = computed(() => {
  if (props.loading) return '正在读取最近报工';
  if (props.error) return '记录加载失败，请点击刷新重试';
  return props.taskSelected
    ? '当前任务暂无报工记录，到站后由下一站扫码形成交接报工'
    : '请先选择生产任务';
});
const taskDescription = computed(() => {
  if (!props.taskSelected) return '选择任务后查看交接与完工记录';
  return props.batchNo ? `当前任务 ${props.batchNo} · 最近 5 条` : '当前所选任务 · 最近 5 条';
});
</script>

<style scoped>
.recent-reports {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.reports-heading,
.reports-title,
.reports-tools {
  display: flex;
  align-items: center;
  gap: 8px 16px;
}
.reports-heading {
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.reports-title {
  flex-wrap: wrap;
}
.reports-title h2 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
  font-weight: 600;
}
.reports-title > span,
.reports-note {
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.7;
}
.reports-tools {
  flex-shrink: 0;
}
.reports-tools .el-button + .el-button {
  margin-left: 0;
}
.reports-error {
  width: auto;
  margin: 16px 20px;
}
.recent-reports :deep(.el-table__header th) {
  background: var(--el-fill-color-light);
}
.recent-reports :deep(.el-table__cell) {
  padding: 12px 0;
}
.recent-reports :deep(.el-table .cell) {
  padding: 0 20px;
}
.card-link {
  height: auto;
  white-space: normal;
}
.card-link :deep(span) {
  overflow-wrap: anywhere;
  text-align: left;
}
.reports-note {
  padding: 12px 20px;
}
</style>
