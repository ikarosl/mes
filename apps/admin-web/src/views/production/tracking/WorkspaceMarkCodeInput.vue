<template>
  <div
    class="mark-code-field"
    :class="feedback?.state"
  >
    <el-input
      :id="id"
      :model-value="modelValue"
      :placeholder="placeholder"
      inputmode="numeric"
      maxlength="32"
      :aria-label="label"
      :aria-invalid="feedback?.state === 'invalid'"
      :aria-describedby="feedback ? id + '-feedback' : undefined"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <div
      v-if="feedback"
      :id="id + '-feedback'"
      class="field-feedback"
      role="status"
    >
      {{ feedback.message }}
      <el-button
        v-if="feedback.state === 'failed'"
        link
        type="primary"
        size="small"
        :disabled="disabled"
        @click="emit('retry')"
        >重试</el-button
      >
    </div>
  </div>
</template>
<script setup lang="ts">
import type { MarkFieldFeedback } from './use-workspace-mark-validation';
defineProps<{
  id: string;
  label: string;
  modelValue: string;
  placeholder?: string;
  disabled: boolean;
  feedback?: MarkFieldFeedback;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; retry: [] }>();
</script>
<style scoped>
.field-feedback {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
  overflow-wrap: anywhere;
}
.invalid .field-feedback {
  color: var(--el-color-danger);
}
.invalid :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-danger) inset;
}
.failed .field-feedback {
  color: var(--el-color-warning-dark-2);
}
.valid .field-feedback {
  color: var(--el-color-success-dark-2);
}
</style>
