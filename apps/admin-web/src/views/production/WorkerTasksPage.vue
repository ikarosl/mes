<template>
  <div class="worker-tasks-page">
    <section class="page-heading">
      <div>
        <h1>我的工序</h1>
        <p>查看已派给我的现场工序；开工时间由服务端在点击开始时记录。</p>
      </div>
      <el-button
        :icon="Refresh"
        :loading="loading"
        @click="reload"
        >刷新</el-button
      >
    </section>

    <section class="table-panel">
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
          <template #default="{ row }">{{ row.stepOrder }}. {{ row.stepName }}</template>
        </el-table-column>
        <el-table-column
          label="正常数量进度"
          min-width="170"
        >
          <template #default="{ row }">
            {{ formatQuantity(row.effectiveNormalQuantity) }} /
            {{ formatQuantity(row.requiredNormalQuantity) }} {{ row.unit }}
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
          width="190"
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
            <span
              v-else-if="row.status !== 'assigned'"
              class="muted"
              >无需开工操作</span
            >
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onActivated, onMounted } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import { BATCH_STEP_STATUS_LABELS } from '@company/constants';
import type { BatchStepStatus, ProductionWorkerTaskItem } from '@company/contracts';
import { EMessage } from '../../utils/message';
import { formatDateTimeForDisplay } from '../../utils/date';
import { formatQuantity, stepStatusMeta } from './production-status';
import { useWorkerTasks } from './composables/useWorkerTasks';

defineOptions({ name: 'ProductionWorkerTasksPage' });

const { tasks, loading, startPendingIds, load, start } = useWorkerTasks();
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

onMounted(reload);
onActivated(reload);
</script>

<style scoped>
.worker-tasks-page {
  display: grid;
  gap: 16px;
}
.page-heading,
.table-panel {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}
.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
}
.page-heading h1 {
  margin: 0;
  color: #111827;
  font-size: 22px;
}
.page-heading p {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 14px;
}
.table-panel {
  padding: 16px;
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
</style>
