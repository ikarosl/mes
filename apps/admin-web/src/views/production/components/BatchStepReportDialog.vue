<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="560px"
    destroy-on-close
    :before-close="beforeClose"
    :close-on-click-modal="false"
    :show-close="!submitting"
    :close-on-press-escape="!submitting"
    @closed="closed"
  >
    <template v-if="task">
      <ProductionReportSummary
        :task="task"
        :historical="Boolean(historical)"
      />
      <el-alert
        v-if="quantityTip"
        class="quantity-tip"
        :type="mode === 'abnormal' ? 'warning' : 'info'"
        :closable="false"
        show-icon
        :title="quantityTip"
      />
      <el-form
        label-position="top"
        class="report-form"
        :disabled="submitting || (intentStatus ?? 'idle') !== 'idle'"
        @submit.prevent="submit"
      >
        <el-form-item
          :label="mode === 'normal' ? '本次正常数量' : '本次异常数量'"
          :error="quantityTouched ? (quantityValidation.error ?? '') : ''"
          required
        >
          <el-input
            v-model="form.quantity"
            inputmode="numeric"
            placeholder="请输入本次正整数数量"
            aria-label="本次报工数量"
            @input="quantityTouched = true"
            @blur="quantityTouched = true"
          />
          <div class="quantity-limit">
            本次最多 <strong>{{ formatQuantity(maximumQuantity) }}</strong> {{ task.unit }}
          </div>
          <div
            v-if="mode === 'abnormal'"
            class="form-tip"
          >
            异常数量同样占用报工额度，提交后生成待处置记录。
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
        <el-form-item
          :label="historical ? '历史纠错原因' : mode === 'normal' ? '备注' : '异常说明（选填）'"
          :required="historical"
        >
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
      <el-button
        :disabled="submitting"
        @click="requestClose"
        >取消</el-button
      >
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
import { computed, reactive, ref, watch } from 'vue';
import type { BatchStepAbnormalOrigin } from '@company/contracts';
import { PRODUCTION_REPORT_QUANTITY_MAX } from '@company/constants';
import type { ProductionReportContext } from '../production-report-selection';
import type { IdempotentIntentStatus } from '../../../composables/idempotency/useIdempotentIntent';
import { RouteMessageBox as ElMessageBox } from '../../../utils/route-message-box';
import { formatQuantity } from '../production-status';
import ProductionReportSummary from './ProductionReportSummary.vue';
import {
  canOpenProductionReport,
  productionReportBlockedReason,
  validateProductionReportQuantity,
} from '../production-report-input';

const props = defineProps<{
  modelValue: boolean;
  task: ProductionReportContext | null;
  mode: 'normal' | 'abnormal';
  submitting: boolean;
  intentStatus?: IdempotentIntentStatus;
  historical?: boolean;
  contextReady?: boolean;
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
  quantity: string;
  abnormalOrigin: BatchStepAbnormalOrigin | null;
  remark: string;
}>({
  quantity: '',
  abnormalOrigin:
    props.mode === 'abnormal' && props.task && !props.task.hasPreviousStep ? 'current_step' : null,
  remark: '',
});
const quantityTouched = ref(false);
const dialogTitle = computed(() =>
  props.historical ? '普通正常报工历史补录' : props.mode === 'normal' ? '正常报工' : '异常报工',
);
const submitLabel = computed(() => (props.mode === 'normal' ? '提交正常报工' : '提交异常报工'));
const available = computed(() => Math.max(0, Number(props.task?.availableReportQuantity ?? 0)));
const maximumQuantity = computed(() => Math.min(available.value, PRODUCTION_REPORT_QUANTITY_MAX));
const quantityValidation = computed(() =>
  validateProductionReportQuantity(form.quantity, available.value),
);
const abnormalOriginTip = computed(() =>
  props.task?.hasPreviousStep
    ? '前置工序异常表示在当前工序接手时发现上游问题；管理员判定报废时还需选择实际重制与补料的截止工序。'
    : '当前为首道工序，只能上报当前工序发生的异常。',
);
const quantityTip = computed(() =>
  (props.intentStatus ?? 'idle') !== 'idle'
    ? '上次提交结果尚未确认。已锁定原数量、版本和原因，仅可按原请求重试。'
    : props.contextReady === false
      ? '当前依据已变化或加载失败，输入已保留；请重新核对最新工序后办理。'
      : props.task && !canOpenProductionReport(props.task, props.historical)
        ? (productionReportBlockedReason(props.task, props.historical) ?? '当前不可报工')
        : props.historical
          ? '历史补录仅登记纯正常普通报工，并保留本次真实录入时间和原因；不改变工序状态、批准产出、质检或库存。'
          : null,
);
const canSubmit = computed(
  () =>
    !props.submitting &&
    ((props.intentStatus ?? 'idle') === 'pending' ||
      (props.contextReady !== false &&
        Boolean(props.task && canOpenProductionReport(props.task, props.historical)))) &&
    (props.intentStatus ?? 'idle') !== 'blocked' &&
    (props.intentStatus ?? 'idle') !== 'expired' &&
    quantityValidation.value.quantity !== null &&
    (!props.historical || form.remark.trim().length > 0) &&
    (props.mode === 'normal' ||
      (form.abnormalOrigin !== null &&
        (form.abnormalOrigin !== 'previous_step' || Boolean(props.task?.hasPreviousStep)))),
);

watch(
  () => [props.modelValue, props.task?.stepRecordId, props.mode] as const,
  ([open]) => {
    if (!open) return;
    form.quantity = '';
    quantityTouched.value = false;
    form.abnormalOrigin =
      props.mode === 'abnormal' && !props.task?.hasPreviousStep ? 'current_step' : null;
    form.remark = '';
  },
);
const canDiscard = async (): Promise<boolean> => {
  if (props.submitting) return false;
  if ((props.intentStatus ?? 'idle') === 'idle' && form.quantity === '' && !form.remark.trim())
    return true;
  try {
    await ElMessageBox.confirm(
      (props.intentStatus ?? 'idle') === 'idle'
        ? '本次报工输入尚未提交，确认放弃？'
        : '上次报工结果尚未确认。请先刷新任务和报工记录核对；放弃安全重试后再次提交可能重复报工。',
      '关闭报工',
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
  quantityTouched.value = true;
  const quantity = quantityValidation.value.quantity;
  if (!canSubmit.value || quantity === null) return;
  emit('submit', {
    normalQuantity: props.mode === 'normal' ? quantity : 0,
    abnormalQuantity: props.mode === 'abnormal' ? quantity : 0,
    abnormalOrigin: props.mode === 'abnormal' ? form.abnormalOrigin : null,
    remark: form.remark.trim() || null,
  });
};
defineExpose({ canDiscard });
</script>

<style scoped>
.form-tip {
  flex-basis: 100%;
  width: 100%;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.quantity-limit {
  flex-basis: 100%;
  width: 100%;
  margin-top: 6px;
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.quantity-limit strong {
  color: var(--el-color-primary);
}
.report-form {
  margin-top: 18px;
}
.quantity-tip {
  margin-top: 14px;
}
.form-tip {
  margin-top: 6px;
}
</style>
