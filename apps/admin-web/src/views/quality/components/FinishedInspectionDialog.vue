<template>
  <el-dialog
    :model-value="visible"
    :title="detail ? '成品质检 · ' + detail.batchNo : '成品质检'"
    :width="DialogWidth.xl"
    workbench
    :close-on-click-modal="false"
    :before-close="close"
    @update:model-value="(value: boolean) => !value && close()"
  >
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      show-icon
      class="notice"
    />
    <div v-loading="loading">
      <template v-if="detail">
        <el-descriptions
          :column="3"
          border
          size="small"
          class="identity"
        >
          <el-descriptions-item label="工单 / 任务">
            {{ detail.workOrderNo }} / {{ detail.batchNo }}
          </el-descriptions-item>
          <el-descriptions-item label="成品">
            {{ detail.productCode }} · {{ detail.productName }}
          </el-descriptions-item>
          <el-descriptions-item label="计划数量">
            {{ Number(detail.plannedQuantity) }} 件
          </el-descriptions-item>
        </el-descriptions>
        <el-tabs
          v-model="activeTab"
          class="inspection-tabs"
        >
          <el-tab-pane
            label="本次检验"
            name="current"
          >
            <el-descriptions
              :column="3"
              border
              size="small"
            >
              <el-descriptions-item label="当前办理">
                <el-tag
                  size="small"
                  :type="finishedStageTagType(detail.stage)"
                >
                  {{ FINISHED_INSPECTION_STAGE_LABELS[detail.stage] }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="当前检验轮">
                <template v-if="detail.currentRoundId">
                  {{ detail.currentRoundNo ? '第 ' + detail.currentRoundNo + ' 轮' : '当前轮' }}
                  <el-tag
                    v-if="detail.currentRoundStatus"
                    size="small"
                    class="round-tag"
                    :type="finishedRoundTagType(detail.currentRoundStatus)"
                    :effect="finishedRoundTagEffect(detail.currentRoundStatus)"
                  >
                    {{ PRODUCTION_OUTPUT_ROUND_STATUS_LABELS[detail.currentRoundStatus] }}
                  </el-tag>
                </template>
                <template v-else>尚未建立</template>
              </el-descriptions-item>
              <el-descriptions-item label="本轮建立时已入">
                <template
                  v-if="
                    detail.baselinePlannedReceived !== null && detail.baselineExtraReceived !== null
                  "
                >
                  {{
                    Number(detail.baselinePlannedReceived) + Number(detail.baselineExtraReceived)
                  }}
                  件
                </template>
                <template v-else>尚未固定</template>
              </el-descriptions-item>
              <el-descriptions-item label="本轮建立时剩余">
                {{
                  detail.startingDeclaredRemaining === null
                    ? '尚未固定'
                    : Number(detail.startingDeclaredRemaining) + ' 件'
                }}
              </el-descriptions-item>
              <el-descriptions-item
                label="本轮检验记录"
                :span="2"
              >
                <template v-if="currentInspection">
                  {{ PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS[currentInspection.releaseDecision] }}
                  · {{ currentInspection.inspectionMethod === 'sampling' ? '样本检查' : '检查' }}
                  {{ currentInspection.inspectedQuantity }} 件 · 合格
                  <InspectionQuantity
                    :value="currentInspection.qualifiedQuantity"
                    kind="qualified"
                    unit="件"
                  />
                  · 不合格
                  <InspectionQuantity
                    :value="currentInspection.unqualifiedQuantity"
                    kind="unqualified"
                    unit="件"
                  />
                </template>
                <template v-else-if="detail.currentRoundInspectionId"
                  >本轮可沿用已有检验，请到产出清单核对正式引用</template
                >
                <template v-else>本轮尚无检验记录</template>
              </el-descriptions-item>
              <el-descriptions-item
                v-if="detail.currentRoundReason"
                label="本轮发起原因"
                :span="3"
              >
                <span class="round-reason">{{ detail.currentRoundReason }}</span>
              </el-descriptions-item>
            </el-descriptions>
            <InlineHint
              v-if="
                detail.reinspectionBlockedReason &&
                !detail.canBeginReinspection &&
                (requestedReinspection ||
                  detail.stage === 'needs_reinspection' ||
                  detail.stage === 'not_released')
              "
              tone="warning"
              class="notice"
            >
              当前不能开始复检：<strong>{{ detail.reinspectionBlockedReason }}</strong>
            </InlineHint>
            <InlineHint
              v-if="!detail.declared"
              tone="warning"
              class="notice"
            >
              尚未保存产出草稿。请先到产出清单保存申报，再开始检验。
            </InlineHint>
            <div
              v-if="showReinspectionForm"
              class="reinspection-form"
            >
              <h3>开始复检</h3>
              <InlineHint tone="warning">
                确认后立即建立新检验轮，<strong>旧定稿剩余入库资格暂停</strong>。
                本次复检范围为<strong
                  >本批全部剩余实物
                  {{
                    detail.reinspectionRemainingQuantity === null
                      ? '待核对'
                      : Number(detail.reinspectionRemainingQuantity) + ' 件'
                  }}</strong
                >； 历史已入计划内 {{ Number(detail.receivedPlannedQuantity) }} 件、计划外
                {{ Number(detail.receivedExtraQuantity) }} 件，事实保留。
                关闭后仅放弃本地填写，不会恢复旧授权。
              </InlineHint>
              <el-form
                label-position="top"
                :disabled="busy || unresolved || Boolean(error)"
              >
                <el-form-item
                  label="复检原因"
                  required
                >
                  <el-input
                    v-model="reinspectionReason"
                    type="textarea"
                    :rows="3"
                    maxlength="5000"
                    show-word-limit
                    placeholder="说明现场复检原因"
                  />
                </el-form-item>
              </el-form>
            </div>
            <FinishedInspectionPanel
              v-else
              :detail="detail"
              :inspection="inspection"
              :declared="inspectionDeclared"
              :baseline-received="inspectionBaseline"
              :inspection-open="inspectionOpen"
              :inspection-stale="inspectionStale"
              :busy="busy"
              :unresolved="unresolved"
              :error="error"
              @change="editor.changeInspection"
            />
          </el-tab-pane>
          <el-tab-pane
            label="检验历史"
            name="history"
          >
            <InlineHint class="history-hint">
              历史记录用于追溯；当前清单正式采用哪条检验依据，请在产出清单核对。
            </InlineHint>
            <el-alert
              v-if="recordsError"
              :title="recordsError"
              type="error"
              :closable="false"
              class="notice"
            />
            <div
              v-if="focusedRecordId"
              class="history-location"
            >
              <span>当前定位：检验记录 ID {{ focusedRecordId }}</span>
              <el-button
                type="primary"
                link
                :disabled="recordsLoading"
                @click="showAllRecords"
                >查看全部检验历史</el-button
              >
            </div>
            <div v-loading="recordsLoading">
              <FinishedInspectionHistory
                :records="records"
                :latest-inspection-id="detail.latestInspectionId"
                :current-round-id="detail.currentRoundId"
                :focused-record-id="focusedRecordId"
              />
            </div>
            <PaginationFooter
              v-if="!focusedRecordId"
              :total="total"
              :current-page="page"
              :page-size="pageSize"
              @page-change="editor.changePage"
              @update:page-size="editor.changePageSize"
            />
          </el-tab-pane>
        </el-tabs>
      </template>
    </div>
    <template #footer>
      <span
        v-if="unresolved"
        class="warning"
        >提交结果尚未确认，请核对当前轮与历史后原样重试。</span
      >
      <el-button
        :disabled="submitting"
        @click="close"
        >关闭</el-button
      >
      <el-button
        :disabled="busy"
        @click="editor.refresh"
        >刷新</el-button
      >
      <el-button
        v-if="activeTab === 'current' && inspectionOpen && !unresolved"
        :disabled="busy"
        @click="editor.discardInspection"
        >放弃填写</el-button
      >
      <el-button
        v-if="activeTab === 'current' && showReinspectionForm && !unresolved"
        :disabled="busy"
        @click="cancelReinspection"
        >返回</el-button
      >
      <el-button
        v-if="
          activeTab === 'current' &&
          detail?.canBeginReinspection &&
          !showReinspectionForm &&
          !inspectionOpen &&
          detail.nextAction !== 'start_reinspection' &&
          !unresolved
        "
        type="primary"
        plain
        :disabled="busy"
        @click="focusReinspection"
        >开始复检</el-button
      >
      <el-button
        v-if="unresolved"
        type="primary"
        :loading="submitting"
        @click="editor.retry"
        >原样重试</el-button
      >
      <el-button
        v-else-if="primaryLabel"
        type="primary"
        :loading="submitting"
        :disabled="primaryDisabled"
        @click="primaryAction"
        >{{ primaryLabel }}</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  FINISHED_INSPECTION_STAGE_LABELS,
  PERMISSIONS,
  PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS,
  PRODUCTION_OUTPUT_ROUND_STATUS_LABELS,
} from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import InlineHint from '../../../components/InlineHint.vue';
import { useAuthStore } from '../../../stores/auth';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { useFinishedInspection } from '../composables/useFinishedInspection';
import {
  finishedRoundTagType,
  finishedRoundTagEffect,
  finishedStageTagType,
} from '../inspection-presentation';
import FinishedInspectionPanel from './FinishedInspectionPanel.vue';
import FinishedInspectionHistory from './FinishedInspectionHistory.vue';
import InspectionQuantity from './InspectionQuantity.vue';

