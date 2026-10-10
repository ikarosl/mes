<template>
  <el-dialog
    v-model="visible"
    :title="actionTitle"
    :width="DialogWidth.md"
    :before-close="beforeClose"
    :close-on-click-modal="false"
    :show-close="!submitting"
    :close-on-press-escape="!submitting"
  >
    <el-descriptions
      v-if="snapshot"
      :column="2"
      border
      ><el-descriptions-item label="工序"
        >{{ snapshot.stepOrder }}. {{ snapshot.stepName }}</el-descriptions-item
      ><el-descriptions-item label="当前状态">{{
        BATCH_STEP_STATUS_LABELS[snapshot.status]
      }}</el-descriptions-item
      ><el-descriptions-item label="直接净报工 / 上限"
        >{{ formatQuantity(snapshot.effectiveDirectReportedQuantity) }} /
        {{ formatQuantity(snapshot.upperLimitQuantity) }} {{ snapshot.unit }}</el-descriptions-item
      ><el-descriptions-item label="当前开工时间">{{
        formatDateTimeForDisplay(snapshot.startedAt)
      }}</el-descriptions-item></el-descriptions
    >
    <InlineHint class="notice">{{ actionNote }}</InlineHint>
    <el-alert
      v-if="stale"
      class="notice"
      title="工序或任务依据已变化，输入已保留；请关闭并从最新详情重新办理。"
      type="warning"
      :closable="false"
      show-icon
    />
    <el-form
      class="notice"
      label-position="top"
      :disabled="submitting"
    >
      <el-form-item
        v-if="action === 'reopen'"
        label="原因"
        required
        ><el-input
          v-model="reason"
          type="textarea"
          :rows="3"
          maxlength="5000"
          show-word-limit
      /></el-form-item>
    </el-form>
    <template #footer
      ><el-button
        :disabled="submitting"
        @click="close"
        >取消</el-button
      ><el-button
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="submit"
        >{{ actionTitle }}</el-button
      ></template
    >
  </el-dialog>
  <ProductionStepExecutionHistoryDialog
    v-model="historyVisible"
    :batch-id="historySnapshot?.productionBatchId ?? ''"
    :step-record-id="historySnapshot?.stepRecordId ?? ''"
    :step-name="historySnapshot?.stepName ?? ''"
    :worker="worker"
  />
</template>

<script setup lang="ts">
import { computed, onScopeDispose, ref } from 'vue';
import { useRoute } from 'vue-router';
import type {
  BatchStepExecutionRecordItem,
  ProductionStepExecutionActionType,
  ProductionWorkerTaskItem,
} from '@company/contracts';
import {
  BATCH_STEP_STATUS_LABELS,
  PRODUCTION_STEP_EXECUTION_ACTION_LABELS,
} from '@company/constants';
import { productionApi } from '../../../api/production';
import InlineHint from '../../../components/InlineHint.vue';
import { useTabsStore } from '../../../stores/tabs';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { formatQuantity } from '../production-status';
import ProductionStepExecutionHistoryDialog from './ProductionStepExecutionHistoryDialog.vue';

type ActionStep = BatchStepExecutionRecordItem | ProductionWorkerTaskItem;
const props = withDefaults(
  defineProps<{
    steps: readonly ActionStep[];
    worker?: boolean;
    readonly?: boolean;
    disabled?: boolean;
  }>(),
  { worker: false, readonly: false, disabled: false },
);
const emit = defineEmits<{ changed: [] }>();
const visible = ref(false),
  historyVisible = ref(false),
  submitting = ref(false),
  reason = ref('');
