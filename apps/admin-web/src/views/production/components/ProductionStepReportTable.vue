<template>
  <section class="step-report-table">
    <div class="table-heading">
      <strong>报工事实</strong>
      <el-button
        link
        type="primary"
        :loading="loading"
        @click="loadReports"
        >刷新记录</el-button
      >
    </div>
    <el-alert
      v-if="errorText"
      :title="errorText"
      type="error"
      :closable="false"
      show-icon
    />
    <el-table
      v-loading="loading"
      :data="reports"
      row-key="reportId"
      empty-text="尚无报工历史"
    >
      <el-table-column
        v-if="selectable"
        label="选择"
        width="58"
      >
        <template #default="{ row }">
          <el-checkbox
            :model-value="selectedIds.includes(row.reportId)"
            :disabled="
              loading ||
              disabled ||
              row.sourceKind !== 'direct_normal' ||
              !row.isEffective ||
              !row.canReverse
            "
            :aria-label="`选择报工 ${row.reportNo}`"
            @change="
              (checked: boolean | string | number) => $emit('select-report', row, checked === true)
            "
          />
        </template>
      </el-table-column>
      <el-table-column
        label="报工单号"
        min-width="160"
      >
        <template #default="{ row }"
          ><strong
            class="report-identifier"
            :data-report-id="row.reportId"
            >{{ row.reportNo }}</strong
          ></template
        >
      </el-table-column>
      <el-table-column
        label="业务类型 / 状态"
        width="128"
      >
        <template #default="{ row }"
          ><div>{{ reportBusinessLabel(row) }}</div>
          <el-tag
            size="small"
            :type="reportEffectMeta(row).type"
            >{{ reportEffectMeta(row).label }}</el-tag
          ></template
        >
      </el-table-column>
      <el-table-column
        label="数量变动（正常 / 异常）"
        width="188"
      >
        <template #default="{ row }">
          <span class="quantity-change">{{ reportQuantityChange(row.normalQuantity, row) }}</span> /
          <span
            :class="[
              'quantity-change',
              {
                'abnormal-change':
                  Number(row.abnormalQuantity) > 0 && row.sourceKind !== 'reversal',
              },
            ]"
            >{{ reportQuantityChange(row.abnormalQuantity, row) }}</span
          >
        </template>
      </el-table-column>
      <el-table-column
        label="业务来源与关系"
        min-width="195"
      >
        <template #default="{ row }"
          ><ProductionReportRelations
            :report="row"
            @view-report="viewRelated"
        /></template>
      </el-table-column>
      <el-table-column
        label="实际录入人 / 时间"
        min-width="176"
      >
        <template #default="{ row }"
          >{{ row.createdByName || '未提供姓名' }}<br />{{
            formatDateTimeForDisplay(row.createdAt)
          }}</template
        >
      </el-table-column>
      <el-table-column
        prop="remark"
        label="备注 / 原因"
        min-width="150"
        show-overflow-tooltip
      />
      <el-table-column
        label="操作 / 只读原因"
        :width="showActions ? 218 : 200"
        fixed="right"
      >
        <template #default="{ row }">
          <div class="row-actions">
            <el-button
              v-if="showActions && row.sourceKind === 'direct_normal' && row.canCorrect"
              link
              type="primary"
              :disabled="disabled || loading"
              @click="$emit('correct', row)"
              >更正正常数量</el-button
            >
            <el-button
              v-if="showActions && row.sourceKind === 'direct_normal' && row.canReverse"
              link
              type="danger"
              :disabled="disabled || loading"
              @click="$emit('reverse', row)"
              >冲销</el-button
            >
            <el-button
              link
              type="primary"
              :disabled="loading"
              @click="$emit('view-detail', reportReference(row))"
              >查看详情</el-button
            >
            <el-button
              v-if="reportHasProcessing(row)"
              link
              type="primary"
              :disabled="loading"
              @click="$emit('view-process', reportReference(row))"
              >查看处理过程</el-button
            >
          </div>
          <div
            v-if="reportReadOnlyReason(row)"
            class="blocked-reason"
          >
            {{ reportReadOnlyReason(row) }}
          </div>
        </template>
      </el-table-column>
    </el-table>
    <PaginationFooter
      :total="total"
      :current-page="page"
      :page-size="pageSize"
      @page-change="changePage"
      @update:page-size="changePageSize"
    />
  </section>
