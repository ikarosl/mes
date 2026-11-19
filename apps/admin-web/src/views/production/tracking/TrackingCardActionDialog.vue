<template>
  <el-dialog
    :model-value="visible"
    :title="dialogTitle"
    :width="DialogWidth.md"
    :before-close="beforeClose"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template v-if="editingCard">
      <el-descriptions
        :column="2"
        border
        class="context"
      >
        <el-descriptions-item label="追踪卡">{{ editingCard.cardNo }}</el-descriptions-item>
        <el-descriptions-item label="当前剩余盘量"
          >{{ formatQuantity(editingCard.quantity) }} {{ editingCard.unit }}</el-descriptions-item
        >
        <el-descriptions-item
          label="任务"
          :span="2"
          >{{ editingCard.batchNo }} · {{ editingCard.productName }}</el-descriptions-item
        >
      </el-descriptions>
      <SubmissionRecoveryNotice
        v-if="recovery"
        :status="intentStatus"
        :busy="submitting"
        records-label="追踪卡详情"
        :retry-disabled="!reads.isActive()"
        allow-restart
        @retry="submit"
        @restart="resetIntent"
      />
      <el-alert
        v-else-if="basisChanged"
        title="追踪卡数量或状态已更新，本次输入仍保留。请刷新核对办理依据，再检查当前盘量与异常后提交。"
        type="warning"
        show-icon
        :closable="false"
        class="context"
      />
      <el-alert
        v-if="basisError"
        :title="basisError"
        type="error"
        :closable="false"
        class="context"
      />
      <el-button
        :loading="basisLoading"
        :disabled="submitting || recovery"
        @click="refreshBasis"
        >刷新信息</el-button
      >
      <InlineHint v-if="editingAction === 'output'">
        本次将以当前剩余盘量
        <strong>{{ formatQuantity(editingCard.quantity) }} {{ editingCard.unit }}</strong>
        确认终检产出并完成末站报工。成品入库另行办理；未入库产出可在任务产出记录中填写原因撤销后重新终检。
      </InlineHint>
      <InlineHint v-else-if="editingAction === 'quantity'"
        >更正本盘后，各站后续沿用新盘量，已完成的交接报工保留原数量快照。</InlineHint
      >
      <InlineHint v-else-if="editingAction === 'void'"
        >人工作废后保留到站、交接和异常记录，本盘不能继续流转或确认产出；此操作不登记实物报废数量。</InlineHint
      >
      <el-form
        :model="form"
        label-width="116px"
        :disabled="formLocked"
        class="action-form"
      >
        <el-form-item
          v-if="needsPersonnel"
          :label="editingAction === 'output' ? '确认人员' : '登记人员'"
          required
        >
          <div class="personnel-select">
            <el-select
              v-model="form.personnelId"
              filterable
              placeholder="请选择现场人员"
              :loading="personnelLoading"
            >
              <el-option
                v-for="person in personnel"
                :key="person.id"
                :label="`${person.code} / ${person.name}`"
                :value="person.id"
              />
            </el-select>
            <el-button
              :loading="personnelLoading"
              @click="loadPersonnel"
              >刷新</el-button
            >
          </div>
          <div
            v-if="personnelError"
            class="error-text"
          >
            {{ personnelError }}
          </div>
        </el-form-item>
        <el-form-item
          v-if="editingAction === 'quantity'"
          label="更正后盘量"
          required
        >
          <el-input-number
            v-model="form.quantity"
            :min="1"
            :precision="0"
            :step="1"
          /><span class="unit">{{ editingCard.unit }}</span>
        </el-form-item>
        <TrackingAbnormalityFields
          v-if="
            editingAction === 'abnormality' || (editingAction === 'handling' && editingAbnormality)
          "
          v-model="abnormalityFields"
          v-model:scrapped-quantity="form.scrappedQuantity"
          :steps="abnormalitySteps"
          :quantity-limit="availableAbnormalityQuantity"
          :selected-resolution="selectedResolution"
          :unit="editingCard.unit"
          :readonly-details="editingAction === 'handling'"
          :resolution-required="editingAction === 'handling'"
          :allow-mixed-resolution="allowMixedResolution"
          :mixed-repaired-quantity="mixedRepairedQuantity"
          :mixed-resolution-error="mixedResolutionError"
          :label-search="labelSearch"
          @search="descriptionSearch.search"
          @refresh="descriptionSearch.retry"
          @load-more="descriptionSearch.loadMore"
          @toggle-resolution="setResolution"
        />
        <InlineHint
          v-if="handlingBlockedReason"
          tone="warning"
          class="settlement-summary"
          >{{ handlingBlockedReason }}</InlineHint
        >
        <InlineHint
          v-if="resolutionEffect"
          class="settlement-summary"
          >{{ resolutionEffect }}</InlineHint
        >
        <el-form-item
          v-if="editingAction !== 'abnormality' && editingAction !== 'handling'"
          :label="textLabel"
          :required="editingAction !== 'output'"
          ><el-input
            v-model="form.text"
            type="textarea"
            :rows="4"
            maxlength="1000"
            show-word-limit
        /></el-form-item>
      </el-form>
    </template>
    <template #footer>
      <el-button
        :disabled="submitting"
        @click="requestClose(false)"
        >取消</el-button
      >
      <el-button
        :type="editingAction === 'void' ? 'danger' : 'primary'"
        :loading="submitting"
        :disabled="
          succeeded ||
          recovery ||
          basisChanged ||
          basisLoading ||
          Boolean(basisError) ||
          Boolean(handlingBlockedReason) ||
          Boolean(mixedResolutionError)
        "
        @click="submit"
        >{{ TRACKING_ACTION_LABELS[editingAction] }}</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ProductionTrackingCardDetail } from '@company/contracts';
