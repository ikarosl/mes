<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="560px"
    destroy-on-close
    :before-close="beforeClose"
    :close-on-click-modal="false"
    @closed="closed"
  >
    <template v-if="task">
      <div class="report-summary">
        <div>
          <span>生产批次</span><strong>{{ task.batchNo }}</strong>
        </div>
        <div>
          <span>工序</span><strong>{{ task.stepOrder }}. {{ task.stepName }}</strong>
        </div>
        <div>
          <span>有效正常累计</span>
          <strong>{{ formatQuantity(task.effectiveNormalQuantity) }} {{ task.unit }}</strong>
        </div>
        <div>
          <span>有效异常累计</span>
          <strong>{{ formatQuantity(task.effectiveAbnormalQuantity) }} {{ task.unit }}</strong>
        </div>
        <div>
          <span>正常目标</span>
          <strong>{{ formatQuantity(task.requiredNormalQuantity) }} {{ task.unit }}</strong>
          <small v-if="Number(task.activatedSupplementTargetQuantity) > 0">
            计划 {{ formatQuantity(task.baseNormalQuantity) }} + 下游补产
            {{ formatQuantity(task.activatedSupplementTargetQuantity) }}
          </small>
        </div>
        <div>
          <span>当前投入放行</span>
          <strong>{{ formatQuantity(task.releasedNormalQuantity) }} {{ task.unit }}</strong>
          <small v-if="Number(task.activatedSupplementInputQuantity) > 0">
            含补产 {{ formatQuantity(task.activatedSupplementInputQuantity) }}
          </small>
        </div>
        <div>
          <span>普通报工已占用</span>
          <strong
            >{{ formatQuantity(task.effectiveDirectReportedQuantity) }} {{ task.unit }}</strong
          >
        </div>
        <div>
          <span>最终剩余需完成</span>
          <strong>{{ formatQuantity(remaining) }} {{ task.unit }}</strong>
        </div>
        <div>
          <span>本次可报数量</span>
          <strong>{{ formatQuantity(available) }} {{ task.unit }}</strong>
        </div>
      </div>
      <el-alert
        class="quantity-tip"
        :type="mode === 'abnormal' ? 'warning' : 'info'"
        :closable="false"
        show-icon
        :title="quantityTip"
      />
      <el-form
        label-position="top"
        class="report-form"
      >
        <el-form-item
          :label="mode === 'normal' ? '本次正常数量' : '本次异常数量'"
          required
        >
          <el-input-number
            v-model="form.quantity"
            :min="0"
            :max="available"
            :precision="0"
            :step="1"
            controls-position="right"
          />
          <div
            v-if="mode === 'abnormal'"
            class="form-tip"
          >
            异常数量不计入正常放行量和完工进度，但会占用上游已放行的本工序加工数量；大于零时系统会自动生成待处置记录。
          </div>
        </el-form-item>
        <el-form-item
          v-if="mode === 'abnormal'"
          label="异常来源"
          required
        >
          <el-radio-group v-model="form.abnormalOrigin">
            <el-radio value="current_step">当前工序异常</el-radio>
            <el-radio
              v-if="task.hasPreviousStep"
              value="previous_step"
              >前置工序异常</el-radio
            >
          </el-radio-group>
          <div class="form-tip">
            {{ abnormalOriginTip }}
          </div>
        </el-form-item>
        <el-form-item :label="mode === 'normal' ? '备注' : '异常说明（选填）'">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="3"
            maxlength="5000"
            show-word-limit
          />
        </el-form-item>
      </el-form>
    </template>
    <template #footer>
      <el-button @click="requestClose">取消</el-button>
      <el-button
        :type="mode === 'abnormal' ? 'danger' : 'primary'"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="submit"
        >{{ submitLabel }}</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import type { BatchStepAbnormalOrigin, ProductionWorkerTaskItem } from '@company/contracts';
import type { IdempotentIntentStatus } from '../../../composables/idempotency/useIdempotentIntent';
import { RouteMessageBox as ElMessageBox } from '../../../utils/route-message-box';
import { formatQuantity } from '../production-status';

