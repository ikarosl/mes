<template>
  <el-dialog
    :model-value="visible"
    :title="detail ? `成品质检 · ${detail.batchNo}` : '成品质检'"
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
        <div class="context-title">
          <strong>{{ detail.workOrderNo }} / {{ detail.batchNo }}</strong>
          <span>{{ detail.productCode }} · {{ detail.productName }}</span>
        </div>
        <el-descriptions
          :column="2"
          border
        >
          <el-descriptions-item label="任务计划数量"
            >{{ Number(detail.plannedQuantity) }} 件</el-descriptions-item
          >
          <el-descriptions-item label="产线本轮申报参考">{{
            detail.declared
              ? `计划内 ${detail.declared.availableQuantity} 件 · 计划外 ${detail.declared.extraQuantity} 件 · 新增报废 ${detail.declared.additionalScrapQuantity} 件`
              : '尚未保存产出草稿'
          }}</el-descriptions-item>
        </el-descriptions>
        <div class="current-basis">
          <div>
            <span class="section-caption">当前办理轮次</span>
            <strong>{{
              detail.currentRoundId ? `轮次 #${detail.currentRoundId}` : '尚无当前轮'
            }}</strong>
            <el-tag
              v-if="detail.currentRoundStatus"
              size="small"
              >{{ PRODUCTION_OUTPUT_ROUND_STATUS_LABELS[detail.currentRoundStatus] }}</el-tag
            >
          </div>
          <div>
            <span class="section-caption">本轮检查记录</span>
            <template v-if="currentInspection">
              <strong>{{
                PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS[currentInspection.releaseDecision]
              }}</strong>
              <span class="basis-detail"
                >实送检 {{ currentInspection.coveredQuantity }} 件 · 实检合格
                {{ currentInspection.qualifiedQuantity }} 件 · 不合格
                {{ currentInspection.unqualifiedQuantity }} 件</span
              >
              <span class="basis-detail">正式采用以产出清单引用为准</span>
            </template>
            <strong
              v-else
              class="basis-warning"
              >本轮未新增检查记录</strong
            >
            <span
              v-if="!currentInspection"
              class="basis-detail"
              >产出清单采用依据请在来源页核对</span
            >
          </div>
          <div>
            <span class="section-caption">最近记录</span>
            <template v-if="detail.latestInspection">
              <strong>{{
                PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS[detail.latestInspection.releaseDecision]
              }}</strong>
              <span class="basis-detail"
                >{{ currentInspection ? '本轮记录' : '历史记录，不自动成为本轮依据' }} ·
                {{ formatDateTimeForDisplay(detail.latestInspection.inspectedAt) }}</span
              >
            </template>
            <strong v-else>尚无记录</strong>
          </div>
        </div>
        <el-alert
          v-if="!detail.canStartInspection && !detail.canRecordInspection"
          title="当前暂不可登记检验，已有记录仍可查看。"
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
      <el-divider content-position="left">检验记录与历史</el-divider>
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
          :current-round-id="detail?.currentRoundId ?? null"
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
import { computed } from 'vue';
import {
  PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS,
  PRODUCTION_OUTPUT_ROUND_STATUS_LABELS,
} from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
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
const currentInspection = computed(() => {
  const task = detail.value;
  return task?.currentRoundId && task.latestInspection?.roundId === task.currentRoundId
    ? task.latestInspection
    : null;
});
defineExpose({ visible, locked, open: editor.open, close: editor.close });
</script>
<style scoped>
.notice {
  margin-top: 16px;
}
.context-title {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-bottom: 10px;
}
.context-title strong {
  font-size: 16px;
  color: #1f2937;
}
.context-title span,
.section-caption,
.basis-detail {
  color: #6b7280;
  font-size: 13px;
}
.current-basis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}
.current-basis > div {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.current-basis strong {
  color: #1f2937;
}
.current-basis .basis-warning {
  color: #b45309;
}
@media (max-width: 960px) {
  .current-basis {
    grid-template-columns: 1fr;
  }
}
.warning {
  color: var(--el-color-warning);
  margin-right: 12px;
}
</style>
