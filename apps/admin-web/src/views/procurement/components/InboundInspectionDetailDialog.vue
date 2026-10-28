<template>
  <el-dialog
    :model-value="visible"
    title="来料检验"
    :width="DialogWidth.xl"
    workbench
    :before-close="beforeClose"
    :close-on-click-modal="false"
    :show-close="!command.busy.value"
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
    <el-alert
      v-if="stale && actionOpen"
      title="检验信息已更新或读取失败，输入已保留。请先核对最新详情；确认放弃本次填写后，再按最新范围办理。"
      type="warning"
      :closable="false"
      show-icon
      class="notice"
    />
    <el-alert
      v-if="command.status.value !== 'idle'"
      title="暂时无法确认检验是否已保存，本次填写内容已保留，暂不能修改。请先核对当前检验与历史记录。关闭后无法继续重试本次提交。"
      type="warning"
      :closable="false"
      show-icon
      class="notice"
    />
    <div v-loading="loading">
      <ReceiptVoidNotice
        v-if="line?.void"
        :record="line.void"
        class="notice"
      />
      <InboundInspectionSummary
        v-if="line"
        :line="line"
      />
      <el-tabs
        v-model="activeTab"
        class="inspection-tabs"
      >
        <el-tab-pane
          label="本次检验"
          name="current"
          :disabled="!lineId && Boolean(focusedCaseId)"
        >
          <template v-if="contextLine">
            <el-descriptions
              :column="2"
              border
              size="small"
            >
              <el-descriptions-item label="当前办理">
                <el-tag
                  size="small"
                  :type="receiptLineStageType(contextLine)"
                  :effect="receiptLineStageEffect(contextLine)"
                  >{{ receiptLineStageLabel(contextLine) }}</el-tag
                >
              </el-descriptions-item>
              <el-descriptions-item label="当前处理轮">
                第 {{ contextLine.currentRound.roundNo }} 轮
                <el-tag
                  size="small"
                  class="round-tag"
                  :type="receiptRoundTagType(contextLine.currentRound.status)"
                  :effect="receiptRoundTagEffect(contextLine.currentRound.status)"
                  >{{ RECEIPT_ROUND_STATUS_LABELS[contextLine.currentRound.status] }}</el-tag
                >
              </el-descriptions-item>
              <el-descriptions-item
                :label="contextCase?.status === 'reviewing' ? '送检数量' : '剩余实物'"
                :span="2"
              >
                <span v-if="isReceiptVoided(contextLine)">登记已作废</span>
                <span
                  v-else
                  class="scope-quantity"
                >
                  <strong>
                    {{
                      contextCase?.status === 'reviewing'
                        ? contextCase.coveredQuantity
                        : contextLine.quantities.unprocessedQuantity
                    }}
                    {{ contextLine.unit }}
                  </strong>
                  <span v-if="quantityFormula">=（{{ quantityFormula }}）</span>
                  <span v-else>（数量依据待核对）</span>
                </span>
              </el-descriptions-item>
              <el-descriptions-item
                label="本轮发起原因"
                :span="2"
                ><span class="record-text">{{ inspectionReason }}</span></el-descriptions-item
              >
            </el-descriptions>
            <div
              v-if="currentInspection"
              class="result-summary"
            >
              <p class="result-source">{{ inspectionSource }}</p>
              <InspectionResultSummary
                :method-label="QUALITY_INSPECTION_METHOD_LABELS[currentInspection.inspectionMethod]"
                :decision-label="QUALITY_RELEASE_DECISION_LABELS[currentInspection.releaseDecision]"
                :sampling="currentInspection.inspectionMethod === 'sampling'"
                :inspected-quantity="currentInspection.inspectedQuantity"
                :qualified-quantity="currentInspection.qualifiedQuantity"
                :unqualified-quantity="currentInspection.unqualifiedQuantity"
                :unit="contextLine.unit"
              />
            </div>
            <InlineHint
              v-else
              class="notice"
              >当前尚无检验结果。</InlineHint
            >
            <InlineHint
              v-if="!actionOpen"
              :tone="statusTone"
              class="notice"
              >{{ statusHint }}</InlineHint
            >
            <div
              v-if="actionOpen && action === 'review'"
              v-loading="actionLoading"
              class="action-form"
            >
              <h3>{{ initialInspection ? '发起检验' : '开始复检' }}</h3>
              <InlineHint tone="warning">
                确认后本批全部剩余实物
                <strong
                  >{{ contextLine.quantities.unprocessedQuantity }} {{ contextLine.unit }}</strong
                >
                进入检验中，<strong>原可入及待退分配一并暂停</strong>。抽检同样判断整批资格；关闭填写不会撤销已发起检验或恢复旧授权。
              </InlineHint>
              <el-form
                label-position="top"
                :disabled="blocked || stale"
                @submit.prevent="actions.confirm"
              >
                <el-form-item
                  label="发起原因"
                  required
                >
                  <el-input
                    v-model="reason"
                    type="textarea"
                    :rows="3"
                    :maxlength="QUALITY_INBOUND_TEXT_MAX_LENGTH"
                    show-word-limit
                  />
                </el-form-item>
              </el-form>
            </div>
            <div
              v-else-if="actionOpen && action === 'inspect' && caseRecord"
              v-loading="actionLoading"
              class="action-form"
            >
              <h3>填写检验结果</h3>
              <InboundInspectionFields
                v-model="inspection"
                :covered-quantity="Number(caseRecord.coveredQuantity)"
                :unit="contextLine.unit"
                :disabled="blocked || stale"
                @valid="inspectionValid = $event"
              />
            </div>
          </template>
        </el-tab-pane>
        <el-tab-pane
          label="检验历史"
          name="history"
        >
          <InlineHint class="history-hint"
            >历史记录用于追溯；当前采用关系以本次检验页签的依据为准，历史放行不代表当前可入库。</InlineHint
          >
          <div
            v-if="focusedCaseId"
            class="history-location"
          >
            <span
              >当前定位：检验办理 ID {{ focusedCaseId
              }}<template v-if="records[0]?.inspection">
                · 检验记录 ID {{ records[0].inspection.id }}</template
              ></span
            >
            <el-button
              type="primary"
              link
              :disabled="recordsLoading || !lineId"
              @click="showAllRecords"
              >查看全部检验历史</el-button
            >
          </div>
          <el-alert
            v-if="recordsError"
            :title="recordsError"
            type="error"
            :closable="false"
            show-icon
            class="notice"
          />
          <div
            v-loading="recordsLoading"
            class="history-records"
          >
            <InboundInspectionHistory
              v-if="records.length || (!recordsLoading && !recordsError)"
              :records="records"
              :unit="line?.unit"
              :current-round-id="line?.currentRound.id"
              :adopted-inspection-id="line?.currentRound.inspectionId"
              :rounds="line?.rounds"
              :focused-case-id="focusedCaseId"
              :focused-source-round-no="focusedSourceRoundNo"
            />
          </div>
          <PaginationFooter
            v-if="!focusedCaseId && lineId"
            :total="total"
            :current-page="page"
            :page-size="pageSize"
            @page-change="editor.changePage"
            @update:page-size="editor.changePageSize"
          />
        </el-tab-pane>
      </el-tabs>
    </div>
    <template #footer>
      <span
        v-if="command.status.value !== 'idle'"
        class="warning"
        >操作结果尚未确认，请先核对并原样重试。</span
      >
      <el-button
        v-if="allowAssociation && line"
        :disabled="command.busy.value"
        @click="emit('change-association', line.receiptId)"
        >调整到货归属</el-button
      >
      <el-button
        v-if="line && auth.can(PERMISSIONS.warehouse.receipts.view)"
        :disabled="command.busy.value"
        @click="goReceipt"
        >查看到货</el-button
      >
      <el-button
        :disabled="command.busy.value"
        @click="close"
        >关闭</el-button
      >
      <el-button
        :disabled="busy || recordsLoading"
        @click="editor.refresh"
        >刷新</el-button
      >
      <el-button
        v-if="activeTab === 'current' && actionOpen && command.status.value === 'idle'"
        :disabled="busy"
        @click="actions.close"
        >{{ action === 'inspect' ? '放弃填写' : '返回' }}</el-button
      >
      <el-button
        v-if="command.status.value === 'pending'"
        type="primary"
        :loading="command.busy.value"
        @click="command.retry"
        >原样重试</el-button
      >
      <el-button
        v-else-if="primaryLabel && command.status.value === 'idle'"
        type="primary"
        :loading="command.busy.value"
        :disabled="primaryDisabled"
        @click="primaryAction"
        >{{ primaryLabel }}</el-button
      >
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  PERMISSIONS,
  RECEIPT_ROUND_STATUS_LABELS,
  QUALITY_INBOUND_CASE_TYPE_LABELS,
  QUALITY_INBOUND_TEXT_MAX_LENGTH,
  QUALITY_INSPECTION_METHOD_LABELS,
  QUALITY_RELEASE_DECISION_LABELS,
} from '@company/constants';
import { useAuthStore } from '../../../stores/auth';
import { DialogWidth } from '../../../utils/dialog';
import InlineHint from '../../../components/InlineHint.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import {
  canReviewReceipt,
  isReceiptRejected,
  isReceiptVoided,
  receiptLineStageLabel,
  receiptLineStageType,
  receiptLineStageEffect,
  receiptRoundTagType,
  receiptRoundTagEffect,
} from '../receipt-round-presentation';
import { useInboundInspection } from '../composables/useInboundInspection';
import { incomingInspectionQuantityFormula } from '../../quality/inspection-presentation';
import InboundInspectionSummary from './InboundInspectionSummary.vue';
import InboundInspectionFields from './InboundInspectionFields.vue';
import InboundInspectionHistory from './InboundInspectionHistory.vue';
import InspectionResultSummary from '../../quality/components/InspectionResultSummary.vue';
import ReceiptVoidNotice from './ReceiptVoidNotice.vue';

