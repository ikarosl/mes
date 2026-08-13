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
          <el-button
            v-if="completionCheck?.batchStatus === 'doing'"
            type="primary"
            :disabled="!completionCheck.canComplete"
            :loading="completionPending"
            @click="completionVisible = true"
            >生产执行完工</el-button
          >
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
        <ProductionExecutionBatchList
          :batches="batches"
          :loading="loading"
          :selected-batch-id="selectedBatchId"
          :current-page="currentPage"
          :total="total"
          @select="selectBatch"
          @change-page="changePage"
        />

        <main
          v-loading="detailLoading"
          class="record-panel"
        >
          <template v-if="record">
            <section
              :class="['batch-health', selectedBatchRiskClass]"
              aria-label="批次执行摘要"
            >
              <div class="batch-health-main">
                <div class="batch-health-title">
                  <strong>{{ record.batchNo }}</strong>
                  <el-tag :type="batchStatusMeta(record.batchStatus).type">
                    {{ batchStatusMeta(record.batchStatus).label }}
                  </el-tag>
                  <el-tag
                    v-if="selectedOverdueDays > 0"
                    type="warning"
                    >已逾期 {{ selectedOverdueDays }} 天</el-tag
                  >
                  <el-tag
                    v-if="selectedBatch && executionBatchHasAbnormal(selectedBatch)"
                    type="danger"
                    >有效异常 {{ formatQuantity(selectedBatch.effectiveAbnormalQuantity) }} · 待处置
                    {{ selectedBatch.pendingAbnormalCount }}</el-tag
                  >
                </div>
                <p>
                  工单 {{ record.workOrderNo }} · {{ record.productCode }} /
                  {{ record.productName }}
                  <template v-if="selectedBatch?.planEndDate">
                    · 计划完成 {{ selectedBatch.planEndDate }}
                  </template>
                  <template v-if="currentStepLabel"> · 当前工序 {{ currentStepLabel }} </template>
                </p>
              </div>
              <div class="batch-progress">
                <div>
                  <span>工序进度</span>
                  <strong>{{ completedStepCount }} / {{ record.steps.length }}</strong>
                </div>
                <el-progress
                  :percentage="stepProgressPercentage"
                  :stroke-width="10"
                  :show-text="false"
                  :status="pendingAbnormalCount > 0 ? 'exception' : undefined"
                />
              </div>
            </section>
            <el-alert
              class="fact-tip"
              type="info"
              :closable="false"
              show-icon
              title="页面展示不可变报工事实：有效数量由普通报工减去冲销事实聚合；更正会同时追加冲销和替代事实，不修改原记录。"
            />
            <div class="record-overview">
              <div>
                <span>计划数量</span><strong>{{ formatQuantity(record.plannedQuantity) }}</strong>
              </div>
              <div>
                <span>有效报工事实</span><strong>{{ effectiveReportCount }}</strong>
              </div>
              <div>
                <span>有效异常数量</span
                ><strong :class="{ 'danger-text': effectiveAbnormalQuantity > 0 }">{{
                  formatQuantity(effectiveAbnormalQuantity)
                }}</strong>
              </div>
              <div>
                <span>待处置异常</span
                ><strong :class="{ 'danger-text': pendingAbnormalCount > 0 }">{{
                  pendingAbnormalCount
                }}</strong>
              </div>
            </div>

            <section
              v-if="completionCheck && completionCheck.batchStatus === 'doing'"
              class="completion-check"
            >
              <div>
                <strong>生产执行完工检查</strong>
                <p>
                  {{ completionCheck.completedRequiredStepCount }} /
                  {{ completionCheck.requiredStepCount }} 道必报工工序已完成；末道必报工工序
                  {{ completionCheck.finalRequiredStepName || '—' }} 有效正常数量
                  {{ formatQuantity(completionCheck.finalEffectiveNormalQuantity) }} /
                  {{ formatQuantity(completionCheck.plannedQuantity) }}。
                </p>
              </div>
              <el-tag :type="completionCheck.canComplete ? 'success' : 'warning'">
                {{ completionCheck.canComplete ? '可执行完工' : '尚不满足完工条件' }}
              </el-tag>
              <ul v-if="completionCheck.blockers.length">
                <li
                  v-for="blocker in completionCheck.blockers"
                  :key="blocker"
                >
                  {{ PRODUCTION_EXECUTION_COMPLETION_BLOCKER_LABELS[blocker] }}
                </li>
              </ul>
            </section>

            <article
              v-for="step in record.steps"
              :key="step.stepRecordId"
              :class="['step-card', { 'has-abnormal': stepHasAbnormal(step) }]"
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
                  >当前放行量 <b>{{ formatQuantity(step.releasedNormalQuantity) }}</b></span
                >
                <span
                  >当前可报量 <b>{{ formatQuantity(step.availableNormalQuantity) }}</b></span
                >
                <span
                  >有效正常累计 <b>{{ formatQuantity(step.effectiveNormalQuantity) }}</b></span
                >
                <span :class="{ 'danger-text': Number(step.effectiveAbnormalQuantity) > 0 }"
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
                  <template #default="{ row }">
                    <strong
                      :class="{
                        'danger-text': row.isEffective && Number(row.abnormalQuantity) > 0,
                      }"
                      >{{ formatQuantity(row.abnormalQuantity) }}</strong
                    >
                  </template>
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
                    <template v-if="canChange(step, row)">
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
                      :content="adjustmentBlockReason(step, row) || ''"
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
                <strong>异常处置记录（当前只读）</strong>
                <el-tag
                  v-for="item in step.abnormalDispositions"
                  :key="item.dispositionId"
                  type="danger"
                  >{{ item.dispositionNo }} ·
                  {{ BATCH_STEP_ABNORMAL_REVIEW_STATUS_LABELS[item.reviewStatus] }}</el-tag
                >
                <p>
                  当前 Production
                  阶段尚未开放返工、报废审批。异常处置与报工更正是两类业务；已形成处置依赖的报工不能直接冲销或更正。
                </p>
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
      :before-close="beforeChangeClose"
      :close-on-click-modal="false"
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
      <el-alert
        v-if="changeStep && changeReport"
        class="dialog-tip"
        :type="changeHasDownstreamConflict || changeExceedsReleased ? 'error' : 'warning'"
        :closable="false"
        show-icon
        :title="changeImpactText"
      />
      <el-form label-position="top">
        <template v-if="changeMode === 'correct'">
          <el-form-item
            label="替代正常数量"
            required
          >
            <el-input-number
              v-model="changeForm.normalQuantity"
              :min="0"
              :max="replacementNormalMaximum"
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
        <el-button @click="requestChangeClose">取消</el-button>
        <el-button
          type="primary"
          :loading="changePending"
          :disabled="!canSubmitChange"
          @click="submitChange"
          >{{ changeMode === 'correct' ? '确认更正' : '确认冲销' }}</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="completionVisible"
      title="确认生产执行完工"
      width="min(640px, 75vw)"
    >
      <el-alert
        class="dialog-tip"
        type="warning"
        :closable="false"
        show-icon
        title="确认后，服务端将以末道必报工工序的有效正常数量作为批次完成数量，并记录完工人和完工时间。"
      />
      <el-descriptions
        v-if="record && completionCheck"
        :column="2"
        border
      >
        <el-descriptions-item label="生产批次">{{ record.batchNo }}</el-descriptions-item>
        <el-descriptions-item label="生产工单">{{ record.workOrderNo }}</el-descriptions-item>
        <el-descriptions-item label="计划数量">{{
          formatQuantity(completionCheck.plannedQuantity)
        }}</el-descriptions-item>
        <el-descriptions-item label="完成数量来源">
          {{ completionCheck.finalRequiredStepName }} ·
          {{ formatQuantity(completionCheck.finalEffectiveNormalQuantity) }}
        </el-descriptions-item>
      </el-descriptions>
      <p class="completion-note">本操作只确认生产执行完成，不代表质量放行，也不会生成成品入库。</p>
      <template #footer>
        <el-button @click="completionVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="completionPending"
          :disabled="!completionCheck?.canComplete"
          @click="submitCompletion"
          >确认生产执行完工</el-button
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
  PRODUCTION_EXECUTION_COMPLETION_BLOCKER_LABELS,
} from '@company/constants';
import type {
  BatchStepExecutionRecordItem,
  BatchStepReportItem,
  BatchStepStatus,
} from '@company/contracts';
import { RequestError } from '@company/request';
import { formatDateTimeForDisplay } from '../../utils/date';
import { EMessage } from '../../utils/message';
import { RouteMessageBox as ElMessageBox } from '../../utils/route-message-box';
import TableToolbar from '../../components/TableToolbar.vue';
import { batchStatusMeta, formatQuantity, stepStatusMeta } from './production-status';
import ProductionExecutionBatchList from './components/ProductionExecutionBatchList.vue';
import { useProductionExecutionRecords } from './composables/useProductionExecutionRecords';
import {
  executionBatchHasAbnormal,
  executionBatchOverdueDays,
  executionBatchRiskClass,
} from './production-execution-risk';

