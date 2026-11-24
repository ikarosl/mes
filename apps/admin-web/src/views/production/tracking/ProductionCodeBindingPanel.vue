<template>
  <div class="code-binding-panel">
    <section class="binding-section">
      <div class="setup-fields">
        <div class="field">
          <label for="binding-task">当前任务</label>
          <RemoteSearchSelect
            id="binding-task"
            :model-value="batchId"
            :options="taskSearch.options.value"
            :loading="taskSearch.loading.value"
            :error="taskSearch.error.value"
            :has-more="taskSearch.hasMore.value"
            :disabled="locked || changeVisible"
            placeholder="搜索任务号 / 产品"
            @search="taskSearch.search"
            @open="taskSearch.search"
            @refresh="taskSearch.search"
            @update:model-value="changeBatch"
          />
        </div>
        <div class="field">
          <label for="binding-personnel">登记人员</label>
          <el-select
            id="binding-personnel"
            ref="personnelSelect"
            v-model="personnelId"
            filterable
            :disabled="locked || changeVisible"
            :loading="personnelLoading"
            placeholder="请选择现场人员"
          >
            <el-option
              v-for="person in personnel"
              :key="person.id"
              :value="person.id"
              :label="`${person.code} / ${person.name}`"
            />
          </el-select>
        </div>
        <el-button
          :loading="contextLoading || personnelLoading"
          :disabled="submitting || changeVisible"
          @click="refreshSetup"
          >刷新任务与人员</el-button
        >
      </div>
      <el-alert
        v-if="contextError"
        :title="contextError"
        type="error"
        :closable="false"
        show-icon
      />
      <el-alert
        v-if="personnelError"
        :title="personnelError"
        type="error"
        :closable="false"
        show-icon
      />
      <div
        v-if="context"
        class="task-summary"
      >
        <strong>{{ context.batch.batchNo }}</strong>
        <span>{{ context.batch.productCode }} / {{ context.batch.productName }}</span>
        <el-tag :type="batchStatusMeta(context.batch.status).type">{{
          batchStatusMeta(context.batch.status).label
        }}</el-tag>
      </div>
      <InlineHint
        v-if="context && !taskCanBind"
        tone="warning"
      >
        <template v-if="context.batch.orderType === 'research'"
          >研发任务不使用追踪卡及单件刻码。</template
        >
        <template v-else>单件刻码仅在批量任务已开工且任务信息有效时绑定，请核对任务状态。</template>
      </InlineHint>
      <form
        class="binding-fields"
        @submit.prevent="lookupCard"
      >
        <div class="field card-input-field">
          <label for="binding-card">追踪卡号</label>
          <div class="input-actions">
            <el-input
              id="binding-card"
              ref="cardInput"
              v-model="cardNo"
              :disabled="locked || !batchId || changeVisible"
              placeholder="扫码或输入完整卡号，仅查询追踪卡"
              maxlength="160"
              clearable
              @input="cardInputChanged"
              @blur="normalizeCardNo"
            />
            <el-button
              native-type="submit"
              :loading="cardLoading"
              :disabled="locked || !batchId || changeVisible"
              >查询卡</el-button
            >
          </div>
        </div>
        <div class="field mark-code-field">
          <label for="binding-mark-code">单件刻码起始号</label>
          <el-input
            id="binding-mark-code"
            ref="codeInput"
            v-model="markCode"
            :disabled="locked || changeVisible"
            :aria-invalid="Boolean(markCodeError) || codeAvailability.unavailable.value"
            aria-describedby="binding-mark-code-feedback"
            aria-required="true"
            placeholder="绑定后自动递增，可修改，整页刷新留空"
            maxlength="32"
            inputmode="numeric"
            @blur="normalizeMarkCode"
          />
          <div
            id="binding-mark-code-feedback"
            class="mark-code-feedback"
          >
            <el-text
              role="status"
              size="small"
              :type="markCodeError ? 'danger' : codeAvailability.tone.value"
              >{{ markCodeError || codeAvailability.message.value }}</el-text
            >
            <el-button
              v-if="codeAvailability.failed.value"
              link
              type="primary"
              size="small"
              :disabled="locked || changeVisible"
              @click="retryCodeCheck"
              >重新查重</el-button
            >
          </div>
        </div>
        <div class="binding-actions">
          <el-button
            type="primary"
            :loading="submitting"
            :disabled="
              locked ||
              cardLoading ||
              !taskCanBind ||
              changeVisible ||
              codeAvailability.unavailable.value ||
              !hasValidMarkCode
            "
            @click="bind"
            >绑定单件刻码</el-button
          >
          <el-button
            type="primary"
            plain
            :disabled="
              locked ||
              cardLoading ||
              !taskCanBind ||
              changeVisible ||
              !hasValidMarkCode ||
              !currentCard ||
              Boolean(cardBlockedReason)
            "
            @click="openBatchPreview"
            >批量预览</el-button
          >
        </div>
      </form>
      <div class="code-preview">
        <span>完整追溯码预览</span><strong>{{ fullCode }}</strong>
      </div>
      <SubmissionRecoveryNotice
        v-if="recovery"
        :status="intentStatus"
        :busy="submitting"
        records-label="下方任务单件刻码记录"
        :retry-disabled="changeVisible"
        allow-restart
        @retry="bind"
        @restart="restart"
      />
      <p
        v-if="recovery"
        class="binding-note"
      >
        原提交：<strong>{{ pendingCodeLabel }}</strong
        >。重试沿用原卡、刻码、登记人员和请求，确认成功前不推进序列。
      </p>
      <InlineHint
        v-if="batchPreviewTarget && !batchPreviewVisible"
        tone="warning"
      >
        批量绑定结果待核对，已保留本次提交。
        <el-button
          link
          type="primary"
          @click="batchPreviewVisible = true"
          >返回批量绑定</el-button
        >
      </InlineHint>
      <el-text
        v-if="resultLabel"
        type="success"
        >{{ resultLabel }}</el-text
      >
      <el-alert
        v-if="cardError"
        :title="cardError"
        type="error"
        :closable="false"
        show-icon
      />
      <template v-if="currentCard">
        <el-descriptions
          :column="4"
          border
        >
          <el-descriptions-item
            label="当前卡"
            :span="2"
          >
            <el-space wrap>
              <span>{{ currentCard.cardNo }}</span>
              <TrackingQuantityCorrectionLink
                :card="currentCard"
                :disabled="locked || changeVisible || cardLoading"
              />
            </el-space>
          </el-descriptions-item>
          <el-descriptions-item
            label="卡状态"
            :span="2"
            ><el-tag :type="trackingCardStatus(currentCard.status).type">{{
              trackingCardStatus(currentCard.status).label
            }}</el-tag></el-descriptions-item
          >
          <el-descriptions-item label="卡剩余量"
            ><strong
              >{{ formatQuantity(currentCard.quantity) }} {{ currentCard.unit }}</strong
            ></el-descriptions-item
          >
          <el-descriptions-item label="有效绑定量"
            ><strong>{{ currentCard.itemMarking.activeCount }}</strong></el-descriptions-item
          >
          <el-descriptions-item label="待绑量">
            <strong :class="{ 'pending-quantity': (remainingToBind ?? 0) > 0 }">
              {{ remainingToBind }}
            </strong>
          </el-descriptions-item>
          <el-descriptions-item label="已报废编码">{{
            currentCard.itemMarking.scrappedCount
          }}</el-descriptions-item>
        </el-descriptions>
        <InlineHint
          v-if="cardBlockedReason"
          tone="warning"
          >{{ cardBlockedReason }}</InlineHint
        >
      </template>
      <p class="binding-note">扫码或手填追踪卡号，核对后绑定。</p>
    </section>
    <section class="binding-section">
      <h2>单件刻码记录</h2>
      <p class="binding-note">
        选择任务后查询本任务记录；未选择任务时，可直接用实际刻码查询全部任务。
      </p>
      <TrackingItemMarkWorkspace
        ref="records"
        :batch-id="batchId || ''"
        :personnel-id="personnelId"
        :target-card="taskCanBind && !cardLoading && !cardError ? currentCard : null"
        :locked="locked || scrapCorrectionVisible || Boolean(batchPreviewTarget)"
        @lock="workspaceLocked = $event"
        @choose-personnel="choosePersonnel"
        @saved="workspaceSaved"
        @correct-scrap="openScrapCorrection"
      />
    </section>
    <TrackingBatchItemMarkDialog
      :visible="batchPreviewVisible"
      :target="batchPreviewTarget"
      :refresh-target="refreshBatchBindingTarget"
      @saved="batchSaved"
      @discard="closeBatchPreview"
      @inspect-records="batchPreviewVisible = false"
    />
    <TrackingAbnormalityCorrectionDialog
      v-model:visible="scrapCorrectionVisible"
      :target="scrapCorrectionTarget"
      route-name="production-workbench"
      @changed="cardChanged"
    />
  </div>
