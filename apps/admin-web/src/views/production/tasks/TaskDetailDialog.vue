<template>
  <el-dialog
    :model-value="visible"
    title="任务详情"
    :width="DialogWidth.lg"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div class="detail-toolbar">
      <strong>{{ batch?.batchNo || '任务详情' }}</strong>
      <div>
        <el-button
          v-if="
            batch?.orderType === 'mass_production' &&
            canAccessRoute({ name: 'production-tracking' })
          "
          type="primary"
          plain
          @click="openTracking"
          >工序追踪与报工历史</el-button
        ><el-button
          :loading="loading"
          @click="$emit('refresh')"
          >刷新详情</el-button
        >
      </div>
    </div>
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      show-icon
    />
    <div v-loading="loading">
      <el-descriptions
        v-if="batch"
        :column="2"
        border
      >
        <el-descriptions-item label="工单">{{ batch.workOrderNo }}</el-descriptions-item
        ><el-descriptions-item label="类型">{{
          WORK_ORDER_TYPE_LABELS[batch.orderType]
        }}</el-descriptions-item>
        <el-descriptions-item label="产品"
          >{{ batch.productCode }} / {{ batch.productName }}</el-descriptions-item
        ><el-descriptions-item label="状态"
          ><el-tag :type="batchStatusMeta(batch.status).type">{{
            batchStatusMeta(batch.status).label
          }}</el-tag></el-descriptions-item
        >
        <el-descriptions-item label="计划数量">{{
          formatQuantity(batch.plannedQuantity)
        }}</el-descriptions-item
        ><el-descriptions-item label="实际最终产出"
          ><BatchApprovedOutput :output="batch.finalOutput"
        /></el-descriptions-item>
        <el-descriptions-item label="负责人">{{ batch.ownerName || '未指定' }}</el-descriptions-item
        ><el-descriptions-item label="工艺路线"
          >{{ batch.routeCode || '无路线' }} {{ batch.routeVersion || '' }}</el-descriptions-item
        >
        <el-descriptions-item label="计划日期"
          >{{ formatDateForDisplay(batch.planStartDate, '未设置') }} 至
          {{ formatDateForDisplay(batch.planEndDate, '未设置') }}</el-descriptions-item
        ><el-descriptions-item label="开工时间">{{
          formatDateTimeForDisplay(batch.startedAt, '尚未开工')
        }}</el-descriptions-item>
        <el-descriptions-item label="结束时间">{{
          formatDateTimeForDisplay(batch.completedAt, '尚未结束')
        }}</el-descriptions-item
        ><el-descriptions-item label="结束原因">{{
          batch.finishReason || batch.cancelReason || '—'
        }}</el-descriptions-item
        ><el-descriptions-item
          label="备注"
          :span="2"
          >{{ batch.remark || '—' }}</el-descriptions-item
        >
      </el-descriptions>
    </div>
    <template #footer><el-button @click="$emit('update:visible', false)">关闭</el-button></template>
  </el-dialog>
</template>
<script setup lang="ts">
import { useRouter } from 'vue-router';
import { WORK_ORDER_TYPE_LABELS } from '@company/constants';
import type { ProductionBatchDetail } from '@company/contracts';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateForDisplay, formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../../utils/quantity';
import { batchStatusMeta } from '../shared/production-status';
import BatchApprovedOutput from '../shared/BatchApprovedOutput.vue';
const props = defineProps<{
  visible: boolean;
  batch: ProductionBatchDetail | null;
  loading?: boolean;
  error?: string;
}>();
defineEmits<{ (event: 'update:visible', value: boolean): void; (event: 'refresh'): void }>();
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
async function openTracking(): Promise<void> {
  if (props.batch)
    await router.push({ name: 'production-tracking', query: { batchId: props.batch.id } });
}
</script>
<style scoped>
.detail-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.detail-toolbar > strong {
  font-size: 16px;
}
</style>
