<template>
  <div class="execution-page">
    <section class="records-section">
      <TableToolbar :total="total">
        <template #actions>
          <div class="records-caption">
            <strong>报工记录</strong>
            <span>选择任务查看状态、数量差异和不可变报工历史</span>
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
            :disabled="contextLoading"
            @click="openOutput(completionCheck.productionBatchId)"
            >产出清单与结案</el-button
          >
          <el-tooltip
            content="刷新当前批次"
            placement="top"
          >
            <el-button
              :icon="Refresh"
              text
              circle
              :loading="contextLoading"
              @click="refreshCurrent"
            />
          </el-tooltip>
        </template>
      </TableToolbar>

      <div class="workspace">
        <ProductionExecutionBatchList
          v-model:keyword="keywordDraft"
          :batches="batches"
          :loading="loading"
          :selected-batch-id="selectedBatchId"
          :current-page="currentPage"
          :total="total"
          :page-size="pageSize"
          :applied-keyword="appliedKeyword"
          :disabled="navigationPending"
          :error-text="listErrorText"
          @search="search"
          @reset-search="resetSearch"
          @select="selectBatch"
          @change-page="changePage"
        />

        <main
          ref="recordPanelRef"
          v-loading="contextLoading"
          class="record-panel"
        >
          <section
            v-if="record"
            :class="['batch-health', selectedBatchRiskClass]"
            aria-label="任务报工摘要"
          >
            <div class="batch-health-header">
              <div class="batch-health-title">
                <strong>{{ record.batchNo }}</strong>
                <el-tag
                  size="small"
                  :type="batchStatusMeta(record.batchStatus).type"
                  >{{ batchStatusMeta(record.batchStatus).label }}</el-tag
                >
                <span class="batch-progress"
                  >明确完成 {{ completedStepCount }} / {{ record.steps.length }} 道
                  <el-progress
                    :percentage="stepProgressPercentage"
                    :stroke-width="5"
                    :show-text="false"
                  />
                </span>
                <el-tag
                  v-if="selectedOverdueDays > 0"
                  size="small"
                  type="warning"
                  >已逾期 {{ selectedOverdueDays }} 天</el-tag
                >
                <el-tag
                  v-if="pendingAbnormalCount > 0"
                  size="small"
                  type="danger"
                  >待处置 {{ pendingAbnormalCount }} 项</el-tag
                >
              </div>
              <el-button
                v-if="
                  [
                    'pending',
                    'material_pending',
                    'material_assigned',
                    'material_partially_outbound',
                    'material_outbound',
                  ].includes(record.batchStatus)
                "
                link
                type="primary"
                :disabled="contextLoading || bulkLocked"
                @click="openExecutionStart"
                >任务开工</el-button
              >
              <el-button
                v-if="record.batchStatus === 'closing'"
                link
                type="warning"
                :disabled="contextLoading || bulkLocked"
                @click="openCloseoutWithdrawal(record.productionBatchId)"
                >撤回结束</el-button
              >
              <el-button
                link
                type="primary"
                :aria-expanded="taskDetailsExpanded"
                aria-controls="execution-task-details"
                @click="taskDetailsExpanded = !taskDetailsExpanded"
                >{{ taskDetailsExpanded ? '收起详情' : '任务详情' }}</el-button
              >
            </div>
            <div class="batch-info-line">
              <span>工单 {{ record.workOrderNo }}</span>
              <span>{{ record.productCode }} / {{ record.productName }}</span>
              <span>计划 {{ formatQuantity(record.plannedQuantity) }}</span>
              <span>计划完成 {{ selectedBatch?.planEndDate || '—' }}</span>
            </div>
            <div
              v-show="taskDetailsExpanded"
              id="execution-task-details"
              class="task-details"
            >
              <el-descriptions
                :column="3"
                border
              >
                <el-descriptions-item label="报工历史"
                  >{{ reportHistoryCount }} 条</el-descriptions-item
                >
                <el-descriptions-item label="工序异常记录净量"
                  ><span :class="{ 'danger-text': effectiveAbnormalQuantity > 0 }">{{
                    formatQuantity(effectiveAbnormalQuantity)
                  }}</span></el-descriptions-item
                >
                <el-descriptions-item label="当前工序">{{
                  currentStepLabel || '—'
                }}</el-descriptions-item>
              </el-descriptions>
              <p class="record-note">
                本页数量用于工序执行核对，最终产出请查看批准清单。更正和冲销后，原报工记录仍可追溯。
              </p>
            </div>
            <div
              v-if="completionCheck && completionCheck.batchStatus === 'doing'"
              class="completion-check"
            >
              <div class="completion-heading">
                <strong>执行完工</strong>
                <span :class="{ 'completion-blocked': !completionCheck.canComplete }">{{
                  completionSummary
                }}</span>
                <el-button
                  link
                  type="primary"
                  :aria-expanded="completionDetailsExpanded"
                  aria-controls="execution-completion-details"
                  @click="completionDetailsExpanded = !completionDetailsExpanded"
                  >{{ completionDetailsExpanded ? '收起检查' : '检查详情' }}</el-button
                >
                <el-button
                  type="primary"
                  size="small"
                  :disabled="contextLoading || !completionCheck.canComplete"
                  :loading="completionPending"
                  @click="openExecutionCompletion"
                  >生产执行完工</el-button
                >
              </div>
              <div
                v-show="completionDetailsExpanded"
                id="execution-completion-details"
                class="completion-details"
              >
                <p>
                  {{ completionCheck.completedRequiredStepCount }} /
                  {{ completionCheck.requiredStepCount }} 道工序已完成；末道
                  {{ completionCheck.finalRequiredStepName || '—' }} 正常累计
                  {{ formatQuantity(completionCheck.finalEffectiveNormalQuantity) }}；计划
                  {{ formatQuantity(completionCheck.plannedQuantity) }}，仅作数量核对。
                </p>
                <ul v-if="completionCheck.blockers.length">
                  <li
                    v-for="blocker in completionCheck.blockers"
                    :key="blocker"
                  >
                    {{ PRODUCTION_EXECUTION_COMPLETION_BLOCKER_LABELS[blocker] }}
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <el-alert
            v-if="record?.pendingApprovalId"
            class="dialog-tip"
            type="warning"
            :closable="false"
            show-icon
            title="当前结案或产出更正正在审批，状态和报工纠错均冻结。申请人撤回或有权审批人驳回后，管理员仍须重新核对资格；员工继续只读。"
          />
          <el-alert
            v-if="record?.batchStatus === 'closing' && !record.pendingApprovalId"
            class="dialog-tip"
            type="info"
            :closable="false"
            title="任务正在结案阶段。需要补报时，请先撤回结束；已有正常报工的冲销与更正继续按当前资格办理。"
          />
          <ProductionExecutionToolbar
            v-if="record || selectedReports.length || bulkLocked"
            :scroll-container="recordPanelRef"
            :has-steps="Boolean(record?.steps.length)"
            :disabled="contextLoading"
            :can-expand-all="canExpandAllSteps"
            :can-collapse-all="canCollapseAllSteps"
            :selected-count="selectedReports.length"
            :selected-step-count="selectedStepCount"
            :can-preview="canPreviewBulkReverse"
            :preview-blocked-reason="bulkPreviewBlockedReason"
            :pending="bulkLocked"
            @expand-all="expandAllSteps"
            @collapse-all="collapseAllSteps"
            @view-selection="selectionVisible = true"
            @preview="openBulkReverse"
            @recover="openBulkReverse"
          />
          <template v-if="record">
            <article
              v-for="step in record.steps"
              :key="step.stepRecordId"
              class="step-card"
              :data-step-id="step.stepRecordId"
            >
              <header class="step-header">
                <button
                  type="button"
                  class="step-toggle"
                  :disabled="contextLoading"
                  :aria-expanded="isStepExpanded(step.stepRecordId)"
                  :aria-controls="`execution-step-${step.stepRecordId}`"
                  @click="toggleStep(step.stepRecordId)"
                >
                  <span class="fold-control">{{
                    isStepExpanded(step.stepRecordId) ? '▾ 收起' : '▸ 展开'
                  }}</span>
                  <span class="step-title"
                    ><strong>{{ step.stepOrder }}. {{ step.stepName }}</strong
                    ><span>办理人 {{ step.responsibleUserName || '未派工' }}</span></span
                  >
                  <el-tag
                    size="small"
                    :type="stepStatusMeta(step.status).type"
                    >{{ BATCH_STEP_STATUS_LABELS[step.status] }}</el-tag
                  >
                </button>
                <ProductionStepQuotaDistribution
                  :step="step"
                  :planned-quantity="record.plannedQuantity"
                  :batch-doing="record.batchStatus === 'doing'"
                  :processing-expanded="isProcessingDetailExpanded(step.stepRecordId)"
                  :disabled="contextLoading"
                  @toggle-processing="toggleProcessingDetail(step.stepRecordId)"
                  @view-scraps="scrapDetails.open(record, step)"
                  @view-report="reportTrace.open"
                />
              </header>
              <div
                v-if="hasVisitedStep(step.stepRecordId)"
                v-show="isStepExpanded(step.stepRecordId)"
                :id="`execution-step-${step.stepRecordId}`"
                class="step-body"
              >
                <div class="step-command-bar">
                  <ProductionStepActions
                    :step="step"
                    :disabled="contextLoading || bulkLocked"
                    @action="(action) => stepActionDialogsRef?.open(step, action)"
                    @history="stepActionDialogsRef?.openHistory(step)"
                  />
                  <div class="report-actions">
                    <el-tooltip
                      :disabled="canReportStep(step) && !contextLoading"
                      :content="reportBlockedReasonForStep(step) || '当前不可报工'"
                      ><span
                        ><el-button
                          link
                          type="primary"
                          :disabled="contextLoading || bulkLocked || !canReportStep(step)"
                          @click="openReport(step, 'normal')"
                          >代报正常</el-button
                        ><el-button
                          link
                          type="primary"
                          :disabled="contextLoading || bulkLocked || !canReportStep(step)"
                          @click="openReport(step, 'abnormal')"
                          >代报异常</el-button
                        ></span
                      ></el-tooltip
                    ><el-tooltip
                      :disabled="canReportStep(step, true) && !contextLoading"
                      :content="reportBlockedReasonForStep(step, true) || '当前无历史补录资格'"
                      ><span
                        ><el-button
                          link
                          type="primary"
                          :disabled="contextLoading || bulkLocked || !canReportStep(step, true)"
                          @click="openReport(step, 'normal', true)"
                          >正常历史补录</el-button
                        ></span
                      ></el-tooltip
                    >
                  </div>
                </div>
                <div
                  v-if="!canReportStep(step)"
                  class="report-blocked-reason"
                >
                  {{ reportBlockedReasonForStep(step) }}
                </div>
                <div class="normal-quantity-composition">
                  <strong>正常来源</strong>
                  <span>直接正常 {{ formatQuantity(step.effectiveDirectNormalQuantity) }}</span>
                  <span
                    >＋ {{ BATCH_STEP_REWORK_RESULT_LABELS.normal }}
                    {{ formatQuantity(stepReworkRecoveredQuantity(step)) }}
                    {{ step.unit }}</span
                  >
                </div>
                <section
                  v-if="step.previousStepNormalQuantity !== null"
                  class="quantity-check"
                >
                  <button
                    type="button"
                    class="section-toggle"
                    :disabled="contextLoading"
                    :aria-expanded="isQuantityCheckExpanded(step.stepRecordId)"
                    :aria-controls="`quantity-check-${step.stepRecordId}`"
                    @click="toggleQuantityCheck(step.stepRecordId)"
                  >
                    {{
                      isQuantityCheckExpanded(step.stepRecordId) ? '▾ 收起数量核对' : '▸ 数量核对'
                    }}
                  </button>
                  <el-descriptions
                    v-show="isQuantityCheckExpanded(step.stepRecordId)"
                    :id="`quantity-check-${step.stepRecordId}`"
                    class="step-metrics"
                    :column="2"
                    border
                  >
                    <el-descriptions-item label="前道正常数量"
                      >{{ formatQuantity(step.previousStepNormalQuantity) }}
                      {{ step.unit }}</el-descriptions-item
                    >
                    <el-descriptions-item label="直接报工与前道正常之差"
                      >{{ formatQuantityDifference(step.directReportedVsPreviousNormalDifference) }}
                      {{ step.unit }}</el-descriptions-item
                    >
                    <el-descriptions-item label="正常数量与前道正常之差"
                      >{{ formatQuantityDifference(step.normalVsPreviousNormalDifference) }}
                      {{ step.unit }}</el-descriptions-item
                    >
                  </el-descriptions>
                </section>
                <div
                  v-if="step.supplementSources.length"
                  class="supplement-route"
                >
                  <strong>报废补产来源</strong
                  ><span
                    v-for="source in step.supplementSources"
                    :key="source.supplementId"
                    >来源 {{ source.sourceStepOrder }}. {{ source.sourceStepName }} ·
                    {{ formatQuantity(source.quantity) }} {{ step.unit }} ·
                    {{
                      source.status === 'material_ready' ? '补料已齐，授权已生效' : '等待补料领用'
                    }}</span
                  >
                </div>
                <ProductionStepReportTable
                  :batch-id="record.productionBatchId"
                  :step-record-id="step.stepRecordId"
                  :version="step.version"
                  :refresh-key="recordRefreshKey"
                  :active="isStepExpanded(step.stepRecordId)"
                  :disabled="contextLoading || bulkLocked"
                  selectable
                  :selected-ids="selectedReportIds"
                  @view-detail="reportTrace.open"
                  @view-report="reportTrace.open"
                  @view-process="reportTrace.open"
                  @select-report="(report, checked) => selectReport(step, report, checked)"
                  @correct="(report) => reportEditor.open('correct', step, report)"
                  @reverse="(report) => reportEditor.open('reverse', step, report)"
                />
              </div>
              <AbnormalReworkPanel
                v-if="hasVisitedStep(step.stepRecordId)"
                v-model:expansion="processingExpansion"
                :content-visible="isStepExpanded(step.stepRecordId)"
                :disabled="contextLoading || bulkLocked"
                :dispositions="step.abnormalDispositions"
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
                @view-report="reportTrace.open"
                @approve="handleApproveRework"
                @reject="handleRejectDisposition"
                @start="handleStartRework"
                @complete="(rework) => reworkEditor.open(rework, step)"
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

    <ProductionStepActionDialogs
      ref="stepActionDialogsRef"
      :steps="record?.steps ?? []"
      :disabled="contextLoading || bulkLocked"
      @changed="refreshCurrent"
    />
    <ProductionReportAdjustmentDialog :editor="reportEditor" />
    <ProductionReworkCompletionDialog
      :editor="reworkEditor"
      @view-report="reportTrace.open"
    />
    <BatchStepReportDialog
      ref="reportDialogRef"
      v-model="reportCreate.visible"
      :task="reportCreate.task"
      :mode="reportCreate.mode"
      :submitting="reportCreate.submitting"
      :intent-status="reportCreate.intentStatus"
      :historical="reportCreate.historical"
      :context-ready="reportCreate.contextReady"
      @reset-intent="reportCreate.resetIntent"
      @submit="reportCreate.submit"
    />
    <ProductionReportSelectionDialog
      v-model="selectionVisible"
      :batch-no="record?.batchNo || selectedBatch?.batchNo || null"
      :selections="selectedReports"
      :locked="bulkLocked"
      :refreshing="contextLoading"
      :can-preview="canPreviewBulkReverse"
      :preview-blocked-reason="bulkPreviewBlockedReason"
      @remove-report="removeSelection"
      @clear="clearSelection"
      @refresh="refreshSelection"
      @preview="openBulkReverse"
    />
    <BatchStepBulkReverseDialog
      ref="bulkDialogRef"
      v-model="bulkVisible"
      :record="record"
      :selections="selectedReports"
      :disabled="contextLoading"
      @remove-report="removeSelection"
      @refresh-selection="refreshSelection"
      @changed="onBulkChanged"
      @locked-change="bulkLocked = $event"
    />

    <ProductionExecutionStartDialog
      ref="executionStartDialog"
      v-model:visible="executionStartVisible"
      :batch-id="taskActionBatchId"
      :batch-label="taskActionLabel"
      @changed="taskPhaseChanged"
    />
    <ProductionExecutionCompletionDialog
      ref="executionCompletionDialog"
      v-model:visible="completionVisible"
      :batch-id="taskActionBatchId"
      :batch-label="taskActionLabel"
      @changed="executionCompleted"
    />
    <ProductionCloseoutWithdrawalDialog
      ref="closeoutWithdrawalDialog"
      v-model:visible="closeoutWithdrawalVisible"
      :batch-id="taskActionBatchId"
      :batch-label="taskActionLabel"
      @changed="taskPhaseChanged"
    />
  </div>
  <ProductionReportTraceDialog :reader="reportTrace" />
  <ProductionStepScrapDetailsDialog
    :reader="scrapDetails"
    @view-report="reportTrace.open"
  />
  <ProductionOutputDialog
    ref="outputDialog"
    v-model:visible="outputVisible"
    :batch-id="outputBatchId"
    @changed="refreshCurrent"
    @open-closeout="openCloseoutItems"
    @open-withdrawal="openCloseoutWithdrawal"
  />
  <ProductionBatchTerminationDialog
    ref="closeoutDialog"
    v-model:visible="closeoutVisible"
    :batch-id="outputBatchId"
    @terminated="refreshCurrent"
    @open-output="openOutput"
    @open-withdrawal="openCloseoutWithdrawal"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import {
  BATCH_STEP_REWORK_RESULT_LABELS,
  BATCH_STEP_STATUS_LABELS,
  PRODUCTION_EXECUTION_COMPLETION_BLOCKER_LABELS,
} from '@company/constants';
import type { BatchStepExecutionRecordItem } from '@company/contracts';
import { usePageActivationRefresh } from '../../composables/requests/usePageActivationRefresh';
import { useTabsStore } from '../../stores/tabs';
import { EMessage } from '../../utils/message';
import TableToolbar from '../../components/TableToolbar.vue';
import {
  batchStatusMeta,
  formatQuantity,
  formatQuantityDifference,
  stepStatusMeta,
} from './production-status';
import ProductionExecutionBatchList from './components/ProductionExecutionBatchList.vue';
import ProductionExecutionToolbar from './components/ProductionExecutionToolbar.vue';
import ProductionReportSelectionDialog from './components/ProductionReportSelectionDialog.vue';
import ProductionOutputDialog from './components/ProductionOutputDialog.vue';
import ProductionBatchTerminationDialog from './components/ProductionBatchTerminationDialog.vue';
import ProductionExecutionStartDialog from './components/ProductionExecutionStartDialog.vue';
import ProductionExecutionCompletionDialog from './components/ProductionExecutionCompletionDialog.vue';
import ProductionCloseoutWithdrawalDialog from './components/ProductionCloseoutWithdrawalDialog.vue';
import AbnormalReworkPanel from './components/AbnormalReworkPanel.vue';
import ProductionStepQuotaDistribution from './components/ProductionStepQuotaDistribution.vue';
import ProductionStepScrapDetailsDialog from './components/ProductionStepScrapDetailsDialog.vue';
import ProductionStepActions from './components/ProductionStepActions.vue';
import ProductionStepActionDialogs from './components/ProductionStepActionDialogs.vue';
import ProductionStepReportTable from './components/ProductionStepReportTable.vue';
import ProductionReportTraceDialog from './components/ProductionReportTraceDialog.vue';
import ProductionReportAdjustmentDialog from './components/ProductionReportAdjustmentDialog.vue';
import ProductionReworkCompletionDialog from './components/ProductionReworkCompletionDialog.vue';
import BatchStepReportDialog from './components/BatchStepReportDialog.vue';
import BatchStepBulkReverseDialog from './components/BatchStepBulkReverseDialog.vue';
import { useProductionExecutionRecords } from './composables/useProductionExecutionRecords';
import { useProductionAbnormalActions } from './composables/useProductionAbnormalActions';
import { useProductionReportAdjustment } from './composables/useProductionReportAdjustment';
import { useProductionReworkCompletion } from './composables/useProductionReworkCompletion';
import { useProductionReportCreate } from './composables/useProductionReportCreate';
import { useProductionReportSelection } from './composables/useProductionReportSelection';
import { useProductionExecutionSummary } from './composables/useProductionExecutionSummary';
import { useProductionReportTrace } from './composables/useProductionReportTrace';
import { useProductionExecutionNavigation } from './composables/useProductionExecutionNavigation';
import { useProductionExecutionSections } from './composables/useProductionExecutionSections';
import { useProductionStepScrapDetails } from './composables/useProductionStepScrapDetails';
import type { ProductionReportContext } from './production-report-selection';
import { canOpenProductionReport, productionReportBlockedReason } from './production-report-input';
import { stepReworkRecoveredQuantity } from './production-step-quantity-presentation';