defineOptions({ name: 'ProductionExecutionRecordsPage' });
const keyword = ref('');
const currentPage = ref(1);
const changeVisible = ref(false);
const completionVisible = ref(false);
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
  completionCheck,
  pendingKeys,
  loadBatches,
  selectBatch,
  reverse,
  correct,
  completeExecution,
  getCorrectionIntentStatus,
  resetCorrectionIntent,
} = useProductionExecutionRecords();
const completionPending = computed(() =>
  completionCheck.value
    ? pendingKeys.value.has(`complete:${completionCheck.value.productionBatchId}`)
    : false,
);
const completedStepCount = computed(
  () => record.value?.steps.filter((step) => step.status === 'completed').length ?? 0,
);
const selectedBatch = computed(
  () => batches.value.find((batch) => batch.id === selectedBatchId.value) ?? null,
);
const stepProgressPercentage = computed(() => {
  const totalSteps = record.value?.steps.length ?? 0;
  return totalSteps > 0 ? Math.round((completedStepCount.value / totalSteps) * 100) : 0;
});
const effectiveReportCount = computed(
  () =>
    record.value?.steps.reduce(
      (total, step) => total + step.reports.filter((report) => report.isEffective).length,
      0,
    ) ?? 0,
);
const effectiveAbnormalQuantity = computed(
  () =>
    record.value?.steps.reduce(
      (total, step) => total + Number(step.effectiveAbnormalQuantity),
      0,
    ) ?? 0,
);
const currentStepLabel = computed(() => {
  const step =
    record.value?.steps.find((item) => item.status === 'doing') ??
    record.value?.steps.find((item) => item.status === 'assigned');
  return step ? `${step.stepOrder}. ${step.stepName}` : null;
});
const pendingAbnormalCount = computed(
  () =>
    record.value?.steps.reduce(
      (total, step) =>
        total +
        step.abnormalDispositions.filter((item) => item.reviewStatus === 'pending_review').length,
      0,
    ) ?? 0,
);
const selectedOverdueDays = computed(() =>
  selectedBatch.value ? executionBatchOverdueDays(selectedBatch.value) : 0,
);
const selectedBatchRiskClass = computed(() =>
  selectedBatch.value ? executionBatchRiskClass(selectedBatch.value) : '',
);
const stepHasAbnormal = (step: BatchStepExecutionRecordItem): boolean =>
  Number(step.effectiveAbnormalQuantity) > 0 ||
  step.abnormalDispositions.some((item) => item.reviewStatus === 'pending_review');
