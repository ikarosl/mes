<template>
  <el-dialog
    :model-value="visible"
    :title="action === 'start' ? '开始研发' : '结束本轮研发'"
    :width="DialogWidth.md"
    :close-on-click-modal="false"
    :before-close="close"
  >
    <p>{{ batch?.batchNo }} · {{ batch?.productName }}</p>
    <el-alert
      v-if="action === 'start'"
      type="info"
      :closable="false"
      title="开始前须完成领料，或已部分领料并取得有效短批授权。研发过程无需逐工序报工。"
    />
    <el-alert
      v-else
      type="info"
      :closable="false"
      title="结束本轮研发后，进入正常结案：处理剩余需求及物料，填写产出清单并引用质检记录后送审。"
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
        @click="submit"
        >{{ retrying ? '重试本次操作' : '确认' }}</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue';
import { useTabsStore } from '../../../stores/tabs';
import type {
  ProductionBatchItem,
  ProductionExecutionCompletionResult,
  ResearchExecutionStartResult,
} from '@company/contracts';
import { RequestError } from '@company/request';
import { productionResearchApi } from '../../../api/production-research';
import { useIdempotentIntent } from '../../../composables/idempotency/useIdempotentIntent';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';

const props = defineProps<{
  visible: boolean;
  batch: ProductionBatchItem | null;
  action: 'start' | 'complete';
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
  Number.isFinite(Date.parse(value));
const hasCompleteResult = (
  result: ResearchExecutionStartResult | ProductionExecutionCompletionResult,
  action: 'start' | 'complete',
): boolean =>
  action === 'start'
    ? 'startedAt' in result && isTimestamp(result.startedAt)
    : 'closeoutId' in result &&
      isId(result.closeoutId) &&
      isTimestamp(result.executionCompletedAt) &&
      isId(result.executionCompletedById) &&
      /^\d+(\.0+)?$/.test(result.lastStepReportedQuantity);
const intent = useIdempotentIntent('研发执行记录');
const submitting = ref(false);
const retrying = ref(false);
const errorMessage = ref('');
let command: { batchId: string; version: number; action: 'start' | 'complete' } | null = null;
watch(
  () => props.visible,
  (visible) => {
    if (!visible || !props.batch || intent.getStatus() !== 'idle') return;
    command = { batchId: props.batch.id, version: props.batch.version, action: props.action };
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
  command = null;
  emit('update:visible', false);
  done?.();
  return true;
}
onScopeDispose(useTabsStore().registerCloseGuard('production-tasks', () => close()));

async function submit() {
  if (submitting.value || !command) return;
  const current = command;
  submitting.value = true;
  errorMessage.value = '';
  try {
    await intent.execute(
      {
        intentType: `production.research.${current.action}`,
        params: { batchId: current.batchId },
        query: {},
        body: { version: current.version },
      },
      async (key) => {
        const result = await productionResearchApi[current.action](
          current.batchId,
          current.version,
          key,
        );
        const expectedStatus = current.action === 'start' ? ['doing'] : ['closing', 'completed'];
        if (
          !result ||
          result.productionBatchId !== current.batchId ||
          !expectedStatus.includes(result.batchStatus) ||
          !Number.isInteger(result.version) ||
          result.version < 1 ||
          !hasCompleteResult(result, current.action)
        )
          throw new RequestError('服务器未返回完整的操作结果，请重试本次操作以核对结果。', 502);
        return result;
      },
    );
    EMessage.success(
      current.action === 'start' ? '研发已开始' : '本轮研发已结束，请核对产出与结案物料',
    );
    emit('update:visible', false);
    emit('changed', current.batchId, current.action === 'complete');
    command = null;
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