defineOptions({ name: 'ProductionExecutionRecordsPage' });
const outputVisible = ref(false),
  closeoutVisible = ref(false),
  outputBatchId = ref<string | null>(null);
const outputDialog = ref<InstanceType<typeof ProductionOutputDialog> | null>(null);
const closeoutDialog = ref<InstanceType<typeof ProductionBatchTerminationDialog> | null>(null);
const executionStartVisible = ref(false);
const closeoutWithdrawalVisible = ref(false);
const taskActionBatchId = ref<string | null>(null);
const taskActionLabel = ref('');
const executionStartDialog = ref<InstanceType<typeof ProductionExecutionStartDialog> | null>(null);
const executionCompletionDialog = ref<InstanceType<
  typeof ProductionExecutionCompletionDialog
> | null>(null);
const closeoutWithdrawalDialog = ref<InstanceType<
  typeof ProductionCloseoutWithdrawalDialog
> | null>(null);
const prepareTaskAction = async (batchId: string): Promise<boolean> => {
  if (contextLoading.value || !(await canChangeTarget())) return false;
  await nextTick();
  if (
    route.name !== 'production-execution-records' ||
    selectedBatchId.value !== batchId ||
    !record.value
  )
    return false;
  taskActionBatchId.value = batchId;
  taskActionLabel.value = `${record.value.batchNo} · ${record.value.productName}`;
  return true;
};
const openExecutionStart = async (): Promise<void> => {
  if (selectedBatchId.value && (await prepareTaskAction(selectedBatchId.value)))
    executionStartVisible.value = true;
};
const openExecutionCompletion = async (): Promise<void> => {
  if (selectedBatchId.value && (await prepareTaskAction(selectedBatchId.value)))
    completionVisible.value = true;
};
const openCloseoutWithdrawal = async (batchId: string): Promise<void> => {
  if (await prepareTaskAction(batchId)) closeoutWithdrawalVisible.value = true;
};
const taskPhaseChanged = async (batchId: string): Promise<void> => {
  await refreshCurrent();
  if (outputVisible.value && outputBatchId.value === batchId) await outputDialog.value?.refresh();
  if (closeoutVisible.value && outputBatchId.value === batchId)
    await closeoutDialog.value?.refresh();
};
const executionCompleted = async (batchId: string): Promise<void> => {
  await taskPhaseChanged(batchId);
  if (selectedBatchId.value === batchId) openOutput(batchId);
};
const openOutput = (batchId: string): void => {
  if (contextLoading.value) return;
  outputBatchId.value = batchId;
  outputVisible.value = true;
};
const openCloseoutItems = (batchId: string): void => {
  if (contextLoading.value) return;
  outputBatchId.value = batchId;
  closeoutVisible.value = true;
};
const completionVisible = ref(false),
  recordRefreshKey = ref(0);
