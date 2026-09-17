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
            <strong>报工记录</strong>
            <span>选择任务查看工序数量、报工明细及调整记录</span>
          </div>
        </template>
        <template #tools>
          <el-button
            v-if="
              completionCheck &&
              ['closing', 'completed', 'terminated'].includes(completionCheck.batchStatus)
            "
            type="primary"
            plain
            @click="openOutput(completionCheck.productionBatchId)"
            >产出清单与结案</el-button
          >
          <el-button
            v-if="completionCheck?.batchStatus === 'doing'"
            type="primary"
            :disabled="detailLoading || !completionCheck.canComplete"
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
              aria-label="任务报工摘要"
            >
              <div class="batch-health-header">
                <div class="batch-health-title">
                  <strong>{{ record.batchNo }}</strong>
                  <el-tag
                    size="small"
                    :type="batchStatusMeta(record.batchStatus).type"
                  >
                    {{ batchStatusMeta(record.batchStatus).label }}
                  </el-tag>
                  <el-tag
                    v-if="selectedOverdueDays > 0"
                    size="small"
                    type="warning"
                    >已逾期 {{ selectedOverdueDays }} 天</el-tag
                  >
                  <el-tag
                    v-if="selectedBatch && executionBatchHasAbnormal(selectedBatch)"
                    size="small"
                    type="danger"
                    >存在工序异常</el-tag
                  >
                  <span
                    v-if="currentStepLabel"
                    class="current-step"
                    >当前工序 {{ currentStepLabel }}</span
                  >
                </div>
                <div class="batch-progress">
                  <span>工序 {{ completedStepCount }} / {{ record.steps.length }}</span>
                  <el-progress
                    :percentage="stepProgressPercentage"
                    :stroke-width="6"
                    :show-text="false"
                    :status="pendingAbnormalCount > 0 ? 'exception' : undefined"
                  />
                </div>
              </div>
              <el-descriptions
                :column="4"
                border
              >
                <el-descriptions-item label="生产工单">{{
                  record.workOrderNo
                }}</el-descriptions-item>
                <el-descriptions-item
                  label="产品"
                  :span="2"
                  >{{ record.productCode }} / {{ record.productName }}</el-descriptions-item
                >
                <el-descriptions-item label="计划完成">{{
                  selectedBatch?.planEndDate || '—'
                }}</el-descriptions-item>
                <el-descriptions-item label="计划数量">{{
                  formatQuantity(record.plannedQuantity)
                }}</el-descriptions-item>
                <el-descriptions-item label="有效报工"
                  >{{ effectiveReportCount }} 条</el-descriptions-item
                >
                <el-descriptions-item label="工序异常合计">
                  <span :class="{ 'danger-text': effectiveAbnormalQuantity > 0 }">{{
                    formatQuantity(effectiveAbnormalQuantity)
                  }}</span>
                </el-descriptions-item>
                <el-descriptions-item label="待处置异常">
                  <span :class="{ 'danger-text': pendingAbnormalCount > 0 }"
                    >{{ pendingAbnormalCount }} 项</span
                  >
                </el-descriptions-item>
              </el-descriptions>
            </section>
            <p class="record-note">
              本页数量用于工序执行核对，最终产出请查看批准清单。更正和冲销后，原报工记录仍可追溯。
            </p>

            <section
              v-if="completionCheck && completionCheck.batchStatus === 'doing'"
              class="completion-check"
            >
              <div>
                <strong>生产执行完工检查</strong>
                <p>
                  {{ completionCheck.completedRequiredStepCount }} /
                  {{ completionCheck.requiredStepCount }} 道工序已完成；末道工序
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
                <div class="step-title">
                  <h2>{{ step.stepOrder }}. {{ step.stepName }}</h2>
                  <span
                    >{{ step.stepCode }} · {{ step.responsibleUserName || '未派工' }} · 单位
                    {{ step.unit }}</span
                  >
                </div>
                <div class="step-tags">
                  <el-tag
                    v-if="Number(step.pendingSupplementInputQuantity) > 0"
                    type="warning"
                    effect="plain"
                  >
                    待补料激活 {{ formatQuantity(step.pendingSupplementInputQuantity) }}
                  </el-tag>
                  <el-tag
                    v-if="step.isSupplementReopened"
                    type="warning"
                  >
                    补产重开
                  </el-tag>
                  <el-tag :type="stepStatusMeta(step.status).type">{{
                    stepStatusLabel(step.status)
                  }}</el-tag>
                </div>
              </header>
              <div
                v-if="step.supplementSources?.length"
                class="supplement-route"
              >
                <strong>补产路线</strong>
                <span
                  v-for="source in step.supplementSources"
                  :key="source.supplementId"
                >
                  来源 {{ source.sourceStepOrder }}. {{ source.sourceStepName }} ·
                  {{ formatQuantity(source.quantity) }} {{ step.unit }} ·
                  {{ source.status === 'material_ready' ? '补料已齐，可执行' : '等待补料领用' }}
                </span>
              </div>
              <el-alert
                v-if="step.supplementBlockedReason"
                class="supplement-blocked"
                type="warning"
                :closable="false"
                show-icon
                :title="step.supplementBlockedReason"
              />
              <el-descriptions
                class="step-metrics"
                :column="5"
                border
              >
                <el-descriptions-item label="正常目标">
                  {{ formatQuantity(step.requiredNormalQuantity) }}
                  <small
                    v-if="Number(step.activatedSupplementTargetQuantity) > 0"
                    class="quantity-note"
                  >
                    计划 {{ formatQuantity(step.baseNormalQuantity) }} + 下游补产
                    {{ formatQuantity(step.activatedSupplementTargetQuantity) }}
                  </small>
                </el-descriptions-item>
                <el-descriptions-item label="已报正常">{{
                  formatQuantity(step.effectiveNormalQuantity)
                }}</el-descriptions-item>
                <el-descriptions-item label="已报异常">
                  <span :class="{ 'danger-text': Number(step.effectiveAbnormalQuantity) > 0 }">{{
                    formatQuantity(step.effectiveAbnormalQuantity)
                  }}</span>
                </el-descriptions-item>
                <el-descriptions-item label="剩余需报">{{
                  formatQuantity(step.remainingNormalQuantity)
                }}</el-descriptions-item>
                <el-descriptions-item label="当前可报">{{
                  formatQuantity(step.availableNormalQuantity)
                }}</el-descriptions-item>
              </el-descriptions>
              <details class="quantity-details">
                <summary>数量依据</summary>
                <el-descriptions
                  :column="3"
                  border
                >
                  <el-descriptions-item label="投入放行">{{
                    formatQuantity(step.releasedNormalQuantity)
                  }}</el-descriptions-item>
                  <el-descriptions-item label="普通报工累计">{{
                    formatQuantity(step.effectiveDirectReportedQuantity)
                  }}</el-descriptions-item>
                  <el-descriptions-item label="已激活补产投入">{{
                    formatQuantity(step.activatedSupplementInputQuantity)
                  }}</el-descriptions-item>
                </el-descriptions>
              </details>
              <el-table
                :data="step.reports"
                empty-text="暂无报工记录"
              >
                <el-table-column
                  prop="reportNo"
                  label="报工单号"
                  min-width="190"
                />
                <el-table-column
                  label="记录类型"
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
                  label="关联报工"
                  min-width="180"
                >
                  <template #default="{ row }">
                    <span v-if="row.reversalOfReportId">冲销 #{{ row.reversalOfReportId }}</span>
                    <span v-else-if="row.correctionOfReportId"
                      >更正 #{{ row.correctionOfReportId }}</span
                    >
                    <span v-else>原始报工</span>
                  </template>
                </el-table-column>
                <el-table-column
                  label="记录状态"
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
              <AbnormalReworkPanel
                :dispositions="step.abnormalDispositions"
                :reports="step.reports"
                :reworks="reworks.filter((item) => item.stepRecordId === step.stepRecordId)"
                :pending-keys="pendingKeys"
                :unit="step.unit"
                :source-step="step"
                :route-steps="record.steps"
                :candidate-loader="loadSupplementCandidates"
                :plan-loader="loadScrapSupplementPlan"
                :plan-saver="saveScrapSupplementPlan"
                :plan-confirmer="handleApproveScrapSupplement"
                :intent-status-loader="getSupplementIntentStatus"
                :intent-resetter="resetSupplementIntent"
                @approve="handleApproveRework"
                @reject="handleRejectDisposition"
                @start="handleStartRework"
                @complete="handleCompleteRework"
              />
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
            ? '填写更正后的完整数量。原报工记录保留，更正后重新核对本工序及后续工序的数量。'
            : '冲销后，原报工数量不再计入工序汇总；记录和冲销原因仍保留用于追溯。'
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
            label="更正后正常数量"
            required
          >
            <el-input-number
              v-model="changeForm.normalQuantity"
              :min="0"
              :max="replacementNormalMaximum"
              :step="1"
              :precision="0"
            />
          </el-form-item>
          <el-form-item
            label="更正后异常数量"
            required
          >
            <el-input-number
              v-model="changeForm.abnormalQuantity"
              :min="0"
              :step="1"
              :precision="0"
            />
          </el-form-item>
          <el-form-item
            v-if="changeForm.abnormalQuantity > 0"
            label="更正后异常来源"
            required
          >
            <el-radio-group v-model="changeForm.abnormalOrigin">
              <el-radio value="current_step">当前工序异常</el-radio>
              <el-radio
                v-if="changeHasPreviousStep"
                value="previous_step"
                >前置工序异常</el-radio
              >
            </el-radio-group>
            <div
              v-if="!changeHasPreviousStep"
              class="form-tip"
            >
              当前为首道工序，只能选择当前工序异常。
            </div>
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
        title="确认后结束工序执行并进入产出核对。末工序报工数量保留，管理员须登记产出、引用质检记录并提交结案审批；本操作不增加库存。"
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
        <el-descriptions-item label="末工序正常报工">
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
          :disabled="detailLoading || !completionCheck?.canComplete"
          @click="submitCompletion"
          >确认生产执行完工</el-button
        >
      </template>
    </el-dialog>
  </div>
  <ProductionOutputDialog
    v-model:visible="outputVisible"
    :batch-id="outputBatchId"
    @changed="refreshCurrent"
    @open-closeout="openCloseoutItems"
  />
  <ProductionBatchTerminationDialog
    v-model:visible="closeoutVisible"
    :batch-id="outputBatchId"
    @terminated="refreshCurrent"
    @open-output="openOutput"
  />
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { usePageActivationRefresh } from '../../composables/requests/usePageActivationRefresh';
import { Refresh } from '@element-plus/icons-vue';
import {
  BATCH_STEP_REPORT_TYPE_LABELS,
  BATCH_STEP_STATUS_LABELS,
  PRODUCTION_EXECUTION_COMPLETION_BLOCKER_LABELS,
} from '@company/constants';
import type {
  BatchStepExecutionRecordItem,
  BatchStepAbnormalOrigin,
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
import ProductionOutputDialog from './components/ProductionOutputDialog.vue';
import ProductionBatchTerminationDialog from './components/ProductionBatchTerminationDialog.vue';
import AbnormalReworkPanel from './components/AbnormalReworkPanel.vue';
import { useProductionExecutionRecords } from './composables/useProductionExecutionRecords';
import { useProductionAbnormalActions } from './composables/useProductionAbnormalActions';
import {
  executionBatchHasAbnormal,
  executionBatchOverdueDays,
  executionBatchRiskClass,
} from './production-execution-risk';

defineOptions({ name: 'ProductionExecutionRecordsPage' });
const outputVisible = ref(false),
  closeoutVisible = ref(false),
  outputBatchId = ref<string | null>(null);
const openOutput = (batchId: string) => {
  outputBatchId.value = batchId;
  outputVisible.value = true;
};
const openCloseoutItems = (batchId: string) => {
  outputBatchId.value = batchId;
  closeoutVisible.value = true;
};
const keyword = ref('');
const currentPage = ref(1);
const changeVisible = ref(false);
const completionVisible = ref(false);
const changeMode = ref<'correct' | 'reverse'>('correct');
const changeStep = ref<BatchStepExecutionRecordItem | null>(null);
const changeReport = ref<BatchStepReportItem | null>(null);
const changeForm = reactive<{
  normalQuantity: number;
  abnormalQuantity: number;
  abnormalOrigin: BatchStepAbnormalOrigin | null;
  reason: string;
}>({ normalQuantity: 0, abnormalQuantity: 0, abnormalOrigin: null, reason: '' });
const {
  batches,
  total,
  loading,
  detailLoading,
  selectedBatchId,
  record,
  completionCheck,
  reworks,
  pendingKeys,
  loadBatches,
  selectBatch,
  reverse,
  correct,
  completeExecution,
  getCorrectionIntentStatus,
  resetCorrectionIntent,
  approveRework,
  rejectDisposition,
  startRework,
  completeRework,
  loadSupplementCandidates,
  loadScrapSupplementPlan,
  saveScrapSupplementPlan,
  approveScrapSupplement,
  getSupplementIntentStatus,
  resetSupplementIntent,
} = useProductionExecutionRecords();
watch(
  selectedBatchId,
  () => {
    completionVisible.value = false;
    changeVisible.value = false;
  },
  { flush: 'sync' },
);
const {
  handleApproveRework,
  handleRejectDisposition,
  handleApproveScrapSupplement,
  handleStartRework,
  handleCompleteRework,
} = useProductionAbnormalActions({
  approveRework,
  rejectDisposition,
  approveScrapSupplement,
  startRework,
  completeRework,
});
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
      (total, step) =>
        total +
        step.reports.filter((report) => report.reportType === 'normal' && report.isEffective)
          .length,
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
const changeHasPreviousStep = computed(() => {
  if (!record.value || !changeStep.value) return false;
  return (
    record.value.steps.findIndex((step) => step.stepRecordId === changeStep.value?.stepRecordId) > 0
  );
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
  return `调整后有效正常量为 ${quantity}；工序将${willComplete ? '保持或进入已完成' : '保持或退回进行中'}。工序状态和完成时间将相应更新。`;
});
const canSubmitChange = computed(
  () =>
    changeForm.reason.trim().length > 0 &&
    (changeMode.value === 'reverse' ||
      (changeForm.normalQuantity + changeForm.abnormalQuantity > 0 &&
        (changeForm.abnormalQuantity === 0 || changeForm.abnormalOrigin !== null))) &&
    (changeForm.abnormalOrigin !== 'previous_step' || changeHasPreviousStep.value) &&
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
    return '该报工已有异常处置记录，不能直接更正或冲销';
  if (step.reports.some((item) => item.correctionOfReportId === report.reportId))
    return '该报工已有更正记录，不能再次冲销或更正';
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
  const stepIndex = record.value?.steps.findIndex(
    (item) => item.stepRecordId === step.stepRecordId,
  );
  changeForm.abnormalOrigin =
    Number(report.abnormalQuantity) > 0 && stepIndex === 0 ? 'current_step' : report.abnormalOrigin;
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
      '上次更正结果尚未确认。请先刷新报工记录核对；放弃重试后再次更正可能产生重复记录。',
      '确认放弃本次更正重试',
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
        changeForm.abnormalQuantity > 0 ? changeForm.abnormalOrigin : null,
        changeForm.reason,
      );
    else await reverse(changeStep.value, changeReport.value, changeForm.reason);
    changeVisible.value = false;
    EMessage.success(changeMode.value === 'correct' ? '报工已更正，原记录已保留' : '报工已冲销');
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
          ? '该报工已有异常处置或更正记录，当前不能直接调整'
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
    EMessage.success('生产执行已结束，请核对产出清单并提交结案审批');
    if (selectedBatchId.value) openOutput(selectedBatchId.value);
  } catch (error) {
    EMessage.error(error, '生产执行完工失败，请刷新后核对完工条件');
  }
};
usePageActivationRefresh(refreshCurrent);
</script>

