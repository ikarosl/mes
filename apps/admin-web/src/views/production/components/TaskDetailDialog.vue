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
              label="实际负责人"
              width="130"
            >
              <template #default="{ row }">{{
                row.responsibleUserName || row.defaultResponsibleUserName || '-'
              }}</template>
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
              width="90"
              fixed="right"
            >
              <template #default="{ row }">
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
          <!-- TODO(api-integration): 工序开工/完工和幂等的 batch_step_reports 报工/更正接口尚未落地。 -->
        </el-tab-pane>
        <el-tab-pane label="物料需求">
          <!-- TODO(api-integration): 物料需求列表需要后端 production_item_demand 查询接口 -->
          <div class="empty-hint">物料需求可通过「生成物料」按钮生成</div>
        </el-tab-pane>
      </el-tabs>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { BatchStepRecordItem, ProductionBatchDetail } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { STEP_STATUS_LABELS, batchStatusMeta, formatQuantity } from '../production-status';

defineProps<{
  visible: boolean;
  batch: ProductionBatchDetail | null;
}>();

defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'edit-step-execution', row: BatchStepRecordItem): void;
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