const recordPanelRef = ref<HTMLElement | null>(null);
const reportDialogRef = ref<InstanceType<typeof BatchStepReportDialog> | null>(null);
const stepActionDialogsRef = ref<InstanceType<typeof ProductionStepActionDialogs> | null>(null);
const bulkDialogRef = ref<InstanceType<typeof BatchStepBulkReverseDialog> | null>(null);
const {
  batches,
  total,
  pageSize,
  loading,
  listErrorText,
  detailLoading,
  selectedBatchId,
  record,
  completionCheck,
  reworks,
  pendingKeys,
  loadBatches,
  selectBatch: readBatch,
  approveRework,
  rejectDisposition,
  startRework,
  completeRework,
  getReworkCompletionIntentStatus,
  getReworkCompletionRequest,
  getReworkCompletionRequests,
  resetReworkCompletionIntent,
  loadSupplementCandidates,
  loadScrapSupplementPlan,
  saveScrapSupplementPlan,
  approveScrapSupplement,
  getSupplementIntentStatus,
  resetSupplementIntent,
} = useProductionExecutionRecords();
const contextLoading = computed(() => loading.value || detailLoading.value);
const {
  taskDetailsExpanded,
  completionDetailsExpanded,
  isStepExpanded,
  hasVisitedStep,
  toggleStep,
  canExpandAllSteps,
  canCollapseAllSteps,
  expandAllSteps,
  collapseAllSteps,
  isQuantityCheckExpanded,
  toggleQuantityCheck,
  isProcessingDetailExpanded,
  toggleProcessingDetail,
} = useProductionExecutionSections(selectedBatchId, record);
const completionSummary = computed(() => {
  const check = completionCheck.value;
  if (!check) return '';
  if (check.canComplete) return '可执行完工';
  const first = check.blockers[0];
  return first
    ? `${PRODUCTION_EXECUTION_COMPLETION_BLOCKER_LABELS[first]}${check.blockers.length > 1 ? `，另 ${check.blockers.length - 1} 项阻断` : ''}`
    : '尚不满足完工条件';
});
const processingExpansion = ref<Record<string, boolean>>({});
const reportTrace = useProductionReportTrace({
  contextId: () => selectedBatchId.value,
});
const scrapDetails = useProductionStepScrapDetails({
  contextId: () => selectedBatchId.value,
  isReady: () => !contextLoading.value && record.value !== null,
});
const {
  selectedReports,
  selectedReportIds,
  selectionVisible,
  bulkVisible,
  bulkLocked,
  clearSelection,
  removeSelection,
  selectReport,
  updateSelectionVersions,
} = useProductionReportSelection(selectedBatchId);
const selectedStepCount = computed(
  () => new Set(selectedReports.value.map((item) => item.stepRecordId)).size,
);
const canPreviewBulkReverse = computed(
  () =>
    !bulkLocked.value &&
    !contextLoading.value &&
    record.value?.canBatchReverse === true &&
    selectedReports.value.length > 0,
);
const bulkPreviewBlockedReason = computed(() => {
  if (contextLoading.value || !record.value) return '当前详情尚未就绪，请刷新后核对';
  if (!record.value.canBatchReverse)
    return record.value.batchReverseBlockedReason || '当前任务不可批量冲销';
  if (!selectedReports.value.length) return '请先选择需要冲销的普通正常报工';
  return null;
});
const openBulkReverse = (): void => {
  if (!bulkLocked.value && !canPreviewBulkReverse.value) return;
  selectionVisible.value = false;
  bulkVisible.value = true;
};
const refreshCurrent = (): Promise<void> => executionNavigation.refresh();
const getStep = (id: string): BatchStepExecutionRecordItem | null =>
  record.value?.steps.find((item) => item.stepRecordId === id) ?? null;
