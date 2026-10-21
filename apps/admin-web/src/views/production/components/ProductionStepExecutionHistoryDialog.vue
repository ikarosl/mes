<template>
  <el-dialog
    :model-value="modelValue"
    :title="`${stepName} · 状态业务历史`"
    :width="DialogWidth.xl"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <InlineHint
      >显示已记录的状态动作及当时操作者；当前负责人表示现在的办理权。报工登记时间不等于实际开工或完工时间。</InlineHint
    >
    <el-alert
      v-if="errorText"
      class="notice"
      :title="errorText"
      type="error"
      :closable="false"
      show-icon
    />
    <div class="history-toolbar">
      <el-button
        link
        type="primary"
        :loading="loading"
        @click="load"
        >刷新历史</el-button
      >
    </div>
    <el-table
      v-loading="loading"
      :data="items"
      :row-key="(row: ProductionStepExecutionHistoryItem) => `${row.sourceType}:${row.actionId}`"
      empty-text="尚无已记录的状态动作"
    >
      <el-table-column
        label="动作"
        min-width="175"
        ><template #default="{ row }"
          >{{ actionLabel(row) }}
          <div v-if="row.correctionType">{{ correctionLabel(row) }}</div></template
        ></el-table-column
      >
      <el-table-column
        label="前后状态"
        min-width="150"
        ><template #default="{ row }"
          >{{ statusLabel(row.beforeStatus) }} → {{ statusLabel(row.afterStatus) }}</template
        ></el-table-column
      >
      <el-table-column
        label="开工时间：前 → 后"
        min-width="185"
        ><template #default="{ row }"
          >{{ formatDateTimeForDisplay(row.beforeStartedAt) }}<br />→
          {{ formatDateTimeForDisplay(row.afterStartedAt) }}</template
        ></el-table-column
      >
      <el-table-column
        label="完工时间：前 → 后"
        min-width="185"
        ><template #default="{ row }"
          >{{ formatDateTimeForDisplay(row.beforeCompletedAt) }}<br />→
          {{ formatDateTimeForDisplay(row.afterCompletedAt) }}</template
        ></el-table-column
      >
      <el-table-column
        label="实际办理人 / 登记时间"
        min-width="190"
        ><template #default="{ row }"
          >{{ row.createdByName || row.createdById }}<br />{{
            formatDateTimeForDisplay(row.createdAt)
          }}</template
        ></el-table-column
      >
      <el-table-column
        prop="reason"
        label="原因"
        min-width="180"
      />
    </el-table>
    <PaginationFooter
      :total="total"
      :current-page="page"
      :page-size="pageSize"
      @page-change="changePage"
      @update:page-size="changePageSize"
    />
    <template #footer
      ><el-button @click="$emit('update:modelValue', false)">关闭</el-button></template
    >
  </el-dialog>
</template>

<script setup lang="ts">
import { onActivated, ref, watch } from 'vue';
import type { BatchStepStatus, ProductionStepExecutionHistoryItem } from '@company/contracts';
import {
  BATCH_STEP_STATUS_LABELS,
  PRODUCTION_STEP_EXECUTION_HISTORY_LABELS,
  PRODUCTION_STEP_HISTORY_CORRECTION_LABELS,
} from '@company/constants';
import { productionApi } from '../../../api/production';
import InlineHint from '../../../components/InlineHint.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    batchId: string;
    stepRecordId: string;
    stepName: string;
    worker?: boolean;
  }>(),
  { worker: false },
);
defineEmits<{ 'update:modelValue': [open: boolean] }>();
const items = ref<ProductionStepExecutionHistoryItem[]>([]),
  loading = ref(false),
  errorText = ref(''),
  total = ref(0),
  page = ref(1),
  pageSize = ref(10);
const actionLabel = (row: ProductionStepExecutionHistoryItem): string =>
  PRODUCTION_STEP_EXECUTION_HISTORY_LABELS[row.actionType];
const correctionLabel = (row: ProductionStepExecutionHistoryItem): string =>
  row.correctionType ? PRODUCTION_STEP_HISTORY_CORRECTION_LABELS[row.correctionType] : '';
const statusLabel = (status: BatchStepStatus): string => BATCH_STEP_STATUS_LABELS[status];
const reads = useLatestReadRequest(() => (loading.value = false));
const load = async (): Promise<void> => {
  if (!props.modelValue || !reads.isActive()) return;
  const batchId = props.batchId,
    stepId = props.stepRecordId;
  const { isCurrent, signal } = reads.begin(
    () => props.modelValue && props.batchId === batchId && props.stepRecordId === stepId,
  );
  loading.value = true;
  errorText.value = '';
  try {
    const result = await productionApi.listStepExecutionActions(
      batchId,
      stepId,
      props.worker,
      { page: page.value, pageSize: pageSize.value },
      { skipErrorHandling: true, signal },
    );
    if (isCurrent()) {
      items.value = result.items;
      total.value = result.total;
    }
  } catch (error) {
    if (isCurrent()) {
      errorText.value = '状态业务历史加载失败，请刷新重试。';
      EMessage.error(error, errorText.value);
    }
  } finally {
    if (isCurrent()) loading.value = false;
  }
};
const changePage = (next: number): void => {
  page.value = next;
  void load();
};
const changePageSize = (next: number): void => {
  pageSize.value = next;
  page.value = 1;
  void load();
};
watch(
  () => [props.modelValue, props.batchId, props.stepRecordId] as const,
  ([open], previous) => {
    reads.invalidate();
    if (!open) return;
    if (!previous?.[0] || previous[1] !== props.batchId || previous[2] !== props.stepRecordId) {
      items.value = [];
      total.value = 0;
      page.value = 1;
    }
    void load();
  },
);
onActivated(() => {
  if (props.modelValue) void load();
});
</script>

<style scoped>
.notice {
  margin-top: 12px;
}
.history-toolbar {
  display: flex;
  justify-content: flex-end;
  margin: 12px 0 8px;
}
</style>
