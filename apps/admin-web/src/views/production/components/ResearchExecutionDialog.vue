<template>
  <el-dialog
    :model-value="visible"
    title="结束本轮研发"
    :width="DialogWidth.md"
    :close-on-click-modal="false"
    :before-close="close"
    :show-close="!submitting"
    :close-on-press-escape="!submitting"
  >
    <p>{{ batch?.batchNo }} · {{ batch?.productName }}</p>
    <el-alert
      type="info"
      :closable="false"
      title="结束本轮研发后，进入正常结案：处理剩余需求及物料，填写产出清单并引用质检记录后送审。"
    />
    <el-alert
      v-if="stale && !retrying"
      type="warning"
      :closable="false"
      title="任务或产出依据已变化，请关闭后从最新任务重新核对结束。"
    />
    <p
      v-if="errorMessage"
      class="error-message"
    >
      {{ errorMessage }}
    </p>
    <template #footer>
      <el-button
        :disabled="submitting"
        @click="close()"
        >关闭</el-button
      >
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="submit"
        >{{ retrying ? '重试本次操作' : '确认' }}</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import { useTabsStore } from '../../../stores/tabs';
import type { ProductionBatchItem, ProductionExecutionCompletionResult } from '@company/contracts';
import { RequestError } from '@company/request';
import { productionResearchApi } from '../../../api/production-research';
import { useIdempotentIntent } from '../../../composables/idempotency/useIdempotentIntent';
import { DialogWidth } from '../../../utils/dialog';
import { toBeijingDateTimeInputValue } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';

const props = defineProps<{
  visible: boolean;
  batch: ProductionBatchItem | null;
}>();
const emit = defineEmits<{
  'update:visible': [boolean];
  changed: [batchId: string, completed: boolean];
}>();
defineOptions({ name: 'ResearchExecutionDialog' });
const isId = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9]\d*$/.test(value);
const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) &&
  toBeijingDateTimeInputValue(value) !== '';
const hasCompleteResult = (result: ProductionExecutionCompletionResult): boolean =>
  'closeoutId' in result &&
  isId(result.closeoutId) &&
  isTimestamp(result.executionCompletedAt) &&
  isId(result.executionCompletedById) &&
  /^\d+(\.0+)?$/.test(result.lastStepReportedQuantity);
const intent = useIdempotentIntent('研发执行记录');
const submitting = ref(false);
const retrying = ref(false);
const errorMessage = ref('');
const command = ref<{ batchId: string; version: number; closeoutVersion: number | null } | null>(
  null,
);
const stale = computed(
  () =>
    !command.value ||
    !props.batch ||
    props.batch.id !== command.value.batchId ||
    props.batch.status !== 'doing' ||
    props.batch.version !== command.value.version ||
    props.batch.closeoutVersion !== command.value.closeoutVersion,
);
const canSubmit = computed(
  () =>
    !submitting.value &&
    !!command.value &&
    (retrying.value ? intent.getStatus() === 'pending' : !stale.value),
);
watch(
  () => props.visible,
  (visible) => {
    if (!visible || !props.batch || intent.getStatus() !== 'idle') return;
    command.value = {
      batchId: props.batch.id,
      version: props.batch.version,
      closeoutVersion: props.batch.closeoutVersion,
    };
    errorMessage.value = '';
    retrying.value = false;
  },
);

async function close(done?: () => void): Promise<boolean> {
  if (!props.visible) return true;
  if (submitting.value) return false;
  if (intent.getStatus() !== 'idle') {
    try {
      await RouteMessageBox.confirm(
        '本次操作结果尚未确认。关闭后请先刷新任务核对状态，再发起新操作。',
        '关闭前核对',
        { confirmButtonText: '关闭并核对', cancelButtonText: '继续重试', type: 'warning' },
      );
    } catch {
      return false;
    }
  }
  intent.reset();
  command.value = null;
  emit('update:visible', false);
  done?.();
  return true;
}
onScopeDispose(useTabsStore().registerCloseGuard('production-tasks', () => close()));
defineExpose({ close, navigationLocked: computed(() => submitting.value || retrying.value) });

async function submit() {
  if (!canSubmit.value || !command.value) return;
  const current = command.value;
  const body = { version: current.version, closeoutVersion: current.closeoutVersion };
  submitting.value = true;
  errorMessage.value = '';
  try {
    await intent.execute(
      {
        intentType: 'production.research.complete',
        params: { batchId: current.batchId },
        query: {},
        body,
      },
      async (key) => {
        const result = await productionResearchApi.complete(current.batchId, body, key);
        if (
          !result ||
          result.productionBatchId !== current.batchId ||
          !['closing', 'completed'].includes(result.batchStatus) ||
          !Number.isInteger(result.version) ||
          result.version !== current.version + 1 ||
          !hasCompleteResult(result)
        )
          throw new RequestError('服务器未返回完整的操作结果，请重试本次操作以核对结果。', 502);
        return result;
      },
    );
    EMessage.success('本轮研发已结束，请核对产出与结案物料');
    emit('update:visible', false);
    emit('changed', current.batchId, true);
    command.value = null;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '操作失败，请刷新任务后重试';
    retrying.value = intent.getStatus() !== 'idle';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.error-message {
  color: var(--el-color-danger);
}
</style>