const reportEditor = useProductionReportAdjustment({
  getStep,
  getBatchStatus: () => record.value?.batchStatus ?? null,
  isReady: () =>
    !contextLoading.value && record.value !== null && record.value.pendingApprovalId === null,
  refresh: refreshCurrent,
});
const reworkEditor = useProductionReworkCompletion({
  getBatchId: () => selectedBatchId.value,
  getBatch: () => record.value,
  getRework: (id) => reworks.value.find((item) => item.reworkId === id) ?? null,
  isReady: () => !contextLoading.value && !bulkLocked.value && record.value !== null,
  complete: completeRework,
  getIntentStatus: getReworkCompletionIntentStatus,
  getRequest: getReworkCompletionRequest,
  getRequests: getReworkCompletionRequests,
  resetIntent: resetReworkCompletionIntent,
});
const contextForStep = (
  step: BatchStepExecutionRecordItem,
  historical = false,
): ProductionReportContext | null =>
  record.value
    ? {
        ...step,
        batchNo: record.value.batchNo,
        plannedQuantity: record.value.plannedQuantity,
        hasPreviousStep: step.previousStepNormalQuantity !== null,
        canReport: historical ? step.canCreateHistoricalReport : step.canReport,
        reportBlockedReason: historical
          ? step.historicalCreateBlockedReason
          : step.reportBlockedReason,
      }
    : null;
