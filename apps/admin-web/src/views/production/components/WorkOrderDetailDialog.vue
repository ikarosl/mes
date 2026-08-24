<template>
  <el-dialog
    :model-value="visible"
    title="工单详情"
    :width="DialogWidth.xl"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template v-if="order">
      <el-descriptions
        :column="3"
        border
      >
        <el-descriptions-item label="工单号">{{ order.workOrderNo }}</el-descriptions-item>
        <el-descriptions-item label="产品">{{ order.productName }}</el-descriptions-item>
        <el-descriptions-item label="产品编码">{{ order.productCode }}</el-descriptions-item>
        <el-descriptions-item label="计划数量">{{
          formatQuantity(order.plannedQuantity)
        }}</el-descriptions-item>
        <el-descriptions-item label="已分配">{{
          formatQuantity(order.assignedQuantity)
        }}</el-descriptions-item>
        <el-descriptions-item label="外部订单号">{{
          order.externalOrderNo || '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="负责人">{{
          resolveOwnerName(order.workOrderOwnerId, userOptions)
        }}</el-descriptions-item>
        <el-descriptions-item label="客户名称">{{
          order.customerName || '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="质量等级">{{
          order.qualityLevel || '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="计划开始">{{
          formatDateForDisplay(order.planStartDate)
        }}</el-descriptions-item>
        <el-descriptions-item label="计划完成">{{
          formatDateForDisplay(order.planEndDate)
        }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{
          orderStatusMeta(order.status).label
        }}</el-descriptions-item>
        <el-descriptions-item label="版本号">{{ order.version }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{
          formatDateForDisplay(order.createdAt)
        }}</el-descriptions-item>
        <template v-if="order.status === 'cancelled'">
          <el-descriptions-item label="取消人">{{
            order.cancelledByName || order.cancelledBy || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="取消时间">{{
            formatDateTimeForDisplay(order.cancelledAt)
          }}</el-descriptions-item>
          <el-descriptions-item
            label="取消原因"
            :span="3"
            >{{ order.cancelReason || '历史数据未记录' }}</el-descriptions-item
          >
        </template>
        <template v-if="order.status === 'closed'">
          <el-descriptions-item label="关闭类型">{{
            closeTypeLabels[order.closeType ?? ''] || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="关闭人">{{
            order.closedByName || order.closedBy || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="关闭时间">{{
            formatDateTimeForDisplay(order.closedAt)
          }}</el-descriptions-item>
          <el-descriptions-item
            v-if="order.closeType !== 'completed_archive'"
            label="关闭原因"
            :span="3"
            >{{ order.closeReason || '历史数据未记录' }}</el-descriptions-item
          >
        </template>
        <el-descriptions-item
          label="备注"
          :span="3"
          >{{ order.remark || '-' }}</el-descriptions-item
        >
      </el-descriptions>

      <div class="dialog-section-title">生产批次</div>
      <el-table
        v-if="order.batches?.length"
        :data="order.batches"
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
          label="完成/合格"
          width="160"
          align="right"
        >
          <template #default="{ row }"
            >{{ formatQuantity(row.completedQuantity) }} /
            {{ formatQuantity(row.qualifiedQuantity) }}</template
          >
        </el-table-column>
        <el-table-column
          label="任务状态"
          width="120"
        >
          <template #default="{ row }">{{ batchStatusMeta(row.status).label }}</template>
        </el-table-column>
        <el-table-column
          label="负责人"
          width="120"
        >
          <template #default="{ row }">{{ row.ownerName || '-' }}</template>
        </el-table-column>
      </el-table>
      <div
        v-else
        class="empty-hint"
      >
        暂无生产批次
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { UserOption, WorkOrderCloseType, WorkOrderDetail } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateForDisplay, formatDateTimeForDisplay } from '../../../utils/date';
import {
  batchStatusMeta,
  formatQuantity,
  orderStatusMeta,
  resolveOwnerName,
} from '../production-status';

defineProps<{
  visible: boolean;
  order: WorkOrderDetail | null;
  userOptions: UserOption[];
}>();

defineEmits<{
  (e: 'update:visible', val: boolean): void;
}>();

const closeTypeLabels: Record<WorkOrderCloseType | '', string> = {
  '': '',
  unproduced: '未生产结案',
  underproduced: '不足量结案',
  completed_archive: '完工归档',
};
</script>

<style scoped>
.dialog-section-title {
  margin: 20px 0 12px;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
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
.empty-hint {
  padding: 24px;
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
}
</style>
