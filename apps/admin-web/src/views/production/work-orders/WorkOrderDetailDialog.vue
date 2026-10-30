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
      <div class="order-identity">
        <div class="order-heading">
          <strong>{{ order.workOrderNo }}</strong>
          <el-tag
            :type="taskTypeTagType(order.orderType)"
            effect="light"
            >{{ WORK_ORDER_TYPE_LABELS[order.orderType] }}</el-tag
          >
          <el-tag :type="orderStatusMeta(order.status).type">
            {{ orderStatusMeta(order.status).label }}
          </el-tag>
        </div>
        <div class="product-heading">
          <strong>{{ order.productName }}</strong>
          <span>{{ order.productCode }}</span>
        </div>
      </div>
      <el-descriptions
        class="order-descriptions"
        :column="2"
        border
      >
        <el-descriptions-item label="负责人">{{
          order.ownerName || order.workOrderOwnerId || '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="客户名称">{{
          order.customerName || '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="外部订单号">{{
          order.externalOrderNo || '-'
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
        <el-descriptions-item
          label="创建时间"
          :span="2"
          >{{ formatDateTimeForDisplay(order.createdAt) }}</el-descriptions-item
        >
        <el-descriptions-item
          label="备注"
          :span="2"
          ><span class="multiline-text">{{ order.remark || '-' }}</span></el-descriptions-item
        >
      </el-descriptions>

      <section
        class="detail-section"
        aria-label="计划与审定产出"
      >
        <h3 class="dialog-section-title">计划与审定产出</h3>
        <el-descriptions
          class="order-descriptions"
          :column="3"
          border
        >
          <el-descriptions-item label="计划数量"
            ><strong>{{ formatQuantity(order.plannedQuantity) }}</strong></el-descriptions-item
          >
          <el-descriptions-item label="已分配"
            ><strong>{{ formatQuantity(order.assignedQuantity) }}</strong></el-descriptions-item
          >
          <el-descriptions-item label="已终止计划">
            {{ formatQuantity(order.terminatedPlannedQuantity) }}
            <div class="field-note">不计入已分配</div>
          </el-descriptions-item>
          <el-descriptions-item label="审定计划内产出">{{
            formatQuantity(order.finalOutput?.availableQuantity)
          }}</el-descriptions-item>
          <el-descriptions-item label="审定计划外产出">{{
            formatQuantity(order.finalOutput?.extraQuantity)
          }}</el-descriptions-item>
          <el-descriptions-item label="审定报废合计"
            ><strong :class="{ 'text-danger': Number(order.finalOutput?.scrapQuantity) > 0 }">{{
              formatQuantity(order.finalOutput?.scrapQuantity)
            }}</strong></el-descriptions-item
          >
          <el-descriptions-item label="审定可用产出合计"
            ><strong>{{
              formatQuantity(approvedUsableQuantity(order.finalOutput))
            }}</strong></el-descriptions-item
          >
          <el-descriptions-item label="计划内产出与计划比较">
            <strong :class="{ 'text-warning': Number(plannedGap) !== 0 }">{{
              plannedOutputGapText(plannedGap)
            }}</strong>
            <div class="field-note">未批准任务尚未计入</div>
          </el-descriptions-item>
          <el-descriptions-item label="待结案（未计入）">
            <strong :class="{ 'text-warning': (order.finalOutput?.closingBatchCount ?? 0) > 0 }"
              >{{ order.finalOutput?.closingBatchCount ?? 0 }} 批</strong
            >
            <div class="field-note">
              草稿计划内 {{ formatQuantity(order.finalOutput?.pendingAvailableQuantity) }}
            </div>
          </el-descriptions-item>
        </el-descriptions>
        <InlineHint class="output-note">
          <div>
            已终止/取消的任务，不计入已分配。
            <span v-if="Number(order.terminatedPlannedQuantity) > 0">
              已终止任务曾分配 {{ formatQuantity(order.terminatedPlannedQuantity) }}。
            </span>
          </div>
          <div class="text-danger">已终止任务可能存在产出，请结合已有产出核对任务分配数量。</div>
        </InlineHint>
      </section>

      <section
        v-if="order.status === 'cancelled'"
        class="detail-section"
        aria-label="取消记录"
      >
        <h3 class="dialog-section-title">取消记录</h3>
        <el-descriptions
          class="order-descriptions"
          :column="2"
          border
        >
          <el-descriptions-item label="取消人">{{
            order.cancelledByName || order.cancelledBy || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="取消时间">{{
            formatDateTimeForDisplay(order.cancelledAt)
          }}</el-descriptions-item>
          <el-descriptions-item
            label="取消原因"
            :span="2"
            ><span class="multiline-text">{{
              order.cancelReason || '历史数据未记录'
            }}</span></el-descriptions-item
          >
        </el-descriptions>
      </section>
      <section
        v-if="order.status === 'closed'"
        class="detail-section"
        aria-label="关闭记录"
      >
        <h3 class="dialog-section-title">关闭记录</h3>
        <el-descriptions
          class="order-descriptions"
          :column="2"
          border
        >
          <el-descriptions-item label="关闭类型">{{
            closeTypeLabels[order.closeType ?? ''] || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="关闭人">{{
            order.closedByName || order.closedBy || '-'
          }}</el-descriptions-item>
          <el-descriptions-item
            label="关闭时间"
            :span="2"
            >{{ formatDateTimeForDisplay(order.closedAt) }}</el-descriptions-item
          >
          <el-descriptions-item
            v-if="order.closeType !== 'completed_archive'"
            label="关闭原因"
            :span="2"
            ><span class="multiline-text">{{
              order.closeReason || '历史数据未记录'
            }}</span></el-descriptions-item
          >
        </el-descriptions>
      </section>

      <section
        v-if="order.orderType === 'research'"
        class="detail-section"
      >
        <div class="section-heading">
          <h3 class="dialog-section-title">研发轮次关联</h3>
          <el-button
            v-if="canStartNextResearchRound(order)"
            type="primary"
            size="small"
            plain
            @click="$emit('next-research-round', order)"
            >开启下一轮研发</el-button
          >
        </div>
        <p
          v-if="order.previousResearchOrder"
          class="research-reference"
        >
          前序工单：<strong>{{ order.previousResearchOrder.workOrderNo }}</strong>
          <el-button
            link
            type="primary"
            @click="$emit('view-research-order', order.previousResearchOrder.id)"
          >
            查看工单
          </el-button>
          · {{ order.previousResearchOrder.productCode }} ·
          <el-tag :type="orderStatusMeta(order.previousResearchOrder.status).type">
            {{ orderStatusMeta(order.previousResearchOrder.status).label }}
          </el-tag>
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
              <div class="research-order">
                <strong>{{ row.workOrderNo }}</strong>
                <el-button
                  link
                  type="primary"
                  @click="$emit('view-research-order', row.id)"
                  >查看工单</el-button
                >
              </div>
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
            ><template #default="{ row }"
              ><el-tag :type="orderStatusMeta(row.status).type">{{
                orderStatusMeta(row.status).label
              }}</el-tag></template
            ></el-table-column
          >
        </el-table>
        <p
          v-if="!order.previousResearchOrder && !order.nextResearchOrders.length"
          class="research-note"
        >
          暂无前后序研发工单关联，用于追溯不同研发轮次。
          <span v-if="!canStartNextResearchRound(order) && order.status !== 'cancelled'"
            >本轮已完工或关闭后，可开启下一轮研发。</span
          >
        </p>
      </section>

      <section
        class="detail-section"
        aria-label="生产批次"
      >
        <h3 class="dialog-section-title">
          生产批次 <span class="section-count">{{ order.batches.length }} 批</span>
        </h3>
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
            min-width="140"
            align="right"
          >
            <template #default="{ row }">{{ formatQuantity(row.plannedQuantity) }}</template>
          </el-table-column>
          <el-table-column
            label="当前批准产出"
            min-width="230"
          >
            <template #default="{ row }"
              ><BatchApprovedOutput :output="row.finalOutput"
            /></template>
          </el-table-column>
          <el-table-column
            label="任务状态"
            width="160"
          >
            <template #default="{ row }"
              ><el-tag :type="batchStatusMeta(row.status).type">{{
                batchStatusMeta(row.status).label
              }}</el-tag></template
            >
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
      </section>
    </template>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">关闭</el-button>
      <el-button
        :loading="loading"
        @click="$emit('refresh')"
        >刷新详情</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { WORK_ORDER_TYPE_LABELS, WORK_ORDER_CLOSE_TYPE_LABELS } from '@company/constants';
import type { WorkOrderCloseType, WorkOrderDetail } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import InlineHint from '../../../components/InlineHint.vue';
import BatchApprovedOutput from '../shared/BatchApprovedOutput.vue';
import { approvedUsableQuantity, plannedOutputGapText } from '../shared/production-output-quantity';
import { canStartNextResearchRound } from './research-work-order';
import { formatDateForDisplay, formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../../utils/quantity';
import { batchStatusMeta, orderStatusMeta } from '../shared/production-status';
import { taskTypeTagType } from '../shared/production-task-presentation';

const props = defineProps<{
  visible: boolean;
  loading?: boolean;
  order: WorkOrderDetail | null;
}>();

defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'refresh'): void;
  (e: 'view-research-order', id: string): void;
  (e: 'next-research-round', order: WorkOrderDetail): void;
}>();

const plannedGap = computed(
  () => props.order?.finalOutput?.plannedShortfallQuantity ?? props.order?.plannedQuantity ?? 0,
);
const closeTypeLabels: Record<WorkOrderCloseType | '', string> = {
  '': '',
  ...WORK_ORDER_CLOSE_TYPE_LABELS,
};
</script>

<style scoped>
.order-identity {
  margin-bottom: 16px;
  color: var(--el-text-color-primary);
  overflow-wrap: anywhere;
}
.order-heading,
.product-heading,
.research-order {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.order-heading > strong {
  font-size: 16px;
}
.product-heading {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.6;
}
.product-heading > span {
  color: var(--el-text-color-regular);
}
.order-descriptions :deep(.el-descriptions__table) {
  table-layout: fixed;
}
.order-descriptions :deep(.el-descriptions__body .el-descriptions__table .el-descriptions__cell) {
  padding: 8px 12px;
  font-size: 14px;
  line-height: 1.6;
  vertical-align: middle;
  overflow-wrap: anywhere;
}
.order-descriptions :deep(.el-descriptions__label) {
  width: 120px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-weight: 500;
}
.order-descriptions :deep(.el-descriptions__content) {
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}
.order-descriptions strong {
  font-weight: 600;
}
.text-warning {
  color: var(--el-color-warning);
}
.text-danger {
  color: var(--el-color-danger);
}
.multiline-text {
  white-space: pre-wrap;
}
.field-note {
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.6;
}
.output-note {
  margin: 10px 0 0;
}
.detail-section {
  margin-top: 20px;
}
.dialog-section-title {
  margin: 0 0 12px;
  color: var(--el-text-color-primary);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.6;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 12px;
}
.section-heading .dialog-section-title {
  margin: 0;
}
.section-count {
  margin-left: 8px;
  color: var(--el-text-color-regular);
  font-weight: 400;
}
.research-note {
  margin: 0;
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.6;
}
.research-reference {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.detail-table {
  width: 100%;
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.detail-table :deep(.el-table__header th) {
  height: 48px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.detail-table :deep(.el-table__row) {
  height: 48px;
}
.detail-table :deep(.cell) {
  overflow-wrap: anywhere;
}
.empty-hint {
  padding: 16px;
  text-align: center;
  color: var(--el-text-color-regular);
  font-size: 14px;
}
</style>
