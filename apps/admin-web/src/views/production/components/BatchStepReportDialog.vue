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
          <span>剩余需报</span>
          <strong>{{ formatQuantity(remaining) }} {{ task.unit }}</strong>
        </div>
      </div>
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
            :max="remaining"
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
            :precision="4"
            :step="1"
            controls-position="right"
          />
          <div class="form-tip">异常数量大于零时，系统会自动生成一条待处置异常记录。</div>
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
const canSubmit = computed(
  () =>
    !props.submitting &&
    form.normalQuantity >= 0 &&
    form.abnormalQuantity >= 0 &&
    form.normalQuantity + form.abnormalQuantity > 0 &&
    form.normalQuantity <= remaining.value,
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
.report-form :deep(.el-input-number) {
  width: 100%;
}
.form-tip {
  margin-top: 6px;
}
</style>
