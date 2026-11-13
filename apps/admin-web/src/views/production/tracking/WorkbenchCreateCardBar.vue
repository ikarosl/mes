<template>
  <div class="create-card-bar">
    <form
      class="create-controls"
      @submit.prevent="createCard"
    >
      <label for="workbench-create-quantity">本盘数量</label>
      <el-input-number
        id="workbench-create-quantity"
        v-model="createQuantity"
        :min="1"
        :max="99999999"
        :precision="0"
        :step="1"
        controls-position="right"
        :disabled="disabled || locked || !canCreate"
      />
      <el-button
        native-type="submit"
        type="primary"
        plain
        :loading="creating"
        :disabled="disabled || locked || !canCreate"
      >
        生成并到站
      </el-button>
    </form>
    <span class="create-hint">现场建卡并登记首站到站，沿用上方登记人员。</span>
    <SubmissionRecoveryNotice
      v-if="createRecovery"
      :status="createStatus"
      :busy="creating"
      records-label="追踪卡列表"
      :retry-disabled="disabled || !active"
      allow-restart
      @retry="createCard"
      @restart="restartCreate"
    />
  </div>
</template>

<script setup lang="ts">
import SubmissionRecoveryNotice from '../../../components/SubmissionRecoveryNotice.vue';
import { computed, onActivated, onDeactivated, onScopeDispose, ref, watch } from 'vue';
import type {
  CreateProductionTrackingCardPayload,
  ProductionTrackingCardDetail,
} from '@company/contracts';
import { productionTrackingApi } from '../../../api/production/tracking';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { useTabsStore } from '../../../stores/tabs';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';

defineOptions({ name: 'WorkbenchCreateCardBar' });
const props = defineProps<{
  batchId: string | null;
  personnelId: string;
  canCreate: boolean;
  disabled: boolean;
}>();
const emit = defineEmits<{
  (event: 'update:locked', locked: boolean): void;
  (event: 'update:busy', busy: boolean): void;
  (event: 'created', card: ProductionTrackingCardDetail): void;
}>();
const active = ref(true);
onActivated(() => {
  active.value = true;
});
onDeactivated(() => {
  active.value = false;
});
const creating = ref(false);
const createQuantity = ref<number | undefined>(1);
const createIntent = useIdempotentIntent('建卡');
const createStatus = ref<IdempotentIntentStatus>('idle');
const createRecovery = computed(() => createStatus.value !== 'idle');
const locked = computed(() => creating.value || createRecovery.value);
watch(locked, (value) => emit('update:locked', value), { immediate: true, flush: 'sync' });
watch(creating, (value) => emit('update:busy', value), { immediate: true, flush: 'sync' });
let submission: { batchId: string; body: CreateProductionTrackingCardPayload } | null = null;
// 已成功生成的盘量作为本任务下一盘默认，不再计作未保存草稿。
let quantityBaseline = 1;

function resetDraft(): void {
  createIntent.reset();
  createStatus.value = 'idle';
  submission = null;
  createQuantity.value = quantityBaseline;
}
watch(
  () => props.batchId,
  () => {
    if (!locked.value) {
      quantityBaseline = 1;
      resetDraft();
    }
  },
);
async function confirmDiscard(message: string): Promise<boolean> {
  if (creating.value) return false;
  try {
    await RouteMessageBox.confirm(message, '放弃建卡', { type: 'warning' });
    resetDraft();
    return true;
  } catch {
    return false;
  }
}
async function allowBatchChange(): Promise<boolean> {
  if (locked.value) return false;
  if (createQuantity.value === quantityBaseline) return true;
  return confirmDiscard('本盘数量尚未用于建卡，切换任务将放弃当前填写。确认切换？');
}
async function allowClose(): Promise<boolean> {
  if (creating.value) return false;
  if (createRecovery.value)
    return confirmDiscard('建卡提交结果尚未确认，请先核对追踪卡列表。确认放弃并关闭工作台？');
  if (createQuantity.value === quantityBaseline) return true;
  return confirmDiscard('本盘数量尚未用于建卡，确认放弃并关闭工作台？');
}
function restartCreate(): void {
  if (!active.value || creating.value) return;
  createIntent.reset();
  createStatus.value = 'idle';
  submission = null;
}
async function createCard(): Promise<void> {
  if (creating.value || !active.value || props.disabled) return;
  if (!submission) {
    if (!props.canCreate || !props.batchId) return;
    if (!props.personnelId) {
      EMessage.warning('请选择上方登记人员');
      return;
    }
    const quantity = createQuantity.value;
    if (quantity === undefined || !Number.isSafeInteger(quantity) || quantity <= 0) {
      EMessage.warning('请填写大于0的整数本盘数量');
      return;
    }
    submission = {
      batchId: props.batchId,
      body: { quantity, personnelId: props.personnelId, remark: null },
    };
  }
  const frozen = submission;
  creating.value = true;
  try {
    const result = await createIntent.execute(
      {
        intentType: 'production.tracking.create-and-arrive',
        params: { batchId: frozen.batchId },
        query: {},
        body: frozen.body,
      },
      (key) => productionTrackingApi.create(frozen.batchId, frozen.body, key),
    );
    quantityBaseline = frozen.body.quantity;
    emit('created', result);
    EMessage.success('追踪卡已生成，首工序已到站');
  } catch (error) {
    EMessage.error(error, '建卡失败');
  } finally {
    createStatus.value = createIntent.getStatus();
    if (!createRecovery.value) submission = null;
    creating.value = false;
  }
}
const unregister = useTabsStore().registerCloseGuard('production-workbench', allowClose);
onScopeDispose(unregister);
defineExpose({ allowBatchChange });
</script>

<style scoped>
.create-card-bar {
  display: grid;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.create-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.create-controls label {
  color: var(--el-text-color-regular);
  font-size: 14px;
}
.create-controls .el-input-number {
  width: 140px;
}
.create-controls .el-button {
  margin-left: 0;
}
.create-hint {
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.7;
}
</style>