const changeKey = computed(() =>
  changeReport.value ? `${changeMode.value}:${changeReport.value.reportId}` : '',
);
const changePending = computed(() => pendingKeys.value.has(changeKey.value));
const changeIntentStatus = computed(() =>
  changeMode.value === 'correct' && changeReport.value
    ? getCorrectionIntentStatus(changeReport.value.reportId)
    : 'idle',
);
const changedEffectiveNormal = computed(() => {
  if (!changeStep.value || !changeReport.value) return 0;
  const withoutOriginal =
    Number(changeStep.value.effectiveNormalQuantity) - Number(changeReport.value.normalQuantity);
  return Math.max(
    0,
    withoutOriginal + (changeMode.value === 'correct' ? changeForm.normalQuantity : 0),
  );
});
const replacementNormalMaximum = computed(() => {
  if (!changeStep.value || !changeReport.value) return 0;
  const withoutOriginal =
    Number(changeStep.value.effectiveNormalQuantity) - Number(changeReport.value.normalQuantity);
  return Math.max(0, Number(changeStep.value.releasedNormalQuantity) - withoutOriginal);
});
const changedDownstream = computed(() => {
  if (!record.value || !changeStep.value) return null;
  const index = record.value.steps.findIndex(
    (step) => step.stepRecordId === changeStep.value?.stepRecordId,
  );
  return index < 0 ? null : (record.value.steps[index + 1] ?? null);
});
const changeHasDownstreamConflict = computed(
  () =>
    changedDownstream.value !== null &&
    changedEffectiveNormal.value < Number(changedDownstream.value.effectiveReportedQuantity),
);
const changeExceedsReleased = computed(() => {
  if (!changeStep.value || !changeReport.value) return false;
  const withoutOriginal =
    Number(changeStep.value.effectiveReportedQuantity) -
    Number(changeReport.value.reportedQuantity);
  const replacement =
    changeMode.value === 'correct' ? changeForm.normalQuantity + changeForm.abnormalQuantity : 0;
  return withoutOriginal + replacement > Number(changeStep.value.releasedNormalQuantity);
});
const changeImpactText = computed(() => {
  if (!changeStep.value) return '';
  const quantity = `${formatQuantity(changedEffectiveNormal.value)} ${changeStep.value.unit}`;
  if (changeHasDownstreamConflict.value)
    return `调整后有效正常放行量为 ${quantity}，低于下游工序已报正常与异常总量 ${formatQuantity(changedDownstream.value?.effectiveReportedQuantity ?? 0)}，请先从下游冲销。`;
  if (changeExceedsReleased.value) return `调整后有效总报工量超过上游当前放行量，不能提交。`;
  const willComplete =
    changedEffectiveNormal.value === Number(changeStep.value.requiredNormalQuantity);
  return `调整后有效正常量为 ${quantity}；工序将${willComplete ? '保持或进入已完成' : '保持或退回进行中'}。状态和完成时间由服务端重新计算。`;
});
const canSubmitChange = computed(
  () =>
    changeForm.reason.trim().length > 0 &&
    (changeMode.value === 'reverse' ||
      changeForm.normalQuantity + changeForm.abnormalQuantity > 0) &&
    !changeHasDownstreamConflict.value &&
    !changeExceedsReleased.value,
);
const stepStatusLabel = (status: BatchStepStatus) => BATCH_STEP_STATUS_LABELS[status];
const reportTypeLabel = (report: BatchStepReportItem) =>
  BATCH_STEP_REPORT_TYPE_LABELS[report.reportType];
