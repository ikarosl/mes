<template>
  <section class="inspection-history">
    <h3>历史处理</h3>
    <InlineHint class="notice">
      每条记录对应一次处理生成的异常处置单。已处理量不表示返工、报废或补料已完成，后续进度以处置和返工状态为准。
    </InlineHint>
    <el-alert
      v-if="history.error"
      :title="history.error"
      type="error"
      :closable="false"
      class="notice"
    />
    <el-table
      v-loading="history.loading"
      :data="history.items"
      row-key="dispositionId"
      border
      empty-text="当前工序暂无专检处理记录"
    >
      <el-table-column
        label="处理单号 / 来源"
        min-width="230"
      >
        <template #default="{ row }">
          <div>{{ row.dispositionNo }}</div>
          <div class="secondary">专检单 ID {{ row.processInspectionId }}</div>
          <div class="secondary">采用结果记录 ID {{ row.processInspectionRecordId }}</div>
        </template>
      </el-table-column>
      <el-table-column
        label="本次处理量"
        min-width="120"
      >
        <template #default="{ row }">
          {{ formatQuantity(row.sourceAbnormalQuantity) }} {{ row.unit }}
        </template>
      </el-table-column>
      <el-table-column
        label="处理人员 / 时间"
        min-width="180"
      >
        <template #default="{ row }">
          <div>{{ row.createdByName || '未提供姓名' }}</div>
          <div class="secondary">{{ formatDateTimeForDisplay(row.createdAt) }}</div>
        </template>
      </el-table-column>
      <el-table-column
        label="后续处置 / 返工"
        min-width="250"
      >
        <template #default="{ row }">
          <div>{{ dispositionResultLabel(row) }}</div>
          <div
            v-if="row.reviewedAt"
            class="secondary"
          >
            {{ row.reviewedByName || '未提供姓名' }} ·
            {{ formatDateTimeForDisplay(row.reviewedAt) }}
          </div>
          <template v-if="row.rework">
            <div class="secondary">
              {{ row.rework.reworkNo }} ·
              {{ REWORK_STATUS_LABELS[row.rework.status as ReworkStatus] }}
            </div>
            <div
              v-if="row.rework.completedAt"
              class="secondary"
            >
              {{ formatDateTimeForDisplay(row.rework.completedAt) }}
            </div>
          </template>
        </template>
      </el-table-column>
      <el-table-column
        prop="remark"
        label="当前处置说明"
        min-width="200"
      >
        <template #default="{ row }">{{ row.remark || '未填写' }}</template>
      </el-table-column>
    </el-table>
    <PaginationFooter
      :total="history.total"
      :current-page="history.page"
      :page-size="history.pageSize"
      @page-change="history.changePage"
      @update:page-size="history.changePageSize"
    />
  </section>
</template>

<script setup lang="ts">
import { REWORK_STATUS_LABELS } from '@company/constants';
import type { ReworkStatus } from '@company/contracts';
import InlineHint from '../../../components/InlineHint.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { formatDateTimeForDisplay } from '../../../utils/date';
import type { useProductionInspectionHistory } from '../composables/useProductionInspectionHistory';
import { dispositionResultLabel } from '../production-report-presentation';
import { formatQuantity } from '../production-status';

defineProps<{ history: ReturnType<typeof useProductionInspectionHistory> }>();
</script>

<style scoped>
.inspection-history {
  margin-top: 20px;
  border-top: 1px solid var(--el-border-color-light);
  padding-top: 16px;
}
h3 {
  margin: 0;
  font-size: 14px;
}
.notice {
  margin: 12px 0;
}
.secondary {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
