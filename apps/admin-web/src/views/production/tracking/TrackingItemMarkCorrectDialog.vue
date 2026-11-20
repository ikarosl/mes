<template>
  <el-dialog
    :model-value="visible"
    title="更正绑定编码"
    :width="DialogWidth.md"
    :before-close="beforeClose"
    @update:model-value="requestClose"
  >
    <el-descriptions
      :column="1"
      border
    >
      <el-descriptions-item label="追踪卡">{{ item?.cardNo || '—' }}</el-descriptions-item>
      <el-descriptions-item label="原实际刻码"
        ><strong>{{ item?.markCode || '—' }}</strong></el-descriptions-item
      >
    </el-descriptions>
    <p class="correction-note">
      更正记录保留原码、新码和原因。原绑定卡、数量和连续绑定的起始号保持原值。
    </p>
    <SubmissionRecoveryNotice
      :status="intentStatus"
      :busy="submitting"
      records-label="单件刻码及更正记录"
      :retry-disabled="!reads.isActive()"
      allow-restart
      @retry="submit"
      @restart="restart"
    />
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      show-icon
    />
    <el-form
      v-loading="loading"
      label-position="top"
      :disabled="submitting || recovery"
    >
      <el-form-item
        label="正确的实际刻码"
        required
      >
        <el-input
          ref="codeInput"
          v-model="markCode"
          :aria-invalid="Boolean(markCodeError) || codeAvailability.unavailable.value"
          :aria-describedby="markCodeFeedbackId"
          aria-required="true"
          maxlength="32"
          inputmode="numeric"
          placeholder="填写实物上的实际刻码"
          @blur="normalizeMarkCode"
        />
        <div
          :id="markCodeFeedbackId"
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
            :disabled="submitting || recovery"
            @click="retryCodeCheck"
            >重新查重</el-button
          >
        </div>
      </el-form-item>
      <el-form-item
        label="更正原因"
        required
      >
        <el-input
          v-model="reason"
          type="textarea"
          :rows="3"
          maxlength="1000"
          show-word-limit
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button
        :disabled="submitting"
        @click="requestClose(false)"
        >取消</el-button
      >
      <el-button
        :loading="loading"
        :disabled="submitting || recovery"
        @click="load"
        >刷新办理依据</el-button
      >
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="
          recovery ||
          loading ||
          Boolean(error) ||
          codeAvailability.unavailable.value ||
          !hasValidMarkCode ||
          !currentMark ||
          !card
        "
        @click="submit"
        >确认更正编码</el-button
      >
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import {
  isValidTrackingItemMarkCode,
  normalizeTrackingItemMarkCode,
  TRACKING_ITEM_MARK_CODE_ERROR_MESSAGE,
} from '@company/utils';
import { useItemMarkCodeAvailability } from './use-item-mark-code-availability';
import { computed, onScopeDispose, ref, useId, watch } from 'vue';
import type { InputInstance } from 'element-plus';
import type {
  CorrectProductionTrackingItemMarkPayload,
  ProductionTrackingCardDetail,
  ProductionTrackingItemMark,
} from '@company/contracts';
import { productionTrackingApi } from '../../../api/production/tracking';
import SubmissionRecoveryNotice from '../../../components/SubmissionRecoveryNotice.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { confirmSubmissionClose } from '../../../composables/idempotency/submission-recovery';
import { useTabsStore } from '../../../stores/tabs';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';

defineOptions({ name: 'TrackingItemMarkCorrectDialog' });
const props = defineProps<{ visible: boolean; item: ProductionTrackingItemMark | null }>();
const emit = defineEmits<{
  'update:visible': [value: boolean];
  changed: [card: ProductionTrackingCardDetail];
}>();
const markCode = ref(''),
  reason = ref(''),
  card = ref<ProductionTrackingCardDetail | null>(null),
  currentMark = ref<ProductionTrackingItemMark | null>(null);
const loading = ref(false),
  error = ref(''),
  submitting = ref(false),
  intentStatus = ref<IdempotentIntentStatus>('idle');