const canReportStep = (step: BatchStepExecutionRecordItem, historical = false): boolean => {
  if (historical && record.value?.batchStatus === 'closing') return false;
  const context = contextForStep(step, historical);
  return context !== null && canOpenProductionReport(context, historical);
};
const reportBlockedReasonForStep = (
  step: BatchStepExecutionRecordItem,
  historical = false,
): string | null => {
  if (historical && record.value?.batchStatus === 'closing')
    return '任务处于结案阶段，请先撤回任务结束后新增报工';
  const context = contextForStep(step, historical);
  return context ? productionReportBlockedReason(context, historical) : '当前任务依据不可用';
};
const reportCreate = useProductionReportCreate({
  getContext: (id, historical) => {
    const step = getStep(id);
    return step ? contextForStep(step, historical) : null;
  },
  isReady: () =>
    !contextLoading.value && record.value !== null && record.value.pendingApprovalId === null,
  refresh: refreshCurrent,
});
const openReport = (
  step: BatchStepExecutionRecordItem,
  mode: 'normal' | 'abnormal',
  historical = false,
): void => {
  const context = contextForStep(step, historical);
  if (context) reportCreate.open(context, mode, historical);
};
const refreshSelection = async (): Promise<void> => {
  if (bulkLocked.value) return;
  await refreshCurrent();
  if (record.value && !detailLoading.value) {
    updateSelectionVersions(record.value);
    EMessage.success('已刷新所选工序依据，请重新预览各条记录资格');
  }
};
const canChangeTarget = async (): Promise<boolean> => {
  if (bulkLocked.value) {
    EMessage.warning('批量结果尚未确认，请先在原弹窗重试或核对后关闭');
    return false;
  }
  if (executionStartVisible.value && !(await executionStartDialog.value?.close())) return false;
  if (closeoutWithdrawalVisible.value && !(await closeoutWithdrawalDialog.value?.close()))
    return false;
  if (completionVisible.value && !(await executionCompletionDialog.value?.close())) return false;
  if (outputVisible.value && !(await outputDialog.value?.close())) return false;
  if (closeoutVisible.value && !(await closeoutDialog.value?.close())) return false;
  if (reportCreate.visible && !(await reportDialogRef.value?.canDiscard())) return false;
  if (reportEditor.visible && !(await reportEditor.discard())) return false;
  if (!(await reworkEditor.discard())) return false;
  if (bulkVisible.value && !(await bulkDialogRef.value?.discard())) return false;
  reportCreate.visible = false;
  reportEditor.visible = false;
  reworkEditor.visible = false;
  selectionVisible.value = false;
  bulkVisible.value = false;
  return true;
};
const executionNavigation = useProductionExecutionNavigation({
  selectedBatchId,
  pageSize,
  loadBatches,
  selectBatch: readBatch,
  canChangeTarget,
  onReadComplete: () => {
    recordRefreshKey.value += 1;
  },
});
const {
  keywordDraft,
  appliedKeyword,
  currentPage,
  navigationPending,
  search,
  resetSearch,
  changePage,
  selectBatch,
} = executionNavigation;
watch(
  selectedBatchId,
  () => {
    completionVisible.value = false;
    processingExpansion.value = {};
  },
  { flush: 'sync' },
);
const onBulkChanged = async (): Promise<void> => {
  selectionVisible.value = false;
  selectedReports.value = [];
  await refreshCurrent();
};
const {
  handleApproveRework,
  handleRejectDisposition,
  handleApproveScrapSupplement,
  handleStartRework,
} = useProductionAbnormalActions({
  approveRework,
  rejectDisposition,
  approveScrapSupplement,
  startRework,
  completeRework,
});
const completionPending = computed(() => Boolean(executionCompletionDialog.value?.submitting));
const {
  completedStepCount,
  selectedBatch,
  stepProgressPercentage,
  reportHistoryCount,
  effectiveAbnormalQuantity,
  currentStepLabel,
  pendingAbnormalCount,
  selectedOverdueDays,
  selectedBatchRiskClass,
} = useProductionExecutionSummary(record, batches, selectedBatchId);
const route = useRoute();
const unregister = useTabsStore().registerCloseGuard(String(route.name), async () => {
  if (completionPending.value) return false;
  return canChangeTarget();
});
onScopeDispose(unregister);
usePageActivationRefresh(refreshCurrent);
</script>

