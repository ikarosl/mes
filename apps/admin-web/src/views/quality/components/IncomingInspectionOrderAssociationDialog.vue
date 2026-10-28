<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    :width="mode === 'remark' ? DialogWidth.md : DialogWidth.workbench"
    :workbench="mode !== 'remark'"
    :class="{ 'association-workbench': mode !== 'remark' }"
    :before-close="beforeClose"
    :show-close="!submitting"
    @update:model-value="(value: boolean) => !value && close()"
  >
    <div
      v-loading="loading"
      :class="{ 'association-workspace': mode !== 'remark' }"
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
        v-if="status !== 'idle'"
        :title="recoveryMessage"
        type="warning"
        :closable="false"
        show-icon
        class="notice"
      />
      <template v-if="mode === 'remark'">
        <p
          v-if="order"
          class="order-identity"
        >
          <strong>质检单 {{ order.inspectionNo }}</strong>
        </p>
        <el-form
          label-position="top"
          :disabled="controlsDisabled"
          @submit.prevent="submit"
        >
          <el-form-item label="主单备注">
            <el-input
              v-model="remark"
              type="textarea"
              :rows="3"
              :maxlength="QUALITY_INCOMING_INSPECTION_ORDER_REMARK_MAX_LENGTH"
              show-word-limit
            />
          </el-form-item>
        </el-form>
      </template>
      <template v-else>
        <el-form
          v-if="mode === 'create'"
          class="remark-form"
          label-position="left"
          label-width="80px"
          :disabled="controlsDisabled"
          @submit.prevent="submit"
        >
          <el-form-item label="主单备注">
            <el-input
              v-model="remark"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 3 }"
              :maxlength="QUALITY_INCOMING_INSPECTION_ORDER_REMARK_MAX_LENGTH"
              placeholder="填写本次新建质检主单的备注（选填）"
              show-word-limit
            />
          </el-form-item>
        </el-form>
        <header
          v-else-if="mode === 'manage' && order"
          class="order-context"
        >
          <strong>质检单 {{ order.inspectionNo }}</strong>
          <p><span>主单备注</span>{{ order.remark || '未填写备注' }}</p>
        </header>
        <InlineHint>
          按整张到货单调整关联，一次最多
          {{ QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS }}
          张；检验、实收和库存事实保持原有依据。
        </InlineHint>

        <div class="association-panes">
          <section
            class="association-pane association-pane--source"
            aria-label="到货目录"
          >
            <template v-if="mode === 'move'">
              <div class="pane-heading"><h3>当前到货单</h3></div>
              <div class="pane-scroll">
                <IncomingInspectionAssociationReceiptCard
                  v-if="focusedReceipt"
                  :receipt="focusedReceipt"
                />
                <InlineHint
                  v-if="focusedReceipt?.void && !focusedReceipt.order"
                  tone="warning"
                  class="receipt-warning"
                  >本单已作废且未关联，不能新增关联；原检查记录仍可追溯。</InlineHint
                >
                <p class="pane-description">核对当前关联后，在右侧选择调整后的归属。</p>
              </div>
            </template>
            <template v-else>
              <el-tabs
                v-if="mode === 'manage'"
                :model-value="leftTab"
                class="source-tabs"
                @tab-change="changeLeftTab"
              >
                <el-tab-pane
                  label="本单已关联"
                  name="associated"
                  :disabled="locked"
                />
                <el-tab-pane
                  label="添加到货"
                  name="candidates"
                  :disabled="locked"
                />
              </el-tabs>
              <el-form
                v-if="isCandidatePanel"
                class="candidate-search"
                @submit.prevent="searchCandidates"
              >
                <el-select
                  v-model="candidateAssociation"
                  :disabled="locked"
                  class="candidate-range"
                  aria-label="关联范围"
                  @change="searchCandidates"
                >
                  <el-option
                    v-for="value in candidateAssociationChoices"
                    :key="value"
                    :value="value"
                    :label="QUALITY_INCOMING_INSPECTION_RECEIPT_ASSOCIATION_LABELS[value]"
                  />
                </el-select>
                <el-input
                  v-model="candidateKeyword"
                  :disabled="locked"
                  class="candidate-keyword"
                  aria-label="到货搜索"
                  clearable
                  maxlength="100"
                  placeholder="到货 / 采购单、供应商或物料"
                />
                <el-button
                  :loading="candidateLoading"
                  :disabled="locked"
                  native-type="submit"
                  >查询</el-button
                >
              </el-form>
              <el-alert
                v-if="leftError"
                :title="leftError"
                type="error"
                :closable="false"
              >
                <el-button
                  link
                  type="primary"
                  :disabled="locked"
                  @click="reloadLeft"
                  >重试到货目录</el-button
                >
              </el-alert>
              <div
                v-loading="leftLoading"
                class="pane-scroll receipt-list"
              >
                <el-empty
                  v-if="!leftLoading && !leftError && !visibleReceipts.length"
                  :description="isCandidatePanel ? '未找到符合条件的到货' : '本单暂无关联到货'"
                  :image-size="56"
                />
                <IncomingInspectionAssociationReceiptCard
                  v-for="receipt in visibleReceipts"
                  :key="receipt.receiptId"
                  :receipt="receipt"
                  :selected="drafts.has(receipt.receiptId)"
                >
                  <template #actions>
                    <span
                      v-if="drafts.has(receipt.receiptId)"
                      class="staged-label"
                      >{{ mode === 'create' ? '已选入' : '已加入本次调整' }}</span
                    >
                    <template v-else-if="isCandidatePanel">
                      <span
                        v-if="mode === 'manage' && receipt.order?.id === order?.id"
                        class="muted"
                        >已在本单</span
                      >
                      <el-button
                        v-else
                        link
                        type="primary"
                        :disabled="listActionsDisabled"
                        @click="addCandidate(receipt)"
                        >{{ receipt.order ? '转入' : '加入' }}</el-button
                      >
                    </template>
                    <template v-else>
                      <el-button
                        link
                        type="danger"
                        :disabled="listActionsDisabled"
                        @click="removeAssociation(receipt)"
                        >解除</el-button
                      >
                    </template>
                  </template>
                </IncomingInspectionAssociationReceiptCard>
              </div>
              <PaginationFooter
                :current-page="leftPage"
                :page-size="10"
                :total="leftTotal"
                :show-page-size="false"
                :disabled="leftLoading || locked"
                layout="prev, pager, next"
                compact
                total-suffix="张到货"
                @page-change="changeLeftPage"
              />
            </template>
          </section>

          <section
            class="association-pane association-pane--draft"
            aria-label="本次关联调整"
          >
            <template v-if="mode === 'move'">
              <div class="pane-heading"><h3>调整后的归属</h3></div>
              <el-radio-group
                :model-value="moveDestination"
                class="move-destinations"
                :disabled="controlsDisabled"
                @change="changeMoveDestination"
              >
                <el-radio
                  value="order"
                  :disabled="
                    controlsDisabled ||
                    !focusedReceipt ||
                    (!focusedReceipt.order && Boolean(focusedReceipt.void))
                  "
                  >移至其他质检主单</el-radio
                >
                <el-radio
                  value="unassigned"
                  :disabled="controlsDisabled || !focusedReceipt?.order"
                  >设为未关联</el-radio
                >
              </el-radio-group>
              <div
                v-if="focusedDraft"
                class="move-preview"
                role="status"
              >
                <strong>{{ focusedDraft.receipt.receiptNo }}</strong>
                <div class="association-path">
                  <span>{{ orderLabel(focusedDraft.receipt.order) }}</span>
                  <span aria-hidden="true">→</span>
                  <strong>{{ orderLabel(focusedDraft.target) }}</strong>
                </div>
                <span class="muted">保存后生效</span>
              </div>
              <IncomingInspectionAssociationTargetPicker
                v-if="targetPickerOpen"
                v-model:keyword="targetKeyword"
                :targets="targets"
                :page="targetPage"
                :total="targetTotal"
                :loading="targetLoading"
                :error="targetError"
                :selected-target="selectedTarget"
                :prohibited-id="prohibitedTargetId"
                :disabled="controlsDisabled"
                @search="searchTargets"
                @retry="loadTargets"
                @page-change="changeTargetPage"
                @choose="chooseTarget"
              />
              <div
                v-else
                class="pane-scroll"
              >
                <el-empty
                  v-if="!moveDestination"
                  description="请选择调整后的归属"
                  :image-size="64"
                />
                <p
                  v-else
                  class="pane-description"
                >
                  保存后解除该到货的主单关联，原质检主单与编号仍保留。
                </p>
              </div>
            </template>
            <template v-else>
              <div class="pane-heading">
                <h3>{{ mode === 'create' ? '本次选入' : '本次调整' }} {{ draftRows.length }}</h3>
                <span>/ {{ QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS }} 张到货</span>
              </div>
              <div class="pane-scroll draft-list">
                <el-empty
                  v-if="!draftRows.length"
                  :description="
                    mode === 'create' ? '从左侧加入到货' : '从左侧添加到货或解除已有关联'
                  "
                  :image-size="64"
                />
                <IncomingInspectionAssociationReceiptCard
                  v-for="draft in draftRows"
                  :key="draft.receipt.receiptId"
                  :receipt="draft.receipt"
                  :show-association="false"
                  selected
                >
                  <div class="draft-change">
                    <el-tag
                      size="small"
                      :type="draft.target || mode === 'create' ? 'primary' : 'danger'"
                      effect="plain"
                      >{{ changeLabel(draft) }}</el-tag
                    >
                    <div class="association-path">
                      <span>{{ orderLabel(draft.receipt.order) }}</span>
                      <span aria-hidden="true">→</span>
                      <strong>{{
                        mode === 'create' ? '本次新建质检主单' : orderLabel(draft.target)
                      }}</strong>
                    </div>
                  </div>
                  <template #actions>
                    <el-button
                      link
                      type="primary"
                      :disabled="locked"
                      @click="removeDraft(draft.receipt.receiptId)"
                      >{{ mode === 'create' ? '撤销选择' : '撤销' }}</el-button
                    >
                  </template>
                </IncomingInspectionAssociationReceiptCard>
              </div>
              <p class="pane-description pane-note">
                仅保存本次清单中的调整，其他到货不受影响。<template v-if="mode === 'manage'"
                  >解除最后一张到货后，原主单仍保留。</template
                >
              </p>
            </template>
          </section>
        </div>
      </template>
    </div>
    <template #footer>
      <div class="association-footer">
        <span
          v-if="mode !== 'remark'"
          class="footer-summary"
          >{{ footerSummary }}</span
        >
        <div class="footer-actions">
          <el-button
            :disabled="submitting"
            @click="close"
            >取消</el-button
          >
          <el-button
            :disabled="submitting"
            @click="refresh"
            >刷新参考</el-button
          >
          <el-button
            v-if="conflict || status === 'blocked' || status === 'expired'"
            :disabled="submitting"
            @click="reloadDiscardingDraft"
            >放弃草稿并重新载入</el-button
          >
          <el-button
            v-if="status === 'pending'"
            type="primary"
            :loading="submitting"
            @click="retry"
            >原样重试</el-button
          >
          <el-button
            v-else-if="status === 'idle'"
            type="primary"
            :disabled="!canSubmit"
            :loading="submitting"
            @click="submit"
            >{{ submitLabel }}</el-button
          >
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { QualityIncomingInspectionOrderReference } from '@company/contracts';
import {
  QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS,
  QUALITY_INCOMING_INSPECTION_ORDER_REMARK_MAX_LENGTH,
  QUALITY_INCOMING_INSPECTION_RECEIPT_ASSOCIATIONS,
  QUALITY_INCOMING_INSPECTION_RECEIPT_ASSOCIATION_LABELS,
} from '@company/constants';
import InlineHint from '../../../components/InlineHint.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { DialogWidth } from '../../../utils/dialog';
import { useIncomingInspectionOrderAssociation } from '../composables/useIncomingInspectionOrderAssociation';
import IncomingInspectionAssociationReceiptCard from './IncomingInspectionAssociationReceiptCard.vue';
import IncomingInspectionAssociationTargetPicker from './IncomingInspectionAssociationTargetPicker.vue';