import SubmissionRecoveryNotice from '../../../components/SubmissionRecoveryNotice.vue';
import InlineHint from '../../../components/InlineHint.vue';
import TrackingAbnormalityFields from './TrackingAbnormalityFields.vue';
import { DialogWidth } from '../../../utils/dialog';
import { formatQuantity } from '../../../utils/quantity';
import { TRACKING_ACTION_LABELS } from './tracking-presentation';
import { useTrackingCardAction, type TrackingCardActionProps } from './use-tracking-card-action';

const props = defineProps<TrackingCardActionProps>();
const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'changed', card: ProductionTrackingCardDetail): void;
}>();
const {
  editingCard,
  editingAbnormality,
  editingAction,
  form,
  formLocked,
  availableAbnormalityQuantity,
  selectedResolution,
  setResolution,
  allowMixedResolution,
  mixedRepairedQuantity,
  mixedResolutionError,
  handlingBlockedReason,
  recovery,
  intentStatus,
  submitting,
  succeeded,
  basisChanged,
  basisError,
  basisLoading,
  reads,
  refreshBasis,
  needsPersonnel,
  personnelLoading,
  personnel,
  personnelError,
  loadPersonnel,
  involvedSteps,
  descriptionSearch,
  resolutionEffect,
  textLabel,
  beforeClose,
  requestClose,
  resetIntent,
  submit,
} = useTrackingCardAction(props, emit);

const dialogTitle = computed(() => {
  if (editingAction.value === 'abnormality' || editingAction.value === 'handling')
    return '随盘异常';
  return TRACKING_ACTION_LABELS[editingAction.value];
});
const abnormalityFields = computed({
  get: () => ({
    stepRecordId: form.stepRecordId,
    affectedQuantity: form.affectedQuantity,
    descriptionLabels: form.descriptionLabels,
  }),
  set: (fields) => {
    if (editingAction.value === 'handling') return;
    form.stepRecordId = fields.stepRecordId;
    form.affectedQuantity = fields.affectedQuantity;
    form.descriptionLabels = fields.descriptionLabels;
  },
});
const abnormalitySteps = computed(() => {
  const item = editingAbnormality.value;
  if (editingAction.value === 'handling' && item?.stepRecordId)
    return [{ stepRecordId: item.stepRecordId, stepName: item.stepName ?? '—' }];
  return involvedSteps.value;
});
const labelSearch = computed(() => ({
  inputValue: descriptionSearch.keyword.value,
  options: descriptionSearch.items.value,
  loading: descriptionSearch.loading.value,
  error: descriptionSearch.error.value,
  hasLoaded: descriptionSearch.hasLoaded.value,
  hasMore: descriptionSearch.hasMore.value,
}));
</script>

<style scoped>
.context {
  margin-bottom: 16px;
}
.action-form {
  margin-top: 20px;
}
.personnel-select {
  display: flex;
  gap: 8px;
  width: 100%;
}
.personnel-select .el-select {
  flex: 1;
}
.error-text {
  color: var(--el-color-danger);
}
.unit {
  margin-left: 8px;
}
.settlement-summary {
  margin-bottom: 16px;
}
</style>