<style scoped>
.execution-page {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}
.records-section,
.step-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.step-command-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.report-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.report-blocked-reason {
  margin: 6px 0 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
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
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.records-caption {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.records-caption strong {
  color: var(--el-text-color-primary);
  font-size: 16px;
}
.records-caption span,
.step-title > span {
  color: var(--el-text-color-secondary);
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
  padding: 0 20px 20px;
}
.batch-health {
  margin-top: 16px;
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
.step-metrics :deep(.el-descriptions__cell) {
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
  margin-bottom: 6px;
}
.batch-health-title {
  flex-wrap: wrap;
}
.batch-health-title > strong {
  color: var(--el-text-color-primary);
  font-size: 16px;
}
.batch-info-line {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.6;
}
.task-details {
  margin-top: 10px;
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
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.completion-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.completion-heading > span {
  flex: 1;
  min-width: 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.completion-heading .completion-blocked {
  color: var(--el-color-warning-dark-2);
}
.completion-details p,
.completion-note {
  margin: 8px 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}
.completion-details ul {
  margin: 0;
  padding-left: 18px;
  color: var(--el-color-warning-dark-2);
  font-size: 13px;
}
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
.step-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.step-toggle {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  min-width: 250px;
  padding: 2px 0;
  border: 0;
  color: var(--el-text-color-primary);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.step-toggle:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 4px;
  border-radius: 4px;
}
.step-toggle > .el-tag,
.fold-control {
  flex: 0 0 auto;
}
.fold-control {
  color: var(--el-text-color-regular);
  font-size: 12px;
}
.step-title {
  display: flex;
  flex: 1;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.step-title strong {
  font-size: 15px;
}
.step-body {
  margin-top: 6px;
  padding-top: 4px;
  border-top: 1px solid var(--el-border-color-lighter);
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
.step-metrics {
  margin: 10px 0 0;
}
.step-metrics :deep(.el-descriptions__content) {
  white-space: nowrap;
  overflow-wrap: normal;
}
.normal-quantity-composition {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin-top: 8px;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.6;
}
.normal-quantity-composition > span {
  white-space: nowrap;
}
.quantity-check {
  margin-top: 6px;
}
.section-toggle {
  padding: 2px 0;
  border: 0;
  color: var(--el-text-color-regular);
  background: transparent;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.section-toggle:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 3px;
}
.section-toggle:disabled {
  cursor: default;
  opacity: 0.6;
}
.danger-text {
  color: var(--el-color-danger);
}
.dialog-tip {
  margin-bottom: 16px;
}
@media (max-width: 1000px) {
  .workspace {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 2fr) minmax(0, 3fr);
  }
  .batch-health-header {
    flex-wrap: wrap;
  }
}
</style>