</template>
<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import type { SelectInstance } from 'element-plus';
import type { ProductionTrackingItemMark } from '@company/contracts';
import RemoteSearchSelect from '../../../components/RemoteSearchSelect.vue';
import InlineHint from '../../../components/InlineHint.vue';
import SubmissionRecoveryNotice from '../../../components/SubmissionRecoveryNotice.vue';
import { formatQuantity } from '../../../utils/quantity';
import { batchStatusMeta } from '../shared/production-status';
import { trackingCardStatus } from './tracking-presentation';
import TrackingItemMarkWorkspace from './TrackingItemMarkWorkspace.vue';
import TrackingAbnormalityCorrectionDialog from './TrackingAbnormalityCorrectionDialog.vue';
import TrackingBatchItemMarkDialog from './TrackingBatchItemMarkDialog.vue';
import TrackingQuantityCorrectionLink from './TrackingQuantityCorrectionLink.vue';
import type { BatchItemMarkBindingTarget } from './use-batch-item-mark-binding';
import type { TrackingAbnormalityCorrectionTarget } from './use-tracking-abnormality-correction';
import { useCodeBinding } from './use-code-binding';

defineOptions({ name: 'ProductionCodeBindingPanel' });
const records = ref<InstanceType<typeof TrackingItemMarkWorkspace>>();
const personnelSelect = ref<SelectInstance>();
function choosePersonnel() {
  personnelSelect.value?.focus();
  personnelSelect.value?.$el.scrollIntoView({ block: 'center' });
}
const workspaceLocked = ref(false);
const scrapCorrectionVisible = ref(false);
const scrapCorrectionTarget = ref<TrackingAbnormalityCorrectionTarget | null>(null);
const batchPreviewTarget = shallowRef<BatchItemMarkBindingTarget | null>(null);
const batchPreviewVisible = ref(false);
const changeVisible = computed(
  () => workspaceLocked.value || scrapCorrectionVisible.value || !!batchPreviewTarget.value,
);
const {
  batchId,
  personnelId,
  cardNo,
  markCode,
  context,
  contextLoading,
  contextError,
  personnel,
  personnelLoading,
  personnelError,
  currentCard,
  cardLoading,
  cardError,
  submitting,
  intentStatus,
  resultLabel,
  recovery,
  pendingCodeLabel,
  locked,
  cardInput,
  codeInput,
  taskSearch,
  taskCanBind,
  hasValidMarkCode,
  markCodeError,
  normalizeMarkCode,
  codeAvailability,
  fullCode,
  remainingToBind,
  cardBlockedReason,
  changeBatch,
  lookupCard,
  cardInputChanged,
  normalizeCardNo,
  bind,
  prepareBatchBinding,
  refreshBatchBindingTarget,
  batchBindingSaved,
  restart,
  refreshSetup,
  cardChanged,
} = useCodeBinding(
  async () => {
    await records.value?.reload();
  },
  () => changeVisible.value,
  () => !!batchPreviewTarget.value,
);
function openBatchPreview(): void {
  const target = prepareBatchBinding();
  if (!target) return;
  batchPreviewTarget.value = target;
  batchPreviewVisible.value = true;
}
function closeBatchPreview(): void {
  batchPreviewVisible.value = false;
  batchPreviewTarget.value = null;
}
async function batchSaved(
  target: BatchItemMarkBindingTarget,
  lastCode: string,
  count: number,
): Promise<void> {
  closeBatchPreview();
  await batchBindingSaved(target, lastCode, count);
}
function retryCodeCheck(): void {
  codeInput.value?.focus();
  void codeAvailability.check();
}
async function workspaceSaved(): Promise<void> {
  await Promise.all([codeAvailability.check(), ...(currentCard.value ? [lookupCard()] : [])]);
}
function openScrapCorrection(item: ProductionTrackingItemMark): void {
  if (changeVisible.value || locked.value || !item.scrap) return;
  scrapCorrectionTarget.value = {
    action: 'correct-scrap',
    cardId: item.trackingCardId,
    cardNo: item.cardNo,
    abnormalityId: item.scrap.abnormalityId,
    itemMarkId: item.id,
  };
  scrapCorrectionVisible.value = true;
}
</script>
<style scoped>
.code-binding-panel {
  display: grid;
  gap: 16px;
}
.binding-section {
  display: grid;
  gap: 16px;
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.binding-section h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.setup-fields,
.binding-fields {
  display: grid;
  grid-template-columns: minmax(300px, 1.5fr) minmax(200px, 1fr) auto;
  align-items: end;
  gap: 16px;
}
.binding-fields {
  align-items: stretch;
  row-gap: 0;
}
.binding-fields > .field {
  display: grid;
  grid-template-rows: subgrid;
  grid-row: 1 / span 2;
}
.binding-fields > .mark-code-field {
  grid-row: 1 / span 3;
}
.binding-actions {
  display: flex;
  gap: 8px;
  grid-row: 2;
  align-self: start;
}
.binding-actions .el-button {
  margin-left: 0;
}
.field {
  min-width: 0;
}
.field > label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  color: var(--el-text-color-regular);
}
.field .el-select {
  width: 100%;
}
.input-actions {
  display: flex;
  gap: 8px;
}
.input-actions .el-input {
  min-width: 0;
}
.mark-code-feedback {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 8px;
}
.mark-code-feedback .el-text:not(:empty) {
  margin-top: 4px;
}
.task-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.pending-quantity {
  color: var(--el-color-warning-dark-2);
}
.code-preview {
  display: grid;
  gap: 8px;
}
.code-preview > span,
.binding-note {
  color: var(--el-text-color-regular);
  font-size: 12px;
}
.code-preview > strong {
  color: var(--el-text-color-primary);
  font-size: 18px;
  overflow-wrap: anywhere;
}
.binding-note {
  margin: 0;
  line-height: 1.7;
}
</style>