</template>

<script setup lang="ts">
import { onActivated, ref, watch } from 'vue';
import type { BatchStepReportReference, BatchStepReportView } from '@company/contracts';
import { productionApi } from '../../../api/production';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import ProductionReportRelations from './ProductionReportRelations.vue';
import {
  reportBusinessLabel,
  reportEffectMeta,
  reportHasProcessing,
  reportQuantityChange,
  reportReadOnlyReason,
  reportReference,
} from '../production-report-presentation';

const props = withDefaults(
  defineProps<{
    batchId: string;
    stepRecordId: string;
    version: number;
    disabled?: boolean;
    selectable?: boolean;
    selectedIds?: string[];
    showActions?: boolean;
    refreshKey?: number;
    active?: boolean;
  }>(),
  {
    disabled: false,
    selectable: false,
    selectedIds: () => [],
    showActions: true,
    refreshKey: 0,
    active: true,
  },
);
const emit = defineEmits<{
  'select-report': [report: BatchStepReportView, selected: boolean];
  correct: [report: BatchStepReportView];
  reverse: [report: BatchStepReportView];
  'view-detail': [report: BatchStepReportReference];
  'view-report': [report: BatchStepReportReference];
  'view-process': [report: BatchStepReportReference];
}>();
const reports = ref<BatchStepReportView[]>([]);
const loading = ref(false);
const errorText = ref('');
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const reads = useLatestReadRequest(() => (loading.value = false));
const viewRelated = (report: BatchStepReportReference): void => {
  if (props.active && reads.isActive()) emit('view-report', report);
};
const loadReports = async (): Promise<void> => {
  if (!props.active || !reads.isActive()) return;
  const batchId = props.batchId,
    stepId = props.stepRecordId;
  const { isCurrent, signal } = reads.begin(
    () => props.active && props.batchId === batchId && props.stepRecordId === stepId,
  );
  loading.value = true;
  errorText.value = '';
  try {
    const result = await productionApi.listStepReports(
      batchId,
      stepId,
      { page: page.value, pageSize: pageSize.value },
      { skipErrorHandling: true, signal },
    );
    if (!isCurrent()) return;
    reports.value = result.items;
    total.value = result.total;
  } catch (error) {
    if (!isCurrent()) return;
    if (props.showActions) reports.value = [];
    errorText.value = props.showActions
      ? '报工记录加载失败，旧操作依据已清除，请重试。'
      : '报工记录刷新失败，当前保留上次展示，请重试。';
    EMessage.error(error, errorText.value);
  } finally {
    if (isCurrent()) loading.value = false;
  }
};
const changePage = (next: number): void => {
  page.value = next;
  void loadReports();
};
const changePageSize = (next: number): void => {
  pageSize.value = next;
  page.value = 1;
  void loadReports();
};
watch(
  () => [props.batchId, props.stepRecordId] as const,
  () => {
    reports.value = [];
    total.value = 0;
    page.value = 1;
    void loadReports();
  },
  { immediate: true },
);
watch(
  () => props.active,
  (active) => {
    reads.invalidate();
    if (active) void loadReports();
  },
);
watch(
  () => [props.version, props.refreshKey] as const,
  () => {
    void loadReports();
  },
);
let hasActivated = false;
onActivated(() => {
  if (hasActivated) void loadReports();
  hasActivated = true;
});
defineExpose({ refresh: loadReports });
</script>

<style scoped>
.step-report-table {
  margin-top: 12px;
}

.table-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 14px;
}

.report-identifier {
  font-weight: 600;
}
.quantity-change {
  font-variant-numeric: tabular-nums;
}
.abnormal-change {
  color: var(--el-color-danger);
}
.row-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.row-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.blocked-reason {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.step-report-table :deep(.el-alert) {
  margin-bottom: 8px;
}
</style>
