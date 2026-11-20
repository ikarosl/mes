<template>
  <el-dialog
    :model-value="visible"
    title="撤销单件刻码绑定"
    :width="DialogWidth.md"
    :before-close="beforeClose"
    @update:model-value="requestClose"
  >
    <p class="mark-identity">{{ item?.fullCode || '—' }}</p>
    <InlineHint>保存后释放号码，保留原登记和撤销原因。实物报废请在原卡登记异常。</InlineHint>
    <SubmissionRecoveryNotice
      :status="intentStatus"
      :busy="submitting"
      records-label="单件刻码绑定记录"
      :retry-disabled="!reads.isActive()"
      allow-restart
      @retry="submit"
      @restart="restart"
    />
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
    />
    <el-alert
      v-if="card && !canCancelCard"
      title="本卡已停止办理，仅可查看绑定记录。"
      type="warning"
      :closable="false"
    />
    <el-form
      v-loading="loading"
      label-position="top"
      :disabled="submitting || recovery"
    >
      <el-form-item
        label="撤销原因"
        required
        ><el-input
          v-model="reason"
          type="textarea"
          :rows="4"
          maxlength="1000"
          show-word-limit
      /></el-form-item>
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
        type="danger"
        :loading="submitting"
        :disabled="recovery || loading || Boolean(error) || !canCancelCard"
        @click="submit"
        >撤销</el-button
      >
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import type {
  CancelProductionTrackingItemMarkPayload,
  ProductionTrackingCardDetail,
  ProductionTrackingItemMark,
} from '@company/contracts';
import { productionTrackingApi } from '../../../api/production/tracking';
import InlineHint from '../../../components/InlineHint.vue';
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

const props = defineProps<{ visible: boolean; item: ProductionTrackingItemMark | null }>();
const emit = defineEmits<{
  'update:visible': [value: boolean];
  changed: [card: ProductionTrackingCardDetail];
}>();
const reason = ref(''),
  card = ref<ProductionTrackingCardDetail | null>(null),
  loading = ref(false),
  error = ref(''),
  submitting = ref(false);
const intent = useIdempotentIntent('撤销误绑'),
  intentStatus = ref<IdempotentIntentStatus>('idle');
const recovery = computed(() => intentStatus.value !== 'idle');
const canCancelCard = computed(
  () => card.value?.status === 'unused' || card.value?.status === 'in_progress',
);
const reads = useLatestReadRequest(() => {
  loading.value = false;
});
let submission: {
  cardId: string;
  markId: string;
  body: CancelProductionTrackingItemMarkPayload;
} | null = null;
async function load(): Promise<void> {
  const target = props.item;
  if (!target || !props.visible || submitting.value || recovery.value || !reads.isActive()) return;
  const read = reads.begin(() => props.visible && props.item?.id === target.id);
  loading.value = true;
  error.value = '';
  try {
    const value = await productionTrackingApi.detail(target.trackingCardId, {
      signal: read.signal,
      skipErrorHandling: true,
    });
    if (!read.isCurrent()) return;
    if (value.id !== target.trackingCardId) throw new Error('追踪卡依据与原绑定不一致，请重试');
    card.value = value;
  } catch (failure) {
    if (read.isCurrent())
      error.value = failure instanceof Error ? failure.message : '撤销办理依据加载失败';
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
    entityLabel: '撤销误绑',
    dirty: Boolean(reason.value.trim()),
  });
}
async function requestClose(value: boolean): Promise<void> {
  if (!value && (await allowClose())) {
    restart();
    emit('update:visible', false);
  }
}
async function beforeClose(done: () => void): Promise<void> {
  if (await allowClose()) {
    restart();
    done();
  }
}
async function submit(): Promise<void> {
  if (submitting.value || !reads.isActive()) return;
  if (!submission) {
    if (!props.item || !card.value || loading.value || error.value || !canCancelCard.value) return;
    if (!reason.value.trim()) {
      EMessage.warning('请填写撤销原因');
      return;
    }
    submission = {
      cardId: props.item.trackingCardId,
      markId: props.item.id,
      body: { version: card.value.version, reason: reason.value.trim() },
    };
  }
  const command = submission;
  submitting.value = true;
  try {
    const result = await intent.execute(
      {
        intentType: 'production.tracking.item-mark.cancel',
        params: { cardId: command.cardId, markId: command.markId },
        query: {},
        body: command.body,
      },
      (key) =>
        productionTrackingApi.cancelItemMark(command.cardId, command.markId, command.body, key),
    );
    EMessage.success('误绑已撤销');
    emit('changed', result);
    emit('update:visible', false);
  } catch (failure) {
    EMessage.error(failure, '撤销误绑失败');
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
    reason.value = '';
    card.value = null;
    error.value = '';
    restart();
    void load();
  },
);
onScopeDispose(useTabsStore().registerCloseGuard('production-workbench', allowClose));
</script>
<style scoped>
.mark-identity {
  color: var(--el-text-color-primary);
  font-weight: 600;
  overflow-wrap: anywhere;
}
.el-form {
  margin-top: 16px;
}
.el-alert {
  margin-top: 12px;
}
</style>
