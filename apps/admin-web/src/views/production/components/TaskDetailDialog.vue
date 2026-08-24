<template>
  <el-dialog
    :model-value="visible"
    title="任务详情"
    :width="DialogWidth.xl"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template v-if="batch">
      <el-descriptions
        :column="3"
        border
      >
        <el-descriptions-item label="批次号">{{ batch.batchNo }}</el-descriptions-item>
        <el-descriptions-item label="工单号">{{ batch.workOrderNo || '-' }}</el-descriptions-item>
        <el-descriptions-item label="产品">{{ batch.productName }}</el-descriptions-item>
        <el-descriptions-item label="工艺路线">{{ batch.routeCode || '-' }}</el-descriptions-item>
        <el-descriptions-item label="计划数量">{{
          formatQuantity(batch.plannedQuantity)
        }}</el-descriptions-item>
        <el-descriptions-item label="完成/合格"
          >{{ formatQuantity(batch.completedQuantity) }} /
          {{ formatQuantity(batch.qualifiedQuantity) }}</el-descriptions-item
        >
        <el-descriptions-item label="任务状态">{{
          batchStatusMeta(batch.status).label
        }}</el-descriptions-item>
        <el-descriptions-item label="负责人">{{ batch.ownerName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="版本号">{{ batch.version }}</el-descriptions-item>
        <template v-if="batch.status === 'cancelled'">
          <el-descriptions-item label="取消人">{{
            batch.cancelledByName || batch.cancelledBy || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="取消时间">{{
            formatDateTimeForDisplay(batch.cancelledAt)
          }}</el-descriptions-item>
          <el-descriptions-item
            label="取消原因"
            :span="3"
            >{{ batch.cancelReason || '历史数据未记录' }}</el-descriptions-item
          >
        </template>
      </el-descriptions>

      <el-tabs class="detail-tabs">
        <el-tab-pane label="工序执行">
          <el-table
            v-if="batch.stepRecords?.length"
            :data="batch.stepRecords"
            class="detail-table"
          >
            <el-table-column
              prop="stepOrder"
              label="序号"
              width="70"
            />
            <el-table-column
              prop="stepName"
              label="工序"
              min-width="160"
            />
            <el-table-column
              label="工序编码"
              min-width="120"
            >
              <template #default="{ row }">{{ row.stepCode }}</template>
            </el-table-column>
            <el-table-column
              label="默认负责人"
              width="120"
            >
              <template #default="{ row }">{{ row.defaultResponsibleUserName || '-' }}</template>
            </el-table-column>
            <el-table-column
              label="派工负责人"
              width="130"
            >
              <template #default="{ row }">{{ row.responsibleUserName || '尚未派工' }}</template>
            </el-table-column>
            <el-table-column
              label="生效参考文件"
              min-width="180"
            >
              <template #default="{ row }">{{
                row.actualSopFileName || row.defaultSopFileName || '未配置'
              }}</template>
            </el-table-column>
            <el-table-column
              label="需报工"
              width="80"
            >
              <template #default="{ row }">{{ row.needRecord ? '是' : '否' }}</template>
            </el-table-column>
            <el-table-column
              label="需检验"
              width="80"
            >
              <template #default="{ row }">{{ row.needInspection ? '是' : '否' }}</template>
            </el-table-column>
            <el-table-column
              label="状态"
              width="110"
            >
              <template #default="{ row }">{{
                STEP_STATUS_LABELS[row.status] ?? row.status
              }}</template>
            </el-table-column>
            <el-table-column
              label="产出/合格/异常"
              width="170"
            >
              <template #default="{ row }">
                {{ formatQuantity(row.outputQuantity) }} /
                {{ formatQuantity(row.qualifiedQuantity) }} /
                {{ formatQuantity(row.abnormalQuantity) }}
              </template>
            </el-table-column>
            <el-table-column
              label="操作"
              width="220"
              fixed="right"
            >
              <template #default="{ row }">
                <el-button
                  v-if="row.status === 'pending'"
                  link
                  type="primary"
                  :loading="assignmentPendingIds.has(row.id)"
                  @click="$emit('assign-step', row)"
                  >派工</el-button
                >
                <template v-else-if="row.status === 'assigned'">
                  <el-button
                    link
                    type="primary"
                    :loading="assignmentPendingIds.has(row.id)"
                    @click="$emit('reassign-step', row)"
                    >改派</el-button
                  >
                  <el-button
                    link
                    type="danger"
                    :loading="assignmentPendingIds.has(row.id)"
                    @click="$emit('unassign-step', row)"
                    >撤回</el-button
                  >
                </template>
                <el-button
                  link
                  type="primary"
                  :disabled="row.status !== 'pending' && row.status !== 'assigned'"
                  @click="$emit('edit-step-execution', row)"
                  >调整</el-button
                >
              </template>
            </el-table-column>
          </el-table>
          <div
            v-else
            class="empty-hint"
          >
            暂无工序记录
          </div>
          <!-- TODO(4.2-C): batch_step_reports 分批报工、异常展示和管理员更正尚未落地。 -->
        </el-tab-pane>
        <el-tab-pane label="物料需求">
          <div class="empty-hint">
            物料需求、库存批次分配与领料出库统一从任务列表的批次操作入口办理。
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { BatchStepRecordItem, ProductionBatchDetail } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { STEP_STATUS_LABELS, batchStatusMeta, formatQuantity } from '../production-status';

defineProps<{
  visible: boolean;
  batch: ProductionBatchDetail | null;
  assignmentPendingIds: Set<string>;
}>();

defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'edit-step-execution', row: BatchStepRecordItem): void;
  (e: 'assign-step', row: BatchStepRecordItem): void;
  (e: 'reassign-step', row: BatchStepRecordItem): void;
  (e: 'unassign-step', row: BatchStepRecordItem): void;
}>();
</script>

<style scoped>
.detail-tabs {
  margin-top: 18px;
}
.detail-table {
  width: 100%;
  color: #1f2937;
  font-size: 14px;
}
.detail-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
.detail-table :deep(.el-table__row) {
  height: 48px;
}
.detail-table :deep(.el-table__row:hover) {
  background: #f3f4f6;
}
.detail-table :deep(.el-table__cell) {
  border-bottom-color: #e5e7eb;
}
.detail-table :deep(.el-button.is-link) {
  padding: 0;
  font-weight: 500;
}
.empty-hint {
  padding: 24px;
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
}
</style>