defineOptions({ name: 'InboundInspectionDetailDialog' });
withDefaults(defineProps<{ allowAssociation?: boolean }>(), { allowAssociation: false });
const emit = defineEmits<{
  changed: [];
  'record-focus-cleared': [];
  'change-association': [receiptId: string];
}>();
const auth = useAuthStore(),
  router = useRouter();
const editor = useInboundInspection(() => emit('changed'));
const {
  visible,
  lineId,
  line,
  loading,
  error,
  activeTab,
  records,
  recordsLoading,
  recordsError,
  page,
  pageSize,
  total,
  focusedCaseId,
  focusedSourceRoundNo,
  actions,
  reviewingCase,
  currentCase,
  currentInspection,
  currentCaseRoundNo,
  contextLine,
  busy,
  blocked,
  open,
  close,
} = editor;
const {
  visible: actionOpen,
  loading: actionLoading,
  action,
  stale,
  reason,
  caseRecord,
  inspection,
  inspectionValid,
  canConfirm,
  command,
} = actions;
const contextCase = computed(() => {
  const source = contextLine.value;
  if (!source) return null;
  if (actionOpen.value && action.value === 'inspect') return caseRecord.value;
  return source.cases.find((record) => record.roundId === source.currentRound.id) ?? null;
});
const quantityFormula = computed(() =>
  contextLine.value
    ? incomingInspectionQuantityFormula(contextLine.value, contextCase.value)
    : null,
);
const inspectionReason = computed(() => {
  const record = contextCase.value;
  if (!record?.reason.trim()) return '—';
  if (record?.caseType === 'inspection_correction')
    return `${QUALITY_INBOUND_CASE_TYPE_LABELS.inspection_correction}：${record.reason.trim()}`;
  return record.reason.trim();
});
const inspectionSource = computed(() => {
  if (currentCase.value?.roundId === contextLine.value?.currentRound.id)
    return '当前结果 · 本轮检验';
  if (currentCaseRoundNo.value !== undefined)
    return `当前采用 · 沿用第 ${currentCaseRoundNo.value} 轮检验`;
  return '当前采用 · 沿用此前检验（来源处理轮待确定）';
});
const initialInspection = computed(() => contextLine.value?.currentRound.status === 'uninspected');
const statusHint = computed(() => {
  const source = line.value;
  if (!source) return '';
  if (isReceiptVoided(source)) return '到货登记已作废，仅可查阅原始检验依据与检验历史。';
  if (Number(source.quantities.unprocessedQuantity) === 0)
    return '本批已处理完，可查阅检验依据与检验历史。';
  if (isReceiptRejected(source))
    return '本批已人工拒收，检验记录仅供追溯；后续处置请在到货页面核对。';
  if (reviewingCase.value)
    return '本轮检验已发起，可继续填写检查结果与放行结论。关闭或放弃填写不会撤销已经发起的检验。';
  if (source.currentRound.status === 'uninspected')
    return '本批待检验，请明确发起后填写检查结果与放行结论。';
  if (
    source.currentRound.status === 'reinspection_required' ||
    source.currentRound.status === 'quality_rejected'
  )
    return '本次检查记录已保存，本批仍阻断正常定稿及入库；可发起整批复检，库管仍可独立拒收。';
  if (source.currentRound.status === 'awaiting_acceptance')
    return '本轮检查已完成，待库管核对并定稿正式去向。';
  if (source.currentRound.status === 'finalized')
    return '本轮已定稿；需要重新检查时可开始整批复检，旧剩余执行资格随之暂停。';
  return '当前不能办理检验，请刷新核对当前整批阶段。';
});
const statusTone = computed(() =>
  line.value &&
  (isReceiptRejected(line.value) ||
    ['reinspection_required', 'quality_rejected'].includes(line.value.currentRound.status))
    ? 'warning'
    : 'info',
);
const primaryLabel = computed(() => {
  if (activeTab.value === 'history') return '返回本次检验';
  if (!line.value) return '';
  if (actionOpen.value) {
    if (action.value === 'inspect') return '保存检验记录';
    return initialInspection.value ? '发起检验' : '确认开始复检';
  }
  if (reviewingCase.value) return '填写检验结果';
  if (canReviewReceipt(line.value))
    return line.value.currentRound.status === 'uninspected' ? '发起检验' : '开始复检';
  return '查看检验历史';
});
const primaryDisabled = computed(() => {
  if (activeTab.value === 'history')
    return command.busy.value || (!lineId.value && Boolean(focusedCaseId.value));
  return blocked.value || (actionOpen.value && !canConfirm.value);
});
async function primaryAction(): Promise<void> {
  if (primaryDisabled.value) return;
  if (activeTab.value === 'history') activeTab.value = 'current';
  else if (actionOpen.value) await actions.confirm();
  else if (reviewingCase.value || (line.value && canReviewReceipt(line.value)))
    editor.beginAction();
  else activeTab.value = 'history';
}
async function showAllRecords(): Promise<void> {
  const pending = editor.showAllRecords();
  emit('record-focus-cleared');
  await pending;
}
async function goReceipt(): Promise<void> {
  const id = line.value?.id;
  if (id && (await close()))
    await router.push({ name: 'procurement-receipts', query: { receiptLineId: id } });
}
function beforeClose(): void {
  void close();
}
defineExpose({
  open,
  close,
  visible,
  openedLineId: computed(() => (visible.value ? lineId.value : '')),
  openedCaseId: computed(() => (visible.value ? focusedCaseId.value : '')),
  locked: command.locked,
});
</script>
<style scoped>
.inspection-tabs {
  margin-top: 12px;
}
.inspection-tabs :deep(.el-tabs__content) {
  overflow: visible;
}
.notice,
.history-hint {
  margin-top: 12px;
  margin-bottom: 12px;
}
.result-summary {
  margin-top: 12px;
}
.result-source {
  margin: 0 0 8px;
  color: var(--el-text-color-regular);
  font-size: 14px;
}
.round-tag {
  margin-left: 6px;
}
.scope-quantity {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
}
.action-form {
  margin-top: 20px;
}
.action-form h3 {
  margin: 0 0 12px;
  font-size: 15px;
}
.action-form .el-form {
  margin-top: 16px;
}
.history-location {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 12px 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.history-records {
  min-height: 64px;
}
.record-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.warning {
  margin-right: 12px;
  color: var(--el-color-warning-dark-2);
}
</style>