const emit = defineEmits<{ changed: []; 'record-focus-cleared': [] }>();
const activeTab = ref<'current' | 'history'>('current');
const showReinspectionForm = ref(false);
const requestedReinspection = ref(false);
const reinspectionReason = ref('');
const editor = useFinishedInspection(
  () => emit('changed'),
  () =>
    showReinspectionForm.value && reinspectionReason.value.trim()
      ? '复检原因尚未提交，确认放弃本地填写并关闭？当前质量和入库资格不会改变。'
      : null,
);
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
  focusedRecordId,
  inspection,
  inspectionOpen,
  inspectionBaseline,
  inspectionDeclared,
  busy,
  locked,
  inspectionStale,
  inspectionValid,
} = editor;
const router = useRouter();
const auth = useAuthStore();
const canViewOutput = computed(() => auth.can(PERMISSIONS.production.tasks.view));
const currentInspection = computed(() => {
  const task = detail.value;
  return task?.currentRoundId && task.latestInspection?.roundId === task.currentRoundId
    ? task.latestInspection
    : null;
});
const primaryLabel = computed(() => {
  if (activeTab.value === 'history') return '返回本次检验';
  if (showReinspectionForm.value) return '确认开始复检';
  if (inspectionOpen.value) return '保存检验记录';
  switch (detail.value?.nextAction) {
    case 'start_inspection':
      return '开始本轮检验';
    case 'record_inspection':
      return '填写检验结果';
    case 'start_reinspection':
      return '开始复检';
    case 'save_draft':
      return canViewOutput.value ? '前往产出清单' : '';
    case 'review_output':
      return canViewOutput.value ? '前往产出清单核对' : '';
    case 'view_approval':
      return canViewOutput.value ? '查看清单审批' : '';
    case 'view_history':
      return '查看检验历史';
    default:
      return '';
  }
});
const primaryDisabled = computed(() => {
  if (busy.value || !!error.value || unresolved.value) return true;
  if (activeTab.value === 'history') return false;
  if (showReinspectionForm.value)
    return !detail.value?.canBeginReinspection || !reinspectionReason.value.trim();
  if (inspectionOpen.value) return !inspectionValid.value || inspectionStale.value;
  switch (detail.value?.nextAction) {
    case 'start_inspection':
      return !detail.value.canStartInspection;
    case 'record_inspection':
      return !detail.value.canRecordInspection;
    case 'start_reinspection':
      return !detail.value.canBeginReinspection;
    default:
      return false;
  }
});
async function open(target: string, action?: string, recordId?: string): Promise<boolean> {
  activeTab.value = action === 'record' && recordId ? 'history' : 'current';
  const opened = await editor.open(target, action === 'record' ? recordId : undefined);
  if (opened) {
    resetReinspection();
    if (action === 'reinspect') focusReinspection();
  }
  return opened;
}
async function focusRecord(recordId: string) {
  resetReinspection();
  activeTab.value = 'history';
  await editor.focusRecord(recordId);
}
async function showAllRecords() {
  const loading = editor.focusRecord(null);
  emit('record-focus-cleared');
  await loading;
}
function focusReinspection() {
  activeTab.value = 'current';
  requestedReinspection.value = true;
  if (detail.value?.canBeginReinspection) showReinspectionForm.value = true;
}
function resetReinspection() {
  showReinspectionForm.value = false;
  requestedReinspection.value = false;
  reinspectionReason.value = '';
}
async function cancelReinspection() {
  if (reinspectionReason.value.trim()) {
    try {
      await RouteMessageBox.confirm('放弃尚未提交的复检原因？', '返回本次检验', {
        type: 'warning',
      });
    } catch {
      return;
    }
  }
  resetReinspection();
}
async function close(): Promise<boolean> {
  const closed = await editor.close();
  if (closed) resetReinspection();
  return closed;
}
async function goOutput() {
  const target = detail.value?.batchId;
  if (!target || !canViewOutput.value || !(await close())) return;
  await router.push({ name: 'production-tasks', query: { batchId: target } });
}
async function primaryAction() {
  if (primaryDisabled.value) return;
  if (activeTab.value === 'history') {
    activeTab.value = 'current';
  } else if (showReinspectionForm.value) {
    if (await editor.beginReinspection(reinspectionReason.value)) resetReinspection();
  } else if (inspectionOpen.value) {
    await editor.recordInspection();
  } else {
    switch (detail.value?.nextAction) {
      case 'start_inspection':
      case 'record_inspection':
        await editor.startInspection();
        break;
      case 'start_reinspection':
        showReinspectionForm.value = true;
        break;
      case 'save_draft':
      case 'review_output':
      case 'view_approval':
        await goOutput();
        break;
      case 'view_history':
        activeTab.value = 'history';
        break;
    }
  }
}
defineExpose({ visible, locked, open, close, focusReinspection, focusRecord });
</script>

<style scoped>
.history-location {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.identity {
  margin-bottom: 12px;
}
.inspection-tabs {
  margin-top: 4px;
}
.inspection-tabs :deep(.el-tabs__content) {
  overflow: visible;
}
.round-tag {
  margin-left: 6px;
}
.notice,
.history-hint {
  margin-top: 12px;
}
.round-reason {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.reinspection-form {
  margin-top: 20px;
}
.reinspection-form h3 {
  margin: 0 0 12px;
  font-size: 15px;
}
.reinspection-form .el-form {
  margin-top: 16px;
}
.warning {
  color: var(--el-color-warning-dark-2);
  margin-right: 12px;
}
</style>
