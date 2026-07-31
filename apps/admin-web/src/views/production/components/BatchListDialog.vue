<template>
  <el-dialog
    :model-value="visible"
    title="生产批次"
    :width="DialogWidth.xl"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template v-if="order">
      <div class="task-toolbar">
        <div>
          <span class="order-no">{{ order.workOrderNo }}</span>
          <span class="sub-text">
            计划 {{ formatQuantity(order.plannedQuantity) }}， 已分配
            {{ formatQuantity(order.assignedQuantity) }}
          </span>
        </div>
        <el-button
          type="primary"
          :icon="Plus"
          :disabled="!canCreateBatch"
          @click="$emit('create-batch')"
        >
          新增生产批次
        </el-button>
      </div>
      <el-table
        :data="batches"
        class="detail-table"
      >
        <el-table-column
          prop="batchNo"
          label="生产批次号"
          min-width="160"
        />
        <el-table-column
          label="计划数量"
          width="120"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.plannedQuantity) }}</template>
        </el-table-column>
        <el-table-column
          label="计划开始"
          width="110"
        >
          <template #default="{ row }">{{ formatDateForDisplay(row.planStartDate) }}</template>
        </el-table-column>
        <el-table-column
          label="计划完成"
          width="110"
        >
          <template #default="{ row }">{{ formatDateForDisplay(row.planEndDate) }}</template>
        </el-table-column>
        <el-table-column
          label="任务状态"
          width="130"
        >
          <template #default="{ row }">
            <el-tag
              :type="batchStatusMeta(row.status).type"
              effect="light"
            >
              {{ batchStatusMeta(row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="负责人"
          width="120"
        >
          <template #default="{ row }">{{ row.ownerName || '-' }}</template>
        </el-table-column>
        <el-table-column
          label="完成/合格"
          width="150"
          align="right"
        >
          <template #default="{ row }"
            >{{ formatQuantity(row.completedQuantity) }} /
            {{ formatQuantity(row.qualifiedQuantity) }}</template
          >
        </el-table-column>
        <el-table-column
          label="操作"
          width="90"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="$emit('edit-batch', row)"
              >编辑</el-button
            >
          </template>
        </el-table-column>
      </el-table>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { Plus } from '@element-plus/icons-vue';
import type { ProductionBatchItem, WorkOrderItem } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateForDisplay } from '../../../utils/date';
import { batchStatusMeta, formatQuantity } from '../production-status';

defineProps<{
  visible: boolean;
  order: WorkOrderItem | null;
  batches: ProductionBatchItem[];
  canCreateBatch: boolean;
}>();

defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'create-batch'): void;
  (e: 'edit-batch', row: ProductionBatchItem): void;
}>();
</script>

<style scoped>
.task-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 0 12px;
  border-bottom: 1px solid #e5e7eb;
}
.task-toolbar :deep(.el-button) {
  height: 34px;
  border-radius: 6px;
}
.order-no {
  color: #1f2937;
  font-weight: 600;
}
.sub-text {
  margin-left: 8px;
  color: #6b7280;
  font-size: 12px;
}
.detail-table {
  width: 100%;
  margin-top: 12px;
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
.detail-table :deep(.el-tag) {
  height: 22px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  line-height: 22px;
}
.detail-table :deep(.el-tag--success) {
  background: #dcfce7;
  color: #22c55e;
}
.detail-table :deep(.el-tag--info) {
  background: #f3f4f6;
  color: #6b7280;
}
.detail-table :deep(.el-tag--danger) {
  background: #fce8e8;
  color: #ef4444;
}
.detail-table :deep(.el-tag--primary) {
  background: #e8f0fe;
  color: #306188;
}
.detail-table :deep(.el-button.is-link) {
  padding: 0;
  font-weight: 500;
}
</style>