const intent = useIdempotentIntent('更正绑定编码');
const recovery = computed(() => intentStatus.value !== 'idle');
const reads = useLatestReadRequest(() => {
  loading.value = false;
});
const markCodeFeedbackId = useId();
const codeInput = ref<InputInstance>();
const hasValidMarkCode = computed(() => isValidTrackingItemMarkCode(markCode.value));
const markCodeError = computed(() =>
  markCode.value && !hasValidMarkCode.value ? TRACKING_ITEM_MARK_CODE_ERROR_MESSAGE : '',
);
const codeAvailability = useItemMarkCodeAvailability(
  markCode,
  () =>
    props.visible &&
    !submitting.value &&
    !recovery.value &&
    currentMark.value !== null &&
    normalizeTrackingItemMarkCode(markCode.value) !== currentMark.value.markCode,
);
function retryCodeCheck(): void {
  codeInput.value?.focus();
  void codeAvailability.check();
}
function normalizeMarkCode(): void {
  if (!submitting.value && !recovery.value)
    markCode.value = normalizeTrackingItemMarkCode(markCode.value);
}
let submission: {
  cardId: string;
  markId: string;
  body: CorrectProductionTrackingItemMarkPayload;
} | null = null;
let closeApproved = false;
async function load(): Promise<void> {
  const target = props.item;
  if (!target || !props.visible || submitting.value || recovery.value || !reads.isActive()) return;
  const read = reads.begin(() => props.visible && props.item?.id === target.id);
  loading.value = true;
  error.value = '';
  try {
    const [detail, mark] = await Promise.all([
      productionTrackingApi.detail(target.trackingCardId, {
        signal: read.signal,
        skipErrorHandling: true,
      }),
      productionTrackingApi.itemMark(target.trackingCardId, target.id, {
        signal: read.signal,
        skipErrorHandling: true,
      }),
    ]);
    if (!read.isCurrent()) return;
    if (
      detail.id !== target.trackingCardId ||
      detail.productionBatchId !== target.productionBatchId ||
      mark.id !== target.id ||
      mark.trackingCardId !== detail.id
    )
      throw new Error('绑定依据与原记录不一致，请刷新记录后重新打开。');
    if (mark.markCode !== target.markCode || mark.version !== target.version)
      throw new Error('该绑定的实际刻码已被更正；请刷新记录并核对最新编码后重新打开。');
    card.value = detail;
    currentMark.value = mark;
  } catch (failure) {
    if (read.isCurrent())
      error.value = failure instanceof Error ? failure.message : '更正办理依据加载失败，请重试';
  } finally {
    if (read.isCurrent()) loading.value = false;
  }
}
function restart(): void {
  if (!submitting.value) {
    intent.reset();
    intentStatus.value = 'idle';
    submission = null;
  }
}
async function allowClose(): Promise<boolean> {
  if (submitting.value) return false;
  if (!props.visible) return true;
  return confirmSubmissionClose(intent.getStatus(), {
    entityLabel: '更正绑定编码',
    dirty: Boolean(reason.value.trim() || markCode.value !== props.item?.markCode),
  });
}
async function requestClose(value: boolean): Promise<void> {
  if (!value && closeApproved) {
    closeApproved = false;
    emit('update:visible', false);
    return;
  }
  if (!value && (await allowClose())) {
    restart();
    emit('update:visible', false);
  }
}
async function beforeClose(done: () => void): Promise<void> {
  if (await allowClose()) {
    restart();
    closeApproved = true;
    done();
  }
}
async function submit(): Promise<void> {
  if (submitting.value || !reads.isActive()) return;
  if (!submission) {
    normalizeMarkCode();
    if (
      !props.item ||
      !currentMark.value ||
      !card.value ||
      loading.value ||
      error.value ||
      codeAvailability.unavailable.value ||
      !hasValidMarkCode.value
    )
      return;
    if (markCode.value === currentMark.value.markCode) {
      EMessage.warning('请填写与原记录不同的正确刻码');
      return;
    }
    if (!reason.value.trim()) {
      EMessage.warning('请填写更正原因');
      return;
    }
    submission = {
      cardId: props.item.trackingCardId,
      markId: props.item.id,
      body: {
        version: currentMark.value.version,
        markCode: markCode.value,
        reason: reason.value.trim(),
      },
    };
  }
  const command = submission;
  submitting.value = true;
  try {
    const result = await intent.execute(
      {
        intentType: 'production.tracking.item-mark.correct',
        params: { cardId: command.cardId, markId: command.markId },
        query: {},
        body: command.body,
      },
      (key) =>
        productionTrackingApi.correctItemMark(command.cardId, command.markId, command.body, key),
    );
    EMessage.success(`绑定编码已更正为 ${command.body.markCode}`);
    emit('changed', result);
    emit('update:visible', false);
  } catch (failure) {
    EMessage.error(failure, '更正绑定编码失败');
  } finally {
    intentStatus.value = intent.getStatus();
    if (intentStatus.value === 'idle') submission = null;
    submitting.value = false;
  }
}
watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      reads.invalidate();
      return;
    }
    markCode.value = props.item?.markCode ?? '';
    closeApproved = false;
    reason.value = '';
    card.value = null;
    currentMark.value = null;
    error.value = '';
    restart();
    void load();
  },
);
onScopeDispose(useTabsStore().registerCloseGuard('production-workbench', allowClose));
</script>
<style scoped>
.el-form {
  margin-top: 16px;
}
.el-alert {
  margin-top: 12px;
}
.correction-note {
  margin: 12px 0 0;
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.7;
}
.mark-code-feedback {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 8px;
  width: 100%;
  line-height: 1.5;
}
.mark-code-feedback .el-text:not(:empty) {
  margin-top: 4px;
}
</style>
