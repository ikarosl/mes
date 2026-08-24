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
        title="只有当前负责人可以开工，开工时间由系统记录；正常报工与异常报工分别提交本次数量，不填写累计数。异常报工会自动生成待处置记录。"
      />
      <el-table
        v-loading="loading"
        :data="tasks"
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
          <template #default="{ row }">{{ row.productCode }} / {{ row.productName }}</template>
        </el-table-column>
        <el-table-column
          label="工序"
          min-width="170"
        >
          <template #default="{ row }">
            {{ row.stepOrder }}. {{ row.stepName }}
            <div class="step-flags">
              <el-tag
                v-if="Number(row.pendingSupplementInputQuantity) > 0"
                size="small"
                type="warning"
                effect="plain"
                >待补料激活</el-tag
              >
              <el-tag
                v-if="row.isSupplementReopened"
                size="small"
                type="warning"
                >补产重开</el-tag
              >
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="SOP"
          min-width="190"
        >
          <template #default="{ row }">
            <template v-if="row.sopFileName">
              <div>{{ row.sopFileName }}</div>
              <el-button
                link
                type="primary"
                :loading="sopPendingIds.has(row.stepRecordId)"
                @click="downloadSop(row)"
                >下载 SOP</el-button
              >
            </template>
            <span
              v-else
              class="muted"
              >未配置</span
            >
          </template>
        </el-table-column>
        <el-table-column
          label="正常数量进度"
          min-width="170"
        >
          <template #default="{ row }">
            {{ formatQuantity(row.effectiveNormalQuantity) }} /
            {{ formatQuantity(row.requiredNormalQuantity) }} {{ row.unit }}
            <div
              v-if="Number(row.activatedSupplementTargetQuantity) > 0"
              class="quantity-supplement"
            >
              计划 {{ formatQuantity(row.baseNormalQuantity) }} + 下游补产
              {{ formatQuantity(row.activatedSupplementTargetQuantity) }}
            </div>
            <div
              v-if="row.status === 'doing'"
              class="quantity-release"
            >
              放行 {{ formatQuantity(row.releasedNormalQuantity) }}，普通报工已占用
              {{ formatQuantity(row.effectiveDirectReportedQuantity) }}，当前可报
              {{ formatQuantity(row.availableNormalQuantity) }} {{ row.unit }}
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="累计异常数"
          min-width="130"
        >
          <template #default="{ row }">
            {{ formatQuantity(row.effectiveAbnormalQuantity) }} {{ row.unit }}
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
          width="300"
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
            <span
              v-if="row.status === 'assigned' && !row.canStart"
              class="blocked-reason"
              >{{ row.startBlockedReason }}</span
            >
            <el-button
              v-if="row.status === 'doing' && row.needRecord"
              type="success"
              :loading="reportPendingIds.has(row.stepRecordId)"
              :disabled="Number(row.availableNormalQuantity) <= 0"
              @click="openReport(row, 'normal')"
              >正常报工</el-button
            >
            <el-button
              v-if="row.status === 'doing' && row.needRecord"
              type="danger"
              plain
              :loading="reportPendingIds.has(row.stepRecordId)"
              :disabled="Number(row.availableNormalQuantity) <= 0"
              @click="openReport(row, 'abnormal')"
              >异常报工</el-button
            >
            <el-button
              v-else-if="row.status === 'doing'"
              type="success"
              :loading="completePendingIds.has(row.stepRecordId)"
              :disabled="!row.canComplete"
              @click="completeTask(row)"
              >完成工序</el-button
            >
            <span
              v-if="row.status === 'doing' && !row.needRecord && !row.canComplete"
              class="blocked-reason"
              >{{ row.completeBlockedReason }}</span
            >
            <span
              v-if="row.status === 'doing' && row.needRecord && row.supplementBlockedReason"
              class="blocked-reason"
              >{{ row.supplementBlockedReason }}</span
            >
            <span
              v-else-if="row.status !== 'assigned' && row.status !== 'doing'"
              class="muted"
              >无需开工操作</span
            >
          </template>
        </el-table-column>
      </el-table>
    </section>
    <BatchStepReportDialog
      v-model="reportVisible"
      :task="reportTask"
      :mode="reportMode"
      :submitting="Boolean(reportTask && reportPendingIds.has(reportTask.stepRecordId))"
      :intent-status="reportTask ? getReportIntentStatus(reportTask.stepRecordId) : 'idle'"
      @reset-intent="reportTask && resetReportIntent(reportTask.stepRecordId)"
      @submit="submitReport"
    />
  </div>