const props = defineProps<{
  modelValue: boolean;
  task: ProductionWorkerTaskItem | null;
  mode: 'normal' | 'abnormal';
  submitting: boolean;
  intentStatus?: IdempotentIntentStatus;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [
    payload: {
      normalQuantity: number;
      abnormalQuantity: number;
      abnormalOrigin: BatchStepAbnormalOrigin | null;
      remark: string | null;
    },
  ];
  resetIntent: [];
}>();
const form = reactive<{
  quantity: number;
  abnormalOrigin: BatchStepAbnormalOrigin | null;
  remark: string;
}>({
  quantity: 0,
  abnormalOrigin:
    props.mode === 'abnormal' && props.task && !props.task.hasPreviousStep ? 'current_step' : null,
  remark: '',
});
const dialogTitle = computed(() => (props.mode === 'normal' ? '正常报工' : '异常报工'));
const submitLabel = computed(() => (props.mode === 'normal' ? '提交正常报工' : '提交异常报工'));
const remaining = computed(() =>
  Math.max(
    0,
    Number(props.task?.requiredNormalQuantity ?? 0) -
      Number(props.task?.effectiveNormalQuantity ?? 0),
  ),
);
const available = computed(() => Math.max(0, Number(props.task?.availableNormalQuantity ?? 0)));
const abnormalOriginTip = computed(() =>
  props.task?.hasPreviousStep
    ? '前置工序异常表示在当前工序接手时发现上游问题；管理员判定报废时还需选择实际重制与补料的截止工序。'
    : '当前为首道工序，只能上报当前工序发生的异常。',
);
const quantityTip = computed(() =>
  props.task?.supplementBlockedReason
    ? props.task.supplementBlockedReason
    : Number(props.task?.pendingSupplementInputQuantity ?? 0) > 0
      ? '报废补料尚未全部确认领用，待激活补产不会计入本次可报量。'
      : props.mode === 'abnormal'
        ? `本次最多上报 ${formatQuantity(available.value)} ${props.task?.unit ?? ''} 异常数量；提交后将生成待管理员处置记录。`
        : available.value < remaining.value
          ? `当前上游仅放行 ${formatQuantity(props.task?.releasedNormalQuantity ?? 0)} ${props.task?.unit ?? ''}，本次正常数量最多填写 ${formatQuantity(available.value)}；达到当前放行量不会提前完成本工序。`
          : `当前正常数量已全部放行；有效正常累计达到 ${formatQuantity(props.task?.requiredNormalQuantity ?? 0)} ${props.task?.unit ?? ''} 时，本工序自动完成。`,
);
const canSubmit = computed(
  () =>
    !props.submitting &&
    Number.isInteger(form.quantity) &&
    form.quantity > 0 &&
    form.quantity <= available.value &&
    (props.mode === 'normal' ||
      (form.abnormalOrigin !== null &&
        (form.abnormalOrigin !== 'previous_step' || Boolean(props.task?.hasPreviousStep)))),
);

watch(
  () => [props.modelValue, props.task?.stepRecordId, props.mode] as const,
  ([open]) => {
    if (!open) return;
    form.quantity = 0;
    form.abnormalOrigin =
      props.mode === 'abnormal' && !props.task?.hasPreviousStep ? 'current_step' : null;
    form.remark = '';
  },
);
const canDiscard = async (): Promise<boolean> => {
  if (props.submitting) return false;
  if ((props.intentStatus ?? 'idle') === 'idle') return true;
  try {
    await ElMessageBox.confirm(
      '上次报工结果尚未确认。请先刷新本人任务和报工记录核对；放弃安全重试后再次提交可能重复报工。',
      '放弃幂等意图确认',
      { type: 'warning', confirmButtonText: '核对后仍要放弃', cancelButtonText: '继续保留' },
    );
    emit('resetIntent');
    return true;
  } catch {
    return false;
  }
};
const beforeClose = async (done: () => void): Promise<void> => {
  if (await canDiscard()) done();
};
const requestClose = async (): Promise<void> => {
  if (await canDiscard()) emit('update:modelValue', false);
};
const closed = (): void => {
  emit('update:modelValue', false);
};
const submit = (): void => {
  if (!canSubmit.value) return;
  emit('submit', {
    normalQuantity: props.mode === 'normal' ? form.quantity : 0,
    abnormalQuantity: props.mode === 'abnormal' ? form.quantity : 0,
    abnormalOrigin: props.mode === 'abnormal' ? form.abnormalOrigin : null,
    remark: form.remark.trim() || null,
  });
};
</script>

<style scoped>
.report-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-light);
}
.report-summary div {
  display: grid;
  gap: 4px;
}
.report-summary span,
.report-summary small,
.form-tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.report-summary small {
  color: var(--el-color-warning-dark-2);
}
.report-form {
  margin-top: 18px;
}
.quantity-tip {
  margin-top: 14px;
}
.report-form :deep(.el-input-number) {
  width: 100%;
}
.form-tip {
  margin-top: 6px;
}
</style>
