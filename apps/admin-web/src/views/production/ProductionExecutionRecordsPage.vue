<template>
  <div class="execution-page">
    <section class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
      >
        <el-form-item label="关键字">
          <el-input
            v-model="keyword"
            clearable
            placeholder="批次号 / 工单号 / 产品"
            @keyup.enter="search"
          />
        </el-form-item>
        <el-form-item class="query-actions">
          <el-button
            type="primary"
            :loading="loading"
            @click="search"
            >查询</el-button
          >
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section class="records-section">
      <TableToolbar :total="total">
        <template #actions>
          <div class="records-caption">
            <strong>报工事实</strong>
            <span>选择生产批次后查看各工序的原始事实和有效汇总</span>
          </div>
        </template>
        <template #tools>
          <el-tooltip
            content="刷新当前批次"
            placement="top"
          >
            <el-button
              :icon="Refresh"
              text
              circle
              :loading="detailLoading"
              @click="refreshCurrent"
            />
          </el-tooltip>
        </template>
      </TableToolbar>

      <div class="workspace">
        <aside class="batch-list">
          <div class="batch-list-heading">
            <strong>生产批次</strong>
            <span>点击切换记录</span>
          </div>
          <div
            v-loading="loading"
            class="batch-items"
          >
            <button
              v-for="batch in batches"
              :key="batch.id"
              type="button"
              :class="['batch-item', { active: selectedBatchId === batch.id }]"
              @click="selectBatch(batch.id)"
            >
              <strong>{{ batch.batchNo }}</strong>
              <span>{{ batch.workOrderNo }}</span>
              <small>{{ batch.productCode }} / {{ batch.productName }}</small>
              <el-tag
                size="small"
                :type="batchStatusMeta(batch.status).type"
                effect="light"
                >{{ batchStatusMeta(batch.status).label }}</el-tag
              >
            </button>
            <el-empty
              v-if="!loading && batches.length === 0"
              description="未找到生产批次"
              :image-size="72"
            />
          </div>
          <el-pagination
            v-if="total > 20"
            class="batch-pagination"
            small
            layout="prev, pager, next"
            :current-page="currentPage"
            :page-size="20"
            :total="total"
            @current-change="changePage"
          />
        </aside>

        <main
          v-loading="detailLoading"
          class="record-panel"
        >
          <template v-if="record">
            <el-alert
              class="fact-tip"
              type="info"
              :closable="false"
              show-icon
              title="页面展示不可变报工事实：有效数量由普通报工减去冲销事实聚合；更正会同时追加冲销和替代事实，不修改原记录。"
            />
            <div class="record-overview">
              <div>
                <span>生产批次</span><strong>{{ record.batchNo }}</strong>
              </div>
              <div>
                <span>生产工单</span><strong>{{ record.workOrderNo }}</strong>
              </div>
              <div>
                <span>产品</span
                ><strong>{{ record.productCode }} / {{ record.productName }}</strong>
              </div>
              <div>
                <span>计划数量</span><strong>{{ formatQuantity(record.plannedQuantity) }}</strong>
              </div>
              <div>
                <span>工序进度</span
                ><strong>{{ completedStepCount }} / {{ record.steps.length }}</strong>
              </div>
              <div>
                <span>有效报工事实</span><strong>{{ effectiveReportCount }}</strong>
              </div>
              <div>
                <span>待处置异常</span
                ><strong :class="{ 'warning-text': pendingAbnormalCount > 0 }">{{
                  pendingAbnormalCount
                }}</strong>
              </div>
              <div>
                <span>批次状态</span
                ><strong>{{ batchStatusMeta(record.batchStatus).label }}</strong>
              </div>
            </div>

            <article
              v-for="step in record.steps"
              :key="step.stepRecordId"
              class="step-card"
            >
              <header>
                <div>
                  <h2>{{ step.stepOrder }}. {{ step.stepName }}</h2>
                  <p>{{ step.stepCode }} · {{ step.responsibleUserName || '未派工' }}</p>
                </div>
                <el-tag :type="stepStatusMeta(step.status).type">{{
                  stepStatusLabel(step.status)
                }}</el-tag>
              </header>
              <div class="step-metrics">
                <span
                  >需报正常量 <b>{{ formatQuantity(step.requiredNormalQuantity) }}</b></span
                >
                <span
                  >有效正常累计 <b>{{ formatQuantity(step.effectiveNormalQuantity) }}</b></span
                >
                <span
                  >有效异常累计 <b>{{ formatQuantity(step.effectiveAbnormalQuantity) }}</b></span
                >
                <span
                  >剩余需报 <b>{{ formatQuantity(step.remainingNormalQuantity) }}</b></span
                >
              </div>
              <el-table
                :data="step.reports"
                empty-text="暂无报工事实"
              >
                <el-table-column
                  prop="reportNo"
                  label="报工单号"
                  min-width="190"
                />
                <el-table-column
                  label="事实类型"
                  width="100"
                >
                  <template #default="{ row }">{{ reportTypeLabel(row) }}</template>
                </el-table-column>
                <el-table-column
                  label="正常数量"
                  width="110"
                >
                  <template #default="{ row }">{{ formatQuantity(row.normalQuantity) }}</template>
                </el-table-column>
                <el-table-column
                  label="异常数量"
                  width="110"
                >
                  <template #default="{ row }">{{ formatQuantity(row.abnormalQuantity) }}</template>
                </el-table-column>
                <el-table-column
                  label="事实关系"
                  min-width="180"
                >
                  <template #default="{ row }">
                    <span v-if="row.reversalOfReportId">冲销 #{{ row.reversalOfReportId }}</span>
                    <span v-else-if="row.correctionOfReportId"
                      >替代 #{{ row.correctionOfReportId }}</span
                    >
                    <span v-else>原始报工</span>
                  </template>
                </el-table-column>
                <el-table-column
                  label="有效性"
                  width="90"
                >
                  <template #default="{ row }">
                    <el-tag :type="row.isEffective ? 'success' : 'info'">{{
                      row.isEffective ? '有效' : '已冲销'
                    }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column
                  label="报工人 / 时间"
                  min-width="190"
                >
                  <template #default="{ row }"
                    >{{ row.createdByName || row.createdById }}<br />{{
                      formatDateTimeForDisplay(row.createdAt)
                    }}</template
                  >
                </el-table-column>
                <el-table-column
                  label="操作"
                  width="150"
                  fixed="right"
                >
                  <template #default="{ row }">
                    <template v-if="canChange(row)">
                      <el-button
                        link
                        type="primary"
                        @click="openCorrection(step, row)"
                        >更正</el-button
                      >
                      <el-button
                        link
                        type="danger"
                        @click="openReverse(step, row)"
                        >冲销</el-button
                      >
                    </template>
                    <el-tooltip
                      v-else-if="row.reportType === 'normal' && row.isEffective"
                      content="该报工已形成异常待处置依赖，当前阶段只允许查看，不可冲销或更正"
                      placement="top"
                    >
                      <span class="disabled-action">不可调整</span>
                    </el-tooltip>
                  </template>
                </el-table-column>
              </el-table>
              <div
                v-if="step.abnormalDispositions.length"
                class="abnormal-list"
              >
                <strong>异常待处置</strong>
                <el-tag
                  v-for="item in step.abnormalDispositions"
                  :key="item.dispositionId"
                  type="warning"
                  >{{ item.dispositionNo }} ·
                  {{ BATCH_STEP_ABNORMAL_REVIEW_STATUS_LABELS[item.reviewStatus] }}</el-tag
                >
              </div>
            </article>
          </template>
          <el-empty
            v-else
            description="请先从左侧选择生产批次"
          />
        </main>
      </div>
    </section>

    <el-dialog
      v-model="changeVisible"
      :title="changeMode === 'correct' ? '更正报工' : '冲销报工'"
      width="min(640px, 75vw)"
    >
      <el-alert
        class="dialog-tip"
        :type="changeMode === 'correct' ? 'info' : 'warning'"
        :closable="false"
        show-icon
        :title="
          changeMode === 'correct'
            ? '更正不会覆盖原记录，系统将追加一条全量冲销和一条替代事实。'
            : '冲销会追加一条与原报工等量的反向事实，原记录仍保留用于追溯。'
        "
      />
      <el-descriptions
        v-if="changeStep && changeReport"
        class="change-context"
        :column="2"
        border
      >
        <el-descriptions-item label="工序"
          >{{ changeStep.stepOrder }}. {{ changeStep.stepName }}</el-descriptions-item
        >
        <el-descriptions-item label="原报工单">{{ changeReport.reportNo }}</el-descriptions-item>
        <el-descriptions-item label="原正常数量"
          >{{ formatQuantity(changeReport.normalQuantity) }}
          {{ changeReport.unit }}</el-descriptions-item
        >
        <el-descriptions-item label="原异常数量"
          >{{ formatQuantity(changeReport.abnormalQuantity) }}
          {{ changeReport.unit }}</el-descriptions-item
        >
      </el-descriptions>
      <el-form label-position="top">
        <template v-if="changeMode === 'correct'">
          <el-form-item
            label="替代正常数量"
            required
          >
            <el-input-number
              v-model="changeForm.normalQuantity"
              :min="0"
              :precision="4"
            />
          </el-form-item>
          <el-form-item
            label="替代异常数量"
            required
          >
            <el-input-number
              v-model="changeForm.abnormalQuantity"
              :min="0"
              :precision="4"
            />
          </el-form-item>
        </template>
        <el-form-item
          label="原因"
          required
        >
          <el-input
            v-model="changeForm.reason"
            type="textarea"
            :rows="3"
            maxlength="5000"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="changeVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="changePending"
          :disabled="!canSubmitChange"
          @click="submitChange"
          >{{ changeMode === 'correct' ? '确认更正' : '确认冲销' }}</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import {
  BATCH_STEP_ABNORMAL_REVIEW_STATUS_LABELS,
  BATCH_STEP_REPORT_TYPE_LABELS,
  BATCH_STEP_STATUS_LABELS,
} from '@company/constants';
import type {
  BatchStepExecutionRecordItem,
  BatchStepReportItem,
  BatchStepStatus,
} from '@company/contracts';
import { formatDateTimeForDisplay } from '../../utils/date';
import { EMessage } from '../../utils/message';
import TableToolbar from '../../components/TableToolbar.vue';
import { batchStatusMeta, formatQuantity, stepStatusMeta } from './production-status';
import { useProductionExecutionRecords } from './composables/useProductionExecutionRecords';

defineOptions({ name: 'ProductionExecutionRecordsPage' });
const keyword = ref('');
const currentPage = ref(1);
const changeVisible = ref(false);
const changeMode = ref<'correct' | 'reverse'>('correct');
const changeStep = ref<BatchStepExecutionRecordItem | null>(null);
const changeReport = ref<BatchStepReportItem | null>(null);
const changeForm = reactive({ normalQuantity: 0, abnormalQuantity: 0, reason: '' });
const {
  batches,
  total,
  loading,
  detailLoading,
  selectedBatchId,
  record,
  pendingKeys,
  loadBatches,
  selectBatch,
  reverse,
  correct,
} = useProductionExecutionRecords();
const completedStepCount = computed(
  () => record.value?.steps.filter((step) => step.status === 'completed').length ?? 0,
);
const effectiveReportCount = computed(
  () =>
    record.value?.steps.reduce(
      (total, step) => total + step.reports.filter((report) => report.isEffective).length,
      0,
    ) ?? 0,
);
const pendingAbnormalCount = computed(
  () =>
    record.value?.steps.reduce(
      (total, step) =>
        total +
        step.abnormalDispositions.filter((item) => item.reviewStatus === 'pending_review').length,
      0,
    ) ?? 0,
);
const changeKey = computed(() =>
  changeReport.value ? `${changeMode.value}:${changeReport.value.reportId}` : '',
);
const changePending = computed(() => pendingKeys.value.has(changeKey.value));
const canSubmitChange = computed(
  () =>
    changeForm.reason.trim().length > 0 &&
    (changeMode.value === 'reverse' || changeForm.normalQuantity + changeForm.abnormalQuantity > 0),
);
const stepStatusLabel = (status: BatchStepStatus) => BATCH_STEP_STATUS_LABELS[status];
const reportTypeLabel = (report: BatchStepReportItem) =>
  BATCH_STEP_REPORT_TYPE_LABELS[report.reportType];
const canChange = (report: BatchStepReportItem) =>
  report.reportType === 'normal' && report.isEffective && Number(report.abnormalQuantity) === 0;
const search = async () => {
  try {
    currentPage.value = 1;
    await loadBatches(keyword.value, currentPage.value);
  } catch (error) {
    EMessage.error(error, '生产批次加载失败');
  }
};
const resetSearch = async (): Promise<void> => {
  keyword.value = '';
  selectedBatchId.value = null;
  record.value = null;
  await search();
};
const changePage = async (page: number): Promise<void> => {
  currentPage.value = page;
  try {
    await loadBatches(keyword.value, page);
  } catch (error) {
    EMessage.error(error, '生产批次加载失败');
  }
};
const refreshCurrent = async () => {
  if (selectedBatchId.value) await selectBatch(selectedBatchId.value);
  else await search();
};
const prepareChange = (
  mode: 'correct' | 'reverse',
  step: BatchStepExecutionRecordItem,
  report: BatchStepReportItem,
) => {
  changeMode.value = mode;
  changeStep.value = step;
  changeReport.value = report;
  changeForm.normalQuantity = Number(report.normalQuantity);
  changeForm.abnormalQuantity = Number(report.abnormalQuantity);
  changeForm.reason = '';
  changeVisible.value = true;
};
const openCorrection = (step: BatchStepExecutionRecordItem, report: BatchStepReportItem) =>
  prepareChange('correct', step, report);
const openReverse = (step: BatchStepExecutionRecordItem, report: BatchStepReportItem) =>
  prepareChange('reverse', step, report);
const submitChange = async () => {
  if (!changeStep.value || !changeReport.value || !canSubmitChange.value) return;
  try {
    if (changeMode.value === 'correct')
      await correct(
        changeStep.value,
        changeReport.value,
        changeForm.normalQuantity,
        changeForm.abnormalQuantity,
        changeForm.reason,
      );
    else await reverse(changeStep.value, changeReport.value, changeForm.reason);
    changeVisible.value = false;
    EMessage.success(changeMode.value === 'correct' ? '报工已按追加事实更正' : '报工已冲销');
  } catch (error) {
    EMessage.error(error, '报工调整失败，请刷新后重试');
  }
};
onMounted(search);
onActivated(refreshCurrent);
</script>

<style scoped>
.execution-page {
  display: grid;
  gap: 16px;
}
.query-panel,
.records-section,
.step-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
}
.query-panel {
  padding: 20px 20px 4px;
}
.query-form {
  display: flex;
  align-items: flex-start;
  gap: 10px 22px;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 16px;
}
.query-form :deep(.el-form-item__label) {
  height: 34px;
  padding-right: 8px;
  color: #1f2937;
  font-size: 14px;
  font-weight: 500;
  line-height: 34px;
}
.query-form :deep(.el-input) {
  width: 240px;
}
.query-actions {
  margin-left: auto;
}
.records-section {
  overflow: hidden;
}
.records-section :deep(.table-toolbar) {
  min-height: 56px;
  align-items: center;
  border-bottom: 1px solid #e5e7eb;
}
.records-caption {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.records-caption strong {
  color: #1f2937;
  font-size: 16px;
}
.records-caption span,
.step-card header p {
  color: #6b7280;
  font-size: 12px;
}
.workspace {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  min-height: 540px;
}
.batch-list {
  padding: 16px;
  border-right: 1px solid #e5e7eb;
  background: #f9fafb;
}
.batch-list-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.batch-list-heading strong {
  color: #1f2937;
  font-size: 14px;
}
.batch-list-heading span {
  color: #9ca3af;
  font-size: 12px;
}
.batch-items {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}
.batch-item {
  display: grid;
  gap: 4px;
  width: 100%;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.batch-item.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.batch-item span,
.batch-item small {
  color: #6b7280;
}
.batch-item :deep(.el-tag) {
  width: fit-content;
}
.batch-pagination {
  justify-content: center;
  margin-top: 14px;
}
.record-panel {
  min-width: 0;
  padding: 16px 20px 20px;
}
.fact-tip {
  margin-bottom: 16px;
}
.record-overview,
.step-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.record-overview div {
  display: grid;
  gap: 4px;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}
.record-overview span,
.step-metrics span {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.step-card {
  margin-top: 16px;
  padding: 16px;
}
.step-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.step-card h2 {
  margin: 0;
  font-size: 17px;
}
.step-metrics {
  margin: 14px 0;
}
.step-metrics span {
  padding: 10px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
}
.abnormal-list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding: 12px;
  background: var(--el-color-warning-light-9);
  border-radius: 8px;
}
.warning-text {
  color: #f59e0b;
}
.disabled-action {
  color: #9ca3af;
  font-size: 13px;
  cursor: help;
}
.dialog-tip {
  margin-bottom: 16px;
}
.change-context {
  margin-bottom: 16px;
}
.execution-page :deep(.el-dialog .el-input-number) {
  width: 100%;
}
@media (max-width: 1000px) {
  .workspace {
    grid-template-columns: 1fr;
  }
  .batch-list {
    border-right: 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }
  .record-overview,
  .step-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .query-form {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) auto;
  }
  .query-actions {
    margin-left: 0;
  }
}
</style>