const action = ref<ProductionStepExecutionActionType>('complete');
const snapshot = ref<ActionStep | null>(null);
const historySnapshot = ref<ActionStep | null>(null);
const currentStep = computed(() =>
  snapshot.value
    ? (props.steps.find(
        (step) =>
          step.productionBatchId === snapshot.value?.productionBatchId &&
          step.stepRecordId === snapshot.value?.stepRecordId,
      ) ?? null)
    : null,
);
const actionEligible = computed(() => {
  const step = currentStep.value;
  if (props.readonly || !step) return false;
  if (action.value === 'start')
    return props.worker
      ? 'canStart' in step && step.canStart
      : 'canAdminStart' in step && step.canAdminStart;
  if (action.value === 'complete')
    return props.worker
      ? 'canComplete' in step && step.canComplete
      : 'canAdminComplete' in step && step.canAdminComplete;
  if (action.value === 'reopen')
    return props.worker
      ? 'canReopen' in step && step.canReopen
      : 'canAdminReopen' in step && step.canAdminReopen;
  return false;
});
const stale = computed(
  () =>
    props.disabled ||
    !actionEligible.value ||
    !snapshot.value ||
    !currentStep.value ||
    currentStep.value.version !== snapshot.value.version,
);
const actionTitle = computed(() => PRODUCTION_STEP_EXECUTION_ACTION_LABELS[action.value]);
const actionNote = computed(() =>
  action.value === 'reopen'
    ? '用于误点完工或实际继续加工，保留此前完成历史。重开不改变报工数量或上下游状态。'
    : action.value === 'complete'
      ? '明确确认本道作业结束。报工比例无需达到 100%；完成后新增报工须先重新开工，记录纠错不要求重开。异常及返工继续按各自规则办理。'
      : '任务由管理员统一开工后，可开始本道作业；工序开工只改变本道状态。',
);
const canSubmit = computed(
  () =>
    !submitting.value &&
    !stale.value &&
    (action.value !== 'reopen' || reason.value.trim().length > 0),
);
const discard = async (): Promise<boolean> => {
  if (submitting.value) return false;
  if (!visible.value || !reason.value.trim()) return true;
  try {
    await RouteMessageBox.confirm('本次状态动作的原因尚未提交，确认放弃？', '关闭状态操作', {
      type: 'warning',
      confirmButtonText: '确认放弃',
      cancelButtonText: '继续填写',
    });
    return true;
  } catch {
    return false;
  }
};
const open = async (step: ActionStep, type: ProductionStepExecutionActionType): Promise<void> => {
  if (!(await discard())) return;
  snapshot.value = { ...step };
  action.value = type;
  reason.value = '';
  visible.value = true;
};
const openHistory = (step: ActionStep): void => {
  historySnapshot.value = { ...step };
  historyVisible.value = true;
};
const close = async (): Promise<void> => {
  if (await discard()) visible.value = false;
};
const beforeClose = async (done: () => void): Promise<void> => {
  if (await discard()) done();
};
const submit = async (): Promise<void> => {
  if (!snapshot.value || !canSubmit.value) return;
  const target = snapshot.value;
  submitting.value = true;
  try {
    if (action.value === 'start')
      await (props.worker ? productionApi.startStep : productionApi.adminStartStep)(
        target.productionBatchId,
        target.stepRecordId,
        target.version,
      );
    else if (action.value === 'complete')
      await (props.worker ? productionApi.completeStep : productionApi.adminCompleteStep)(
        target.productionBatchId,
        target.stepRecordId,
        target.version,
      );
    else if (action.value === 'reopen')
      await (props.worker ? productionApi.reopenStep : productionApi.adminReopenStep)(
        target.productionBatchId,
        target.stepRecordId,
        { version: target.version, reason: reason.value.trim() },
      );
    visible.value = false;
    EMessage.success('工序状态动作已记录');
    emit('changed');
  } catch (error) {
    EMessage.error(error, '状态操作未完成，请刷新并核对业务历史');
    emit('changed');
  } finally {
    submitting.value = false;
  }
};
const route = useRoute();
const unregister = useTabsStore().registerCloseGuard(String(route.name), discard);
onScopeDispose(unregister);
defineExpose({ open, openHistory });
</script>

<style scoped>
.notice {
  margin-top: 12px;
}
</style>
