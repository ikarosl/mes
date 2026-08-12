<template>
  <el-dialog
    :model-value="modelValue"
    title="工序报工"
    width="560px"
    destroy-on-close
    @close="close"
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
          <span>最终剩余需完成</span>
          <strong>{{ formatQuantity(remaining) }} {{ task.unit }}</strong>
        </div>
        <div>
          <span>上游当前放行</span>
          <strong>{{ formatQuantity(task.releasedNormalQuantity) }} {{ task.unit }}</strong>
        </div>
        <div>
          <span>本次正常+异常可报合计</span>
          <strong>{{ formatQuantity(available) }} {{ task.unit }}</strong>
        </div>
      </div>
      <el-alert
        class="quantity-tip"
        type="info"
        :closable="false"
        show-icon
        :title="quantityTip"
      />
      <el-form
        label-position="top"
        class="report-form"
      >
        <el-form-item
          label="本次正常数量"
          required
        >
          <el-input-number
            v-model="form.normalQuantity"
            :min="0"
            :max="Math.max(0, available - form.abnormalQuantity)"
            :precision="4"
            :step="1"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item
          label="本次异常数量"
          required
        >
          <el-input-number
            v-model="form.abnormalQuantity"
            :min="0"
            :max="Math.max(0, available - form.normalQuantity)"
            :precision="4"
            :step="1"
            controls-position="right"
          />
          <div class="form-tip">
            异常数量不计入正常放行量和完工进度，但会占用上游已放行的本工序加工数量；大于零时系统会自动生成待处置记录。
          </div>
        </el-form-item>
        <el-form-item label="备注">
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
      <el-button @click="close">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="submit"
        >提交本次报工</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import type { ProductionWorkerTaskItem } from '@company/contracts';
import { formatQuantity } from '../production-status';

const props = defineProps<{
  modelValue: boolean;
  task: ProductionWorkerTaskItem | null;
  submitting: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [payload: { normalQuantity: number; abnormalQuantity: number; remark: string | null }];
}>();
const form = reactive({ normalQuantity: 0, abnormalQuantity: 0, remark: '' });
const remaining = computed(() =>
  Math.max(
    0,
    Number(props.task?.requiredNormalQuantity ?? 0) -
      Number(props.task?.effectiveNormalQuantity ?? 0),
  ),
);
const available = computed(() => Math.max(0, Number(props.task?.availableNormalQuantity ?? 0)));
const quantityTip = computed(() =>
  available.value < remaining.value
    ? `当前上游仅放行 ${formatQuantity(props.task?.releasedNormalQuantity ?? 0)} ${props.task?.unit ?? ''}，本次正常与异常数量合计最多填写 ${formatQuantity(available.value)}；达到当前放行量不会提前完成本工序。`
    : `当前正常数量已全部放行；有效正常累计达到 ${formatQuantity(props.task?.requiredNormalQuantity ?? 0)} ${props.task?.unit ?? ''} 时，本工序自动完成。`,
);
const canSubmit = computed(
  () =>
    !props.submitting &&
    form.normalQuantity >= 0 &&
    form.abnormalQuantity >= 0 &&
    form.normalQuantity + form.abnormalQuantity > 0 &&
    form.normalQuantity + form.abnormalQuantity <= available.value,
);

watch(
  () => [props.modelValue, props.task?.stepRecordId] as const,
  ([open]) => {
    if (!open) return;
    form.normalQuantity = 0;
    form.abnormalQuantity = 0;
    form.remark = '';
  },
);
const close = (): void => {
  if (!props.submitting) emit('update:modelValue', false);
};
const submit = (): void => {
  if (!canSubmit.value) return;
  emit('submit', {
    normalQuantity: form.normalQuantity,
    abnormalQuantity: form.abnormalQuantity,
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
.form-tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
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