const adjustmentBlockReason = (
  step: BatchStepExecutionRecordItem,
  report: BatchStepReportItem,
): string | null => {
  if (report.reportType !== 'normal' || !report.isEffective) return null;
  if (step.abnormalDispositions.some((item) => item.sourceReportId === report.reportId))
    return '该报工已形成异常处置依赖；当前只读阶段尚无合法的处置取消/冲销动作，因此不能直接调整报工';
  if (step.reports.some((item) => item.correctionOfReportId === report.reportId))
    return '该报工已有替代事实，不能再次冲销或更正';
  return null;
};
const canChange = (step: BatchStepExecutionRecordItem, report: BatchStepReportItem) =>
  report.reportType === 'normal' &&
  report.isEffective &&
  adjustmentBlockReason(step, report) === null;
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
const canDiscardChange = async (): Promise<boolean> => {
  if (changePending.value) return false;
  if (changeIntentStatus.value === 'idle') return true;
  try {
    await ElMessageBox.confirm(
      '上次更正结果尚未确认。请先刷新报工记录核对；放弃安全重试后再次更正可能追加重复事实。',
      '放弃幂等意图确认',
      { type: 'warning', confirmButtonText: '核对后仍要放弃', cancelButtonText: '继续保留' },
    );
    if (changeReport.value) resetCorrectionIntent(changeReport.value.reportId);
    return true;
  } catch {
    return false;
  }
};
const beforeChangeClose = async (done: () => void): Promise<void> => {
  if (await canDiscardChange()) done();
};
const requestChangeClose = async (): Promise<void> => {
  if (await canDiscardChange()) changeVisible.value = false;
};
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
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    const dependency =
      error instanceof RequestError && error.details
        ? (error.details as {
            conflictingStepOrder?: number;
            conflictingStepName?: string;
            downstreamEffectiveReportedQuantity?: string;
          })
        : null;
    const fallback =
      code === 'DOWNSTREAM_QUANTITY_CONFLICT'
        ? dependency?.conflictingStepName
          ? `调整后正常放行量低于第 ${dependency.conflictingStepOrder} 道工序“${dependency.conflictingStepName}”已报正常与异常总量 ${formatQuantity(dependency.downstreamEffectiveReportedQuantity ?? 0)}，请先从最下游开始冲销`
          : '调整后正常放行量低于下游已报正常与异常总量，请先从最下游开始冲销'
        : code === 'STEP_REPORT_DEPENDENCY_CONFLICT'
          ? '该报工已有异常处置或替代事实依赖，当前不能直接调整'
          : code === 'STEP_REPORT_QUANTITY_EXCEEDED'
            ? '调整后数量超过上游当前放行量，请刷新后核对'
            : code === 'CONCURRENT_MODIFICATION'
              ? '工序数据已变化，请刷新后重新核对调整影响'
              : '报工调整失败，请刷新后重试';
    EMessage.error(error, fallback);
  }
};
const submitCompletion = async () => {
  if (!completionCheck.value?.canComplete) return;
  try {
    await completeExecution();
    completionVisible.value = false;
    EMessage.success('生产执行已完工');
  } catch (error) {
    EMessage.error(error, '生产执行完工失败，请刷新后核对完工条件');
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
.record-panel {
  min-width: 0;
  padding: 16px 20px 20px;
}
.fact-tip {
  margin-bottom: 16px;
}
.batch-health {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 38%);
  align-items: center;
  gap: 20px;
  margin-bottom: 16px;
  padding: 16px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
}
.batch-health.risk-warning {
  border-color: var(--el-color-warning);
}
.batch-health.risk-error {
  border-color: var(--el-color-danger);
}
.batch-health-title,
.batch-progress > div {
  display: flex;
  align-items: center;
  gap: 8px;
}
.batch-health-title > strong {
  color: var(--el-text-color-primary);
  font-size: 18px;
}
.batch-health-main p {
  margin: 7px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.batch-progress {
  display: grid;
  gap: 10px;
}
.batch-progress > div {
  justify-content: space-between;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.batch-progress strong {
  color: var(--el-text-color-primary);
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
.completion-check {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 16px;
  margin-top: 16px;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
}
.completion-check p,
.completion-note {
  margin: 6px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}
.completion-check ul {
  grid-column: 1 / -1;
  margin: 0;
  padding-left: 18px;
  color: var(--el-color-warning-dark-2);
  font-size: 13px;
}
.completion-note {
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}
.step-card {
  margin-top: 16px;
  padding: 16px;
}
.step-card.has-abnormal {
  border-color: var(--el-color-danger);
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
  border: 1px solid var(--el-color-danger-light-7);
  background: var(--el-color-danger-light-9);
  border-radius: 8px;
}
.warning-text {
  color: #f59e0b;
}
.danger-text {
  color: var(--el-color-danger);
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
  .record-overview,
  .step-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .batch-health {
    grid-template-columns: 1fr;
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
