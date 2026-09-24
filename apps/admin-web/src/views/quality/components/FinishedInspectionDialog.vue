<template>
  <el-dialog
    :model-value="visible"
    title="成品质检"
    :width="DialogWidth.xl"
    workbench
    :close-on-click-modal="false"
    :before-close="editor.close"
    @update:model-value="(value: boolean) => !value && editor.close()"
  >
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      show-icon
    />
    <div v-loading="loading">
      <template v-if="detail">
        <el-descriptions
          :column="3"
          border
        >
          <el-descriptions-item label="工单 / 任务"
            >{{ detail.workOrderNo }} / {{ detail.batchNo }}</el-descriptions-item
          >
          <el-descriptions-item label="成品"
            >{{ detail.productCode }} · {{ detail.productName }}</el-descriptions-item
          >
          <el-descriptions-item label="计划数量">{{
            Number(detail.plannedQuantity)
          }}</el-descriptions-item>
          <el-descriptions-item
            label="当前申报（计划内 / 外 / 报废）"
            :span="3"
            >{{
              detail.declared
                ? `${detail.declared.availableQuantity} / ${detail.declared.extraQuantity} / ${detail.declared.additionalScrapQuantity}`
                : '尚未保存产出草稿'
            }}</el-descriptions-item
          >
        </el-descriptions>
        <el-alert
          v-if="!detail.canRecordInspection"
          title="当前任务暂不能登记检验，请核对产出草稿或审批状态；已有记录仍可查看。"
          type="info"
          :closable="false"
          class="notice"
        />
        <FinishedInspectionPanel
          :detail="detail"
          :inspection="inspection"
          :declared="inspectionDeclared"
          :declared-version="inspectionVersion"
          :inspection-open="inspectionOpen"
          :inspection-stale="inspectionStale"
          :inspection-valid="inspectionValid"
          :busy="busy"
          :unresolved="unresolved"
          :error="error"
          :submitting="submitting"
          @start="editor.startInspection"
          @record="editor.recordInspection"
          @discard="editor.discardInspection"
          @change="editor.changeInspection"
        />
      </template>
      <el-divider content-position="left">检验历史</el-divider>
      <el-alert
        v-if="recordsError"
        :title="recordsError"
        type="error"
        :closable="false"
      />
      <div v-loading="recordsLoading">
        <FinishedInspectionHistory
          :records="records"
          :latest-inspection-id="detail?.latestInspectionId ?? null"
        />
      </div>
      <PaginationFooter
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        @page-change="editor.changePage"
        @update:page-size="editor.changePageSize"
      />
    </div>
    <template #footer>
      <span
        v-if="unresolved"
        class="warning"
        >提交结果尚未确认，请核对历史记录后原样重试。</span
      >
      <el-button
        :disabled="submitting"
        @click="editor.close"
        >关闭</el-button
      >
      <el-button
        :disabled="busy"
        @click="editor.refresh"
        >刷新任务与记录</el-button
      >
      <el-button
        v-if="unresolved"
        type="warning"
        :loading="submitting"
        @click="editor.retry"
        >原样重试</el-button
      >
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { DialogWidth } from '../../../utils/dialog';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useFinishedInspection } from '../composables/useFinishedInspection';
import FinishedInspectionPanel from './FinishedInspectionPanel.vue';
import FinishedInspectionHistory from './FinishedInspectionHistory.vue';
const emit = defineEmits<{ changed: [] }>();
const editor = useFinishedInspection(() => emit('changed'));
const {
  visible,
  detail,
  loading,
  submitting,
  unresolved,
  error,
  records,
  total,
  page,
  pageSize,
  recordsLoading,
  recordsError,
  inspection,
  inspectionOpen,
  inspectionVersion,
  inspectionDeclared,
  busy,
  locked,
  inspectionStale,
  inspectionValid,
} = editor;
defineExpose({ visible, locked, open: editor.open, close: editor.close });
</script>
<style scoped>
.notice {
  margin-top: 16px;
}
.warning {
  color: var(--el-color-warning);
  margin-right: 12px;
}
</style>