defineOptions({ name: 'IncomingInspectionOrderAssociationDialog' });
const candidateAssociationChoices = QUALITY_INCOMING_INSPECTION_RECEIPT_ASSOCIATIONS.filter(
  (value) => value !== 'all',
);
const emit = defineEmits<{ changed: [] }>();
const editor = useIncomingInspectionOrderAssociation(() => emit('changed'));
const {
  visible,
  mode,
  order,
  focusedReceipt,
  remark,
  loading,
  error,
  conflict,
  submitting,
  drafts,
  draftRows,
  status,
  locked,
  controlsDisabled,
  canSubmit,
  recoveryMessage,
  associated,
  associatedPage,
  associatedTotal,
  associatedLoading,
  associatedError,
  leftTab,
  candidates,
  candidateKeyword,
  candidateAssociation,
  candidatePage,
  candidateTotal,
  candidateLoading,
  candidateError,
  targets,
  targetKeyword,
  targetPage,
  targetTotal,
  targetLoading,
  targetError,
  selectedTarget,
  targetPickerOpen,
  prohibitedTargetId,
  moveDestination,
  open,
  close,
  refresh,
  reloadDiscardingDraft,
  addCandidate,
  removeAssociation,
  removeDraft,
  chooseTarget,
  changeMoveDestination,
  changeLeftTab,
  loadAssociated,
  loadCandidates,
  loadTargets,
  searchCandidates,
  changeCandidatePage,
  changeAssociatedPage,
  searchTargets,
  changeTargetPage,
  submit,
  retry,
} = editor;
type AssociationDraftRow = (typeof draftRows.value)[number];
const title = computed(() => {
  if (mode.value === 'create') return '新建来料质检主单';
  if (mode.value === 'remark') return '编辑质检主单备注';
  if (mode.value === 'move') return '调整到货归属';
  return '调整质检主单关联';
});
const submitLabel = computed(() => {
  if (mode.value === 'remark') return '保存备注';
  if (mode.value === 'move') return '保存归属调整';
  if (mode.value === 'create') return `创建主单并关联 ${draftRows.value.length} 张到货`;
  return `保存 ${draftRows.value.length} 张到货的关联调整`;
});
const isCandidatePanel = computed(() => mode.value === 'create' || leftTab.value === 'candidates');
const visibleReceipts = computed(() =>
  isCandidatePanel.value ? candidates.value : associated.value,
);
const leftPage = computed(() =>
  isCandidatePanel.value ? candidatePage.value : associatedPage.value,
);
const leftTotal = computed(() =>
  isCandidatePanel.value ? candidateTotal.value : associatedTotal.value,
);
const leftLoading = computed(() =>
  isCandidatePanel.value ? candidateLoading.value : associatedLoading.value,
);
const leftError = computed(() =>
  isCandidatePanel.value ? candidateError.value : associatedError.value,
);
const listActionsDisabled = computed(
  () =>
    controlsDisabled.value ||
    Boolean(leftError.value) ||
    leftLoading.value ||
    draftRows.value.length >= QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS,
);
const focusedDraft = computed(() =>
  focusedReceipt.value ? drafts.value.get(focusedReceipt.value.receiptId) : undefined,
);
const footerSummary = computed(() => {
  if (mode.value === 'move')
    return focusedDraft.value ? '本次调整 1 张到货，保存后生效' : '请选择调整后的归属';
  const added = draftRows.value.filter((draft) => !draft.receipt.order).length;
  const transferred = draftRows.value.filter(
    (draft) => draft.receipt.order && (mode.value === 'create' || draft.target),
  ).length;
  if (mode.value === 'create')
    return `本次选入 ${draftRows.value.length} 张 · 新增 ${added} · 转入 ${transferred}`;
  const removed = draftRows.value.filter((draft) => !draft.target).length;
  return `本次调整 ${draftRows.value.length}/${QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS} 张 · 新增 ${added} · 转入 ${transferred} · 解除 ${removed}`;
});
function orderLabel(reference: QualityIncomingInspectionOrderReference | null): string {
  return reference?.inspectionNo ?? '未关联';
}
function changeLabel(draft: AssociationDraftRow): string {
  if (mode.value !== 'create' && !draft.target) return '解除';
  if (!draft.receipt.order) return '加入';
  return '转入';
}
async function reloadLeft(): Promise<void> {
  if (isCandidatePanel.value) await loadCandidates();
  else await loadAssociated();
}
async function changeLeftPage(value: number): Promise<void> {
  if (isCandidatePanel.value) await changeCandidatePage(value);
  else await changeAssociatedPage(value);
}
function beforeClose(): void {
  void close();
}
defineExpose({ open, close, visible, locked });
</script>

