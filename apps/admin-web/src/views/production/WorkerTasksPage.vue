<template>
  <div class="worker-tasks-page">
    <section class="table-panel">
      <TableToolbar :total="tasks.length">
        <template #actions>
          <div class="tasks-caption">
            <strong>本人现场工序</strong>
            <span>仅显示当前分配给你的待执行、执行中和已完成工序</span>
          </div>
        </template>
        <template #tools>
          <el-tooltip
            content="刷新"
            placement="top"
          >
            <el-button
              :icon="Refresh"
              text
              circle
              :loading="loading"
              @click="reload"
            />
          </el-tooltip>
        </template>
      </TableToolbar>
      <el-alert
        class="execution-tip"
        type="info"
        :closable="false"
        show-icon
        title="只有当前负责人可以开工，开工时间由系统记录；报工填写本次数量，不填写累计数。异常数量大于零时系统会自动生成待处置记录。"
      />
      <el-table
        v-loading="loading"
        :data="tasks"
        class="worker-tasks-table"
        :row-class-name="workerTaskRowClass"
        empty-text="当前没有分配给你的工序"
      >
        <el-table-column
          prop="workOrderNo"
          label="工单号"
          min-width="150"
        />
        <el-table-column
          prop="batchNo"
          label="生产批次"
          min-width="150"
        />
        <el-table-column
          label="产品"
          min-width="190"
        >
          <template #default="{ row }">
            <div class="primary-text">{{ row.productName }}</div>
            <div class="secondary-text">{{ row.productCode }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="工序"
          min-width="170"
        >
          <template #default="{ row }">
            <div class="primary-text">{{ row.stepOrder }}. {{ row.stepName }}</div>
            <div class="secondary-text">{{ row.stepCode }}</div>
            <div
              v-if="row.status === 'assigned' && !row.canStart"
              class="blocked-reason"
            >
              {{ row.startBlockedReason || '开工前置条件尚未满足' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="正常数量"
          min-width="230"
        >
          <template #default="{ row }">
            <div class="quantity-progress-label">
              <strong>{{ formatQuantity(row.effectiveNormalQuantity) }}</strong>
              <span>/ {{ formatQuantity(row.requiredNormalQuantity) }} {{ row.unit }}</span>
            </div>
            <el-progress
              :percentage="workerTaskProgressPercentage(row)"
              :stroke-width="6"
              :show-text="false"
              :status="row.status === 'completed' ? 'success' : undefined"
            />
            <div class="quantity-release">
              <span>剩余 {{ formatQuantity(workerTaskRemainingNormal(row)) }}</span>
              <template v-if="row.status === 'doing'">
                <span>上游放行 {{ formatQuantity(row.releasedNormalQuantity) }}</span>
                <span class="available-quantity"
                  >当前可报 {{ formatQuantity(row.availableNormalQuantity) }}</span
                >
              </template>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="累计异常数"
          min-width="130"
        >
          <template #default="{ row }">
            <strong :class="{ 'abnormal-quantity': workerTaskHasAbnormal(row) }">
              {{ formatQuantity(row.effectiveAbnormalQuantity) }} {{ row.unit }}
            </strong>
            <div
              v-if="workerTaskHasAbnormal(row)"
              class="abnormal-hint"
            >
              已产生待处置异常
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="状态"
          width="110"
        >
          <template #default="{ row }">
            <el-tag :type="stepStatusMeta(row.status).type">
              {{ stepStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="开工时间"
          width="170"
        >
          <template #default="{ row }">{{ formatDateTimeForDisplay(row.startedAt) }}</template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="230"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'assigned'"
              type="primary"
              :loading="startPendingIds.has(row.stepRecordId)"
              :disabled="!row.canStart"
              @click="startTask(row)"
              >开始工序</el-button
            >
            <el-button
              v-if="row.status === 'doing' && row.needRecord"
              type="success"
              :loading="reportPendingIds.has(row.stepRecordId)"
              @click="openReport(row)"
              >提交本次报工</el-button
            >
            <span
              v-else-if="row.status === 'doing' && !row.needRecord"
              class="muted"
              >本工序无需报工</span
            >
            <span
              v-else-if="row.status === 'completed'"
              class="muted"
              >已完成</span
            >
            <span
              v-else-if="row.status === 'pending'"
              class="muted"
              >等待派工</span
            >
          </template>
        </el-table-column>
      </el-table>
    </section>
    <BatchStepReportDialog
      v-model="reportVisible"
      :task="reportTask"
      :submitting="Boolean(reportTask && reportPendingIds.has(reportTask.stepRecordId))"
      @submit="submitReport"
    />
  </div>
</template>

<script setup lang="ts">
import { onActivated, onMounted, ref } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import { BATCH_STEP_STATUS_LABELS } from '@company/constants';
import type { BatchStepStatus, ProductionWorkerTaskItem } from '@company/contracts';
import { EMessage } from '../../utils/message';
import { formatDateTimeForDisplay } from '../../utils/date';
import TableToolbar from '../../components/TableToolbar.vue';
import { formatQuantity, stepStatusMeta } from './production-status';
import {
  workerTaskHasAbnormal,
  workerTaskProgressPercentage,
  workerTaskRemainingNormal,
  workerTaskRiskClass,
} from './production-worker-task-presentation';
import { useWorkerTasks } from './composables/useWorkerTasks';
import BatchStepReportDialog from './components/BatchStepReportDialog.vue';

defineOptions({ name: 'ProductionWorkerTasksPage' });

const { tasks, loading, startPendingIds, reportPendingIds, load, start, report } = useWorkerTasks();
const reportVisible = ref(false);
const reportTask = ref<ProductionWorkerTaskItem | null>(null);
const stepStatusLabel = (status: BatchStepStatus): string => BATCH_STEP_STATUS_LABELS[status];
const workerTaskRowClass = ({ row }: { row: ProductionWorkerTaskItem }): string =>
  workerTaskRiskClass(row);
const reload = async (): Promise<void> => {
  try {
    await load();
  } catch (error) {
    EMessage.error(error, '本人任务加载失败');
  }
};
const startTask = async (task: ProductionWorkerTaskItem): Promise<void> => {
  try {
    await start(task);
    EMessage.success('工序已开始，开工时间已由系统记录');
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    const fallback =
      code === 'NOT_STEP_ASSIGNEE'
        ? '该工序已改派，请刷新本人任务'
        : code === 'STEP_START_NOT_ALLOWED'
          ? '开工前置条件尚未满足，请刷新后查看原因'
          : code === 'CONCURRENT_MODIFICATION'
            ? '工序状态已变化，请刷新后重试'
            : '工序开工失败';
    EMessage.error(error, fallback);
  }
};
const openReport = (task: ProductionWorkerTaskItem): void => {
  reportTask.value = task;
  reportVisible.value = true;
};
const submitReport = async (payload: {
  normalQuantity: number;
  abnormalQuantity: number;
  remark: string | null;
}): Promise<void> => {
  if (!reportTask.value) return;
  try {
    await report(
      reportTask.value,
      payload.normalQuantity,
      payload.abnormalQuantity,
      payload.remark,
    );
    reportVisible.value = false;
    EMessage.success('本次报工已记录');
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    const fallback =
      code === 'STEP_REPORT_QUANTITY_EXCEEDED'
        ? '正常数量超过上游当前放行的可报数量，请刷新后重试'
        : code === 'NOT_STEP_ASSIGNEE'
          ? '该工序已改派，请刷新本人任务'
          : code === 'CONCURRENT_MODIFICATION'
            ? '工序数据已变化，请刷新后重新报工'
            : '报工失败';
    EMessage.error(error, fallback);
  }
};

onMounted(reload);
onActivated(reload);
</script>

<style scoped>
.worker-tasks-page {
  display: grid;
  gap: 16px;
}
.table-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
}
.table-panel {
  overflow: hidden;
}
.table-panel :deep(.table-toolbar) {
  min-height: 56px;
  align-items: center;
  border-bottom: 1px solid #e5e7eb;
}
.tasks-caption {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.tasks-caption strong {
  color: #1f2937;
  font-size: 16px;
}
.tasks-caption span {
  color: #6b7280;
  font-size: 12px;
}
.execution-tip {
  margin: 12px 16px;
  width: auto;
}
.table-panel :deep(.el-table) {
  border-top: 1px solid #e5e7eb;
}
.worker-tasks-table :deep(.risk-error-row > td:first-child) {
  box-shadow: inset 3px 0 0 #ef4444;
}
.worker-tasks-table :deep(.risk-warning-row > td:first-child) {
  box-shadow: inset 3px 0 0 #f59e0b;
}
.primary-text {
  color: #1f2937;
  font-weight: 600;
}
.secondary-text {
  margin-top: 2px;
  color: #6b7280;
  font-size: 12px;
}
.blocked-reason {
  display: block;
  margin-top: 6px;
  color: #b45309;
  font-size: 12px;
}
.muted {
  color: #9ca3af;
  font-size: 13px;
}
.quantity-release {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 4px;
  color: #6b7280;
  font-size: 12px;
}
.quantity-progress-label {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 6px;
}
.quantity-progress-label strong {
  color: #1f2937;
  font-weight: 600;
}
.quantity-progress-label span {
  color: #6b7280;
  font-size: 12px;
}
.worker-tasks-table :deep(.el-progress-bar__outer) {
  background: #e5e7eb;
}
.worker-tasks-table :deep(.el-progress-bar__inner) {
  background: #306188;
}
.available-quantity {
  color: #306188;
  font-weight: 600;
}
.abnormal-quantity,
.abnormal-hint {
  color: #ef4444;
}
.abnormal-hint {
  margin-top: 3px;
  font-size: 12px;
  font-weight: 500;
}
</style>