</template>

<script setup lang="ts">
import { onActivated, onMounted, ref } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import { BATCH_STEP_STATUS_LABELS } from '@company/constants';
import type {
  BatchStepAbnormalOrigin,
  BatchStepStatus,
  ProductionWorkerTaskItem,
} from '@company/contracts';
import { EMessage } from '../../utils/message';
import { productionApi } from '../../api/production';
import { formatDateTimeForDisplay } from '../../utils/date';
import TableToolbar from '../../components/TableToolbar.vue';
import { formatQuantity, stepStatusMeta } from './production-status';
import { useWorkerTasks } from './composables/useWorkerTasks';
import BatchStepReportDialog from './components/BatchStepReportDialog.vue';

defineOptions({ name: 'ProductionWorkerTasksPage' });

const {
  tasks,
  loading,
  startPendingIds,
  reportPendingIds,
  completePendingIds,
  load,
  start,
  report,
  complete,
  getReportIntentStatus,
  resetReportIntent,
} = useWorkerTasks();
const reportVisible = ref(false);
const reportTask = ref<ProductionWorkerTaskItem | null>(null);
const reportMode = ref<'normal' | 'abnormal'>('normal');
const sopPendingIds = ref(new Set<string>());
const stepStatusLabel = (status: BatchStepStatus): string => BATCH_STEP_STATUS_LABELS[status];
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
const openReport = (task: ProductionWorkerTaskItem, mode: 'normal' | 'abnormal'): void => {
  reportTask.value = task;
  reportMode.value = mode;
  reportVisible.value = true;
};
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
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    EMessage.error(error, 'SOP 文件下载失败');
  } finally {
    const next = new Set(sopPendingIds.value);
    next.delete(task.stepRecordId);
    sopPendingIds.value = next;
  }
};
const completeTask = async (task: ProductionWorkerTaskItem): Promise<void> => {
  try {
    await complete(task);
    EMessage.success('无需报工工序已完成，完成时间已由系统记录');
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    const fallback =
      code === 'NOT_STEP_ASSIGNEE'
        ? '该工序已改派，请刷新本人任务'
        : code === 'STEP_COMPLETION_NOT_ALLOWED'
          ? '工序完成条件尚未满足，请刷新后查看前置工序状态'
          : code === 'CONCURRENT_MODIFICATION'
            ? '工序状态已变化，请刷新后重试'
            : '工序完成失败';
    EMessage.error(error, fallback);
  }
};
const submitReport = async (payload: {
  normalQuantity: number;
  abnormalQuantity: number;
  abnormalOrigin: BatchStepAbnormalOrigin | null;
  remark: string | null;
}): Promise<void> => {
  if (!reportTask.value) return;
  try {
    await report(
      reportTask.value,
      payload.normalQuantity,
      payload.abnormalQuantity,
      payload.abnormalOrigin,
      payload.remark,
    );
    reportVisible.value = false;
    EMessage.success(reportMode.value === 'normal' ? '正常报工已记录' : '异常报工已提交待处置');
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    const fallback =
      code === 'STEP_REPORT_QUANTITY_EXCEEDED'
        ? '本次报工数量超过上游当前放行的可报数量，请刷新后重试'
        : code === 'INVALID_INPUT'
          ? '正常报工与异常报工必须分别提交，请重新填写'
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
  margin-top: 4px;
  color: #6b7280;
  font-size: 12px;
}
.quantity-supplement {
  margin-top: 4px;
  color: var(--el-color-warning-dark-2);
  font-size: 12px;
}
.step-flags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}
</style>