<style scoped>
:global(.el-dialog.association-workbench) {
  height: 760px;
}
:global(.route-dialog-overlay .el-dialog.association-workbench > .el-dialog__body) {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.association-workspace {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
}
.notice {
  flex-shrink: 0;
  margin-bottom: 12px;
}
.association-workspace > .notice {
  margin-bottom: 0;
}
.order-identity {
  color: var(--el-text-color-primary);
}
.remark-form .el-form-item {
  margin-bottom: 0;
}
.association-workspace :deep(.pagination-footer--compact) {
  flex-shrink: 0;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
}
.association-workspace :deep(.pagination-footer--compact .total-text) {
  white-space: nowrap;
}
.association-workspace :deep(.pagination-footer--compact .table-footer-right) {
  min-width: 0;
  flex-wrap: nowrap;
  justify-content: flex-end;
}
.order-context {
  color: var(--el-text-color-primary);
  line-height: 1.5;
}
.order-context p {
  display: flex;
  gap: 12px;
  margin: 6px 0 0;
  color: var(--el-text-color-regular);
  overflow-wrap: anywhere;
}
.order-context p span {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}
.association-panes {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  gap: 16px;
}
.association-pane {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-light);
}
.pane-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
}
.pane-heading h3 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
}
.pane-heading > span,
.muted {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.pane-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.receipt-list > .association-receipt-card,
.draft-list > .association-receipt-card {
  margin-bottom: 10px;
}
.receipt-list > .association-receipt-card:last-child,
.draft-list > .association-receipt-card:last-child {
  margin-bottom: 0;
}
.source-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
.source-tabs :deep(.el-tabs__content) {
  display: none;
}
.candidate-search {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.candidate-range {
  width: 126px;
}
.candidate-keyword {
  flex: 1;
  min-width: 160px;
}
.pane-description {
  margin: 10px 0 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.pane-note {
  margin-top: 0;
}
.staged-label {
  color: var(--el-color-primary);
  font-size: 13px;
}
.draft-change {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
}
.association-path {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.association-path strong {
  color: var(--el-text-color-primary);
}
.move-destinations {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px 20px;
}
.move-destinations .el-radio {
  height: auto;
  margin-right: 0;
  line-height: 1.5;
}
.move-preview {
  padding: 10px 12px;
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 6px;
  background: var(--el-color-primary-light-9);
  color: var(--el-text-color-primary);
  overflow-wrap: anywhere;
}
.move-preview .association-path {
  margin: 5px 0;
}
.receipt-warning {
  margin-top: 12px;
}
.association-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.footer-summary {
  color: var(--el-text-color-regular);
  font-size: 13px;
  text-align: left;
}
.footer-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
}
.footer-actions .el-button + .el-button {
  margin-left: 0;
}
</style>
