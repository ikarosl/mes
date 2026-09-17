<template>
  <el-dialog
    :model-value="visible"
    title="工单详情"
    :width="DialogWidth.xl"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-skeleton
      v-if="loading"
      :rows="8"
      animated
    />
    <el-alert
      v-else-if="!order"
      type="error"
      title="工单详情未能加载，请关闭后重试"
      :closable="false"
    />
    <template v-else>
      <el-descriptions
        :column="3"
        border
      >
        <el-descriptions-item label="工单号">{{ order.workOrderNo }}</el-descriptions-item>
        <el-descriptions-item label="工单类型">{{
          WORK_ORDER_TYPE_LABELS[order.orderType]
        }}</el-descriptions-item>
        <el-descriptions-item label="产品">{{ order.productName }}</el-descriptions-item>
        <el-descriptions-item label="产品编码">{{ order.productCode }}</el-descriptions-item>
        <el-descriptions-item label="计划数量">{{
          formatQuantity(order.plannedQuantity)
        }}</el-descriptions-item>
        <el-descriptions-item label="已分配">{{
          formatQuantity(order.assignedQuantity)
        }}</el-descriptions-item>
        <el-descriptions-item label="已终止计划（不占额度）">{{
          formatQuantity(order.terminatedPlannedQuantity)
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
        <el-descriptions-item label="审定计划内产出">{{
          formatQuantity(order.finalOutput?.availableQuantity)
        }}</el-descriptions-item>
        <el-descriptions-item label="审定计划外产出">{{
          formatQuantity(order.finalOutput?.extraQuantity)
        }}</el-descriptions-item>
        <el-descriptions-item label="审定报废合计">{{
          formatQuantity(order.finalOutput?.scrapQuantity)
        }}</el-descriptions-item>
        <el-descriptions-item label="审定可用产出合计">{{
          formatQuantity(approvedUsableQuantity(order.finalOutput))
        }}</el-descriptions-item>
        <el-descriptions-item label="计划内产出与计划比较"
          >{{
            plannedOutputGapText(
              order.finalOutput?.plannedShortfallQuantity ?? order.plannedQuantity,
            )
          }}（未批准任务尚未计入）</el-descriptions-item
        >
        <el-descriptions-item label="待结案（未计入）"
          >{{ order.finalOutput?.closingBatchCount ?? 0 }} 批，草稿计划内
          {{ formatQuantity(order.finalOutput?.pendingAvailableQuantity) }}</el-descriptions-item
        >
      </el-descriptions>
      <p class="output-note">
        审定产出仅汇总每个任务的当前批准清单，可用合计不含报废，也不代表已入库。已终止任务的审定产出仍计入，累计量可能超过工单计划。
      </p>

      <section
        v-if="order.orderType === 'research'"
        class="research-rounds"
      >
        <div class="dialog-section-title">研发轮次关联</div>
        <p v-if="order.previousResearchOrder">
          前序工单：
          <el-button
            link
            type="primary"
            @click="$emit('view-research-order', order.previousResearchOrder.id)"
          >
            {{ order.previousResearchOrder.workOrderNo }}
          </el-button>
          · {{ order.previousResearchOrder.productCode }} ·
          {{ orderStatusMeta(order.previousResearchOrder.status).label }}
        </p>
        <p
          v-else
          class="empty-hint"
        >
          本工单未关联前序研发轮次。
        </p>
        <el-table
          v-if="order.nextResearchOrders.length"
          :data="order.nextResearchOrders"
          class="detail-table"
        >
          <el-table-column
            label="后续研发工单"
            min-width="190"
          >
            <template #default="{ row }">
              <el-button
                link
                type="primary"
                @click="$emit('view-research-order', row.id)"
                >{{ row.workOrderNo }}</el-button
              >
            </template>
          </el-table-column>
          <el-table-column
            prop="productCode"
            label="成品编码"
            min-width="180"
          />
          <el-table-column
            prop="productName"
            label="成品名称"
            min-width="180"
          />
          <el-table-column
            label="状态"
            width="120"
            ><template #default="{ row }">{{
              orderStatusMeta(row.status).label
            }}</template></el-table-column
          >
        </el-table>
        <p
          v-else
          class="empty-hint"
        >
          暂无后续研发工单。
        </p>
        <el-button
          v-if="canStartNextResearchRound(order)"
          type="primary"
          plain
          @click="$emit('next-research-round', order)"
          >开启下一轮研发</el-button
        >
      </section>

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
          label="末工序正常报工量"
          width="120"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.lastStepReportedQuantity) }}</template>
        </el-table-column>
        <el-table-column
          label="当前批准产出"
          min-width="230"
        >
          <template #default="{ row }"><BatchApprovedOutput :output="row.finalOutput" /></template>
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
import { WORK_ORDER_TYPE_LABELS, WORK_ORDER_CLOSE_TYPE_LABELS } from '@company/constants';
import type { UserOption, WorkOrderCloseType, WorkOrderDetail } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import BatchApprovedOutput from './BatchApprovedOutput.vue';
import { approvedUsableQuantity, plannedOutputGapText } from '../production-output-quantity';
import { canStartNextResearchRound } from '../research-work-order';
import { formatDateForDisplay, formatDateTimeForDisplay } from '../../../utils/date';
import {
  batchStatusMeta,
  formatQuantity,
  orderStatusMeta,
  resolveOwnerName,
} from '../production-status';

defineProps<{
  visible: boolean;
  loading?: boolean;
  order: WorkOrderDetail | null;
  userOptions: UserOption[];
}>();

defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'view-research-order', id: string): void;
  (e: 'next-research-round', order: WorkOrderDetail): void;
}>();

const closeTypeLabels: Record<WorkOrderCloseType | '', string> = {
  '': '',
  ...WORK_ORDER_CLOSE_TYPE_LABELS,
};
</script>

<style scoped>
.output-note {
  line-height: 1.7;
  color: var(--el-text-color-regular);
}
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
