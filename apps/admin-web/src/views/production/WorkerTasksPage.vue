<template>
  <div class="worker-tasks-page">
    <section class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
        :disabled="navigationPending"
        @submit.prevent="search"
      >
        <el-form-item label="工序状态">
          <el-select v-model="query.status">
            <el-option
              label="全部"
              value=""
            />
            <el-option
              v-for="status in PRODUCTION_WORKER_TASK_STATUSES"
              :key="status"
              :label="BATCH_STEP_STATUS_LABELS[status]"
              :value="status"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="任务单号">
          <el-input
            v-model="query.batchNo"
            clearable
            maxlength="100"
            placeholder="输入任务单号，支持部分匹配"
          />
        </el-form-item>
        <el-form-item label="工单号">
          <el-input
            v-model="query.workOrderNo"
            clearable
            maxlength="100"
            placeholder="输入工单号，支持部分匹配"
          />
        </el-form-item>
        <el-form-item class="query-actions">
          <el-button
            type="primary"
            native-type="submit"
            :loading="loading"
            >查询</el-button
          >
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </section>
    <section class="table-panel">
      <TableToolbar :total="total"
        ><template #actions
          ><div class="tasks-caption">
            <strong>本人现场工序</strong><span>当前分派与历史记录</span>
          </div></template
        ><template #tools
          ><el-button
            :icon="Refresh"
            text
            circle
            :loading="loading"
            aria-label="刷新本人任务"
            @click="reload" /></template
      ></TableToolbar>
      <InlineHint class="execution-tip"
        >报工后仍需点击完成工序；报工数量不代表质检结果。已完成工序需先重新开工才能新增报工，更正记录无需重开。结案期间仅可查看。</InlineHint
      >
      <InlineHint
        v-if="hasAppliedStatus"
        class="execution-tip"
        >已按工序状态筛选；开始、完成或重新开工后，不再符合所选状态的工序会移出当前结果。</InlineHint
      >
      <el-alert
        v-if="errorText"
        class="execution-tip"
        :title="errorText"
        type="error"
        :closable="false"
        show-icon
      />
      <el-table
        v-loading="loading"
        :data="tasks"
        row-key="stepRecordId"
        :empty-text="hasAppliedFilters ? '当前筛选下没有分配给你的工序' : '当前没有分配给你的工序'"
      >
        <el-table-column
          label="工单 / 任务"
          min-width="140"
          ><template #default="{ row }"
            >{{ row.workOrderNo }}<br />{{ row.batchNo }}</template
          ></el-table-column
        >
        <el-table-column
          label="产品 / 工序"
          min-width="150"
          ><template #default="{ row }"
            >{{ row.productCode }} / {{ row.productName }}
            <div>{{ row.stepOrder }}. {{ row.stepName }}</div></template
          ></el-table-column
        >
        <el-table-column
          label="工序状态与数量"
          min-width="400"
          ><template #default="{ row }"
            ><div class="state-line">
              <el-tag :type="stepStatusMeta(row.status).type">{{ stepStatusLabel(row) }}</el-tag
              ><el-tag
                size="small"
                effect="plain"
                :type="batchStatusMeta(row.batchStatus).type"
                >任务{{ batchStatusMeta(row.batchStatus).label }}</el-tag
              >
            </div>
            <ProductionStepQuantitySummary
              :step="row"
              :planned-quantity="row.plannedQuantity"
              show-distribution
              :show-reopen-hint="row.batchStatus === 'doing'" /></template
        ></el-table-column>
        <el-table-column
          label="SOP"
          min-width="90"
          ><template #default="{ row }"
            ><template v-if="row.sopFileName"
              ><div>{{ row.sopFileName }}</div>
              <el-button
                link
                type="primary"
                :loading="sopPendingIds.has(row.stepRecordId)"
                @click="downloadSop(row)"
                >下载 SOP</el-button
              ></template
            ><span
              v-else
              class="muted"
              >未配置</span
            ></template
          ></el-table-column
        >
        <el-table-column
          label="操作"
          min-width="230"
          fixed="right"
          ><template #default="{ row }"
            ><ProductionStepActions
              :step="row"
              worker
              :disabled="listBusy"
              @action="(action) => stepActionDialogsRef?.open(row, action)"
              @history="stepActionDialogsRef?.openHistory(row)"
            />
            <div class="report-actions">
              <el-button
                link
                type="primary"
                :disabled="listBusy || !canOpenProductionReport(row)"
                @click="reportCreate.open(row, 'normal')"
                >正常报工</el-button
              ><el-button
                link
                type="primary"
                :disabled="listBusy || !canOpenProductionReport(row)"
                @click="reportCreate.open(row, 'abnormal')"
                >异常报工</el-button
              ><el-button
                link
                type="primary"
                :disabled="listBusy"
                @click="openRecords(row)"
                >记录与纠错</el-button
              >
            </div>
            <div
              v-if="!canOpenProductionReport(row)"
              class="blocked-reason"
            >
              {{ productionReportBlockedReason(row) }}
            </div></template
          ></el-table-column
        >
      </el-table>
      <PaginationFooter
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        @page-change="changePage"
        @update:page-size="changePageSize"
      />
    </section>
    <ProductionStepActionDialogs
      ref="stepActionDialogsRef"
      :steps="tasks"
      worker
      :disabled="listBusy"
      @changed="reload"
    />
    <el-dialog
      v-model="recordsVisible"
      title="本人工序 · 报工历史与纠错"
      :width="DialogWidth.workbench"
      workbench
    >
      <template v-if="recordsTask"
        ><el-descriptions
          :column="3"
          border
          ><el-descriptions-item label="任务">{{ recordsTask.batchNo }}</el-descriptions-item
          ><el-descriptions-item label="工序"
            >{{ recordsTask.stepOrder }}. {{ recordsTask.stepName }}</el-descriptions-item
          ><el-descriptions-item label="工序状态">{{
            BATCH_STEP_STATUS_LABELS[recordsTask.status]
          }}</el-descriptions-item></el-descriptions
        ><InlineHint class="execution-tip"
          >记录保留当时的实际录入人。数量纠错不要求先重开；请按每条记录的资格和原因办理。</InlineHint
        ><el-alert
          v-if="!currentRecordsTask"
          title="当前列表未包含本工序，可能受筛选、分页或刷新失败影响；此处保留显示，操作前请重新核对。"
          type="warning"
          :closable="false"
          show-icon /><ProductionStepReportTable
          :batch-id="recordsTask.productionBatchId"
          :step-record-id="recordsTask.stepRecordId"
          :version="currentRecordsTask?.version ?? recordsTask.version"
          :refresh-key="refreshKey"
          :disabled="listBusy || !currentRecordsTask"
          :active="recordsVisible"
          @view-detail="reportTrace.open"
          @view-report="reportTrace.open"
          @correct="(report) => openAdjustment('correct', report)"
          @reverse="(report) => openAdjustment('reverse', report)"
      /></template>
      <template #footer><el-button @click="recordsVisible = false">关闭</el-button></template>
    </el-dialog>
    <BatchStepReportDialog
      ref="reportDialogRef"
      v-model="reportCreate.visible"
      :task="reportCreate.task"
      :mode="reportCreate.mode"
      :submitting="reportCreate.submitting"
      :intent-status="reportCreate.intentStatus"
      :context-ready="reportCreate.contextReady"
      @reset-intent="reportCreate.resetIntent"
      @submit="reportCreate.submit"
    />
    <ProductionReportAdjustmentDialog :editor="reportEditor" />
  </div>
  <ProductionReportTraceDialog :reader="reportTrace" />