<style scoped>
.execution-page {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
  height: 100%;
  min-height: 0;
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
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.records-section :deep(.table-toolbar) {
  flex: 0 0 auto;
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
.step-title > span {
  color: #6b7280;
  font-size: 12px;
}
.workspace {
  display: grid;
  flex: 1;
  grid-template-columns: 300px minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}
.record-panel {
  height: 100%;
  max-height: 100%;
  min-width: 0;
  min-height: 0;
  overflow-x: auto;
  overflow-y: auto;
  padding: 16px 20px 20px;
}
.batch-health {
  padding-left: 10px;
  border-left: 3px solid var(--el-border-color-light);
}
.batch-health.risk-warning {
  border-left-color: var(--el-color-warning);
}
.batch-health.risk-error {
  border-left-color: var(--el-color-danger);
}
.batch-health :deep(.el-descriptions__cell),
.step-metrics :deep(.el-descriptions__cell),
.quantity-details :deep(.el-descriptions__cell) {
  font-size: 14px;
  overflow-wrap: anywhere;
}
.batch-health-header,
.batch-health-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.batch-health-header {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.batch-health-title {
  flex-wrap: wrap;
}
.batch-health-title > strong {
  color: var(--el-text-color-primary);
  font-size: 16px;
}
.current-step,
.batch-progress,
.record-note {
  color: var(--el-text-color-regular);
  font-size: 12px;
}
.batch-progress {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.batch-progress :deep(.el-progress) {
  width: 100px;
}
.record-note {
  margin: 10px 0 12px;
  line-height: 1.6;
}
.completion-check {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 16px;
  margin-top: 12px;
  padding: 10px 12px;
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
  margin-top: 12px;
  padding: 12px 16px;
}
.step-card.has-abnormal {
  border-color: var(--el-color-danger);
}
.step-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.step-title {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px 12px;
}
.step-card h2 {
  margin: 0;
  font-size: 15px;
}
.step-tags {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}
.supplement-route {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--el-color-warning-light-7);
  border-radius: 6px;
  background: var(--el-color-warning-light-9);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.supplement-route strong {
  color: var(--el-color-warning-dark-2);
}
.supplement-blocked {
  margin-top: 12px;
}
.step-metrics {
  margin: 10px 0 0;
}
.quantity-note {
  display: block;
  color: var(--el-color-warning-dark-2);
  font-size: 12px;
}
.quantity-details {
  margin: 6px 0;
}
.quantity-details summary {
  width: fit-content;
  padding: 4px 0;
  color: var(--el-text-color-regular);
  font-size: 12px;
  cursor: pointer;
}
.quantity-details[open] summary {
  margin-bottom: 6px;
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
    grid-template-rows: minmax(0, 2fr) minmax(0, 3fr);
  }
  .batch-health-header {
    flex-wrap: wrap;
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