</template>

<script setup lang="ts">
import { computed, onActivated, onDeactivated, onScopeDispose, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import { BATCH_STEP_STATUS_LABELS, PRODUCTION_WORKER_TASK_STATUSES } from '@company/constants';
import type { BatchStepReportView, ProductionWorkerTaskItem } from '@company/contracts';
import { productionApi } from '../../api/production';
import { usePageActivationRefresh } from '../../composables/requests/usePageActivationRefresh';
import { useLatestRequest } from '../../composables/requests/useLatestRequest';
import { useTabsStore } from '../../stores/tabs';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import InlineHint from '../../components/InlineHint.vue';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';
import { batchStatusMeta, stepStatusMeta } from './production-status';
import { useWorkerTasks } from './composables/useWorkerTasks';
import { useProductionReportCreate } from './composables/useProductionReportCreate';
import { useProductionReportAdjustment } from './composables/useProductionReportAdjustment';
import BatchStepReportDialog from './components/BatchStepReportDialog.vue';
import ProductionStepQuantitySummary from './components/ProductionStepQuantitySummary.vue';
import { canOpenProductionReport, productionReportBlockedReason } from './production-report-input';
import ProductionStepActions from './components/ProductionStepActions.vue';
import ProductionStepActionDialogs from './components/ProductionStepActionDialogs.vue';
import ProductionStepReportTable from './components/ProductionStepReportTable.vue';
import ProductionReportAdjustmentDialog from './components/ProductionReportAdjustmentDialog.vue';
import ProductionReportTraceDialog from './components/ProductionReportTraceDialog.vue';
import { useProductionReportTrace } from './composables/useProductionReportTrace';

defineOptions({ name: 'ProductionWorkerTasksPage' });
const recordsVisible = ref(false),
  recordsTaskSnapshot = ref<ProductionWorkerTaskItem | null>(null),
  refreshKey = ref(0);
const {
  tasks,
  loading,
  total,
  page,
  pageSize,
  query,
  hasAppliedFilters,
  hasAppliedStatus,
  errorText,
  applyFilters,
  clearFilters,
  load,
} = useWorkerTasks();
const navigationPending = ref(false);
const listBusy = computed(() => loading.value || navigationPending.value);
const navigation = useLatestRequest();
let active = true;
const stepStatusLabel = (row: ProductionWorkerTaskItem): string =>
  BATCH_STEP_STATUS_LABELS[row.status];
const getStep = (id: string): ProductionWorkerTaskItem | null =>
  tasks.value.find((item) => item.stepRecordId === id) ?? null;
const currentRecordsTask = computed(() =>
  recordsTaskSnapshot.value ? getStep(recordsTaskSnapshot.value.stepRecordId) : null,
);
const recordsTask = computed(() => currentRecordsTask.value ?? recordsTaskSnapshot.value);
const reportTrace = useProductionReportTrace({
  contextId: () =>
    recordsTask.value
      ? `${recordsTask.value.productionBatchId}:${recordsTask.value.stepRecordId}`
      : null,
});
watch(
  recordsVisible,
  (visible) => {
    if (!visible) reportTrace.close();
  },
  { flush: 'sync' },
);
const reload = async (): Promise<void> => {
  if (await load()) refreshKey.value += 1;
};
const reportCreate = useProductionReportCreate({
  getContext: getStep,
  isReady: () => !listBusy.value && !errorText.value,
  refresh: reload,
});
const reportEditor = useProductionReportAdjustment({
  getStep,
  getBatchStatus: () => recordsTask.value?.batchStatus ?? null,
  isReady: () => !listBusy.value && !errorText.value,
  refresh: reload,
});
const openAdjustment = (mode: 'correct' | 'reverse', report: BatchStepReportView): void => {
  if (recordsTask.value) reportEditor.open(mode, recordsTask.value, report);
};
const reportDialogRef = ref<InstanceType<typeof BatchStepReportDialog> | null>(null);
const stepActionDialogsRef = ref<InstanceType<typeof ProductionStepActionDialogs> | null>(null);
const canChangeContext = async (isCurrent: () => boolean = () => true): Promise<boolean> => {
  if (reportCreate.visible && !(await reportDialogRef.value?.canDiscard())) return false;
  if (!isCurrent()) return false;
  if (reportEditor.visible && !(await reportEditor.discard())) return false;
  if (!isCurrent()) return false;
  reportCreate.visible = false;
  reportEditor.visible = false;
  return true;
};
const transition = async (action: () => Promise<void>): Promise<void> => {
  if (!active || navigationPending.value) return;
  const isCurrent = navigation.begin(() => active);
  navigationPending.value = true;
  try {
    if (!(await canChangeContext(isCurrent)) || !isCurrent()) return;
    recordsVisible.value = false;
    await action();
  } finally {
    if (isCurrent()) navigationPending.value = false;
  }
};
const openRecords = (task: ProductionWorkerTaskItem): Promise<void> =>
  transition(async () => {
    recordsTaskSnapshot.value = { ...task };
    recordsVisible.value = true;
  });
const search = (): Promise<void> =>
  transition(async () => {
    applyFilters();
    await reload();
  });
const resetQuery = (): Promise<void> =>
  transition(async () => {
    clearFilters();
    await reload();
  });
const changePage = async (next: number): Promise<void> => {
  if (next === page.value) return;
  await transition(async () => {
    page.value = next;
    await reload();
  });
};
const changePageSize = async (next: number): Promise<void> => {
  if (next === pageSize.value) return;
  await transition(async () => {
    pageSize.value = next;
    page.value = 1;
    await reload();
  });
};
const sopPendingIds = ref(new Set<string>());
const downloadSop = async (task: ProductionWorkerTaskItem): Promise<void> => {
  if (!task.sopFileName || sopPendingIds.value.has(task.stepRecordId)) return;
  sopPendingIds.value = new Set(sopPendingIds.value).add(task.stepRecordId);
  try {
    const blob = await productionApi.workerTaskSopContent(
      task.productionBatchId,
      task.stepRecordId,
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = task.sopFileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    EMessage.error(error, 'SOP 文件下载失败');
  } finally {
    const next = new Set(sopPendingIds.value);
    next.delete(task.stepRecordId);
    sopPendingIds.value = next;
  }
};
const route = useRoute();
const unregister = useTabsStore().registerCloseGuard(String(route.name), canChangeContext);
onScopeDispose(unregister);
const invalidateNavigation = (): void => {
  active = false;
  navigation.invalidate();
  navigationPending.value = false;
};
onActivated(() => {
  active = true;
});
onDeactivated(invalidateNavigation);
onScopeDispose(invalidateNavigation);
usePageActivationRefresh(reload);
</script>

<style scoped>
.worker-tasks-page {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  min-width: 0;
  max-width: 100%;
}
.query-panel,
.table-panel {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.query-panel {
  padding: 16px 16px 0;
}
.query-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0 20px;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 16px;
}
.query-form :deep(.el-select) {
  width: 150px;
}
.query-form :deep(.el-input) {
  width: 220px;
}
.query-actions {
  margin-left: auto;
}
.table-panel {
  overflow: hidden;
}
.tasks-caption {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.tasks-caption strong {
  color: var(--el-text-color-primary);
  font-size: 16px;
}
.tasks-caption span,
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.execution-tip {
  margin: 12px 16px;
  width: auto;
}
.state-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.report-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}
.blocked-reason {
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
