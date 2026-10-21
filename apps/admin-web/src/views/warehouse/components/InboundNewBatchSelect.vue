<template>
  <el-select
    :model-value="selectedKey"
    :empty-values="[null, undefined]"
    :disabled="disabled"
    placeholder="请重新选择新批次目标"
    :aria-label="`${scopeLabel}新批次归组`"
    title="同物料版本或同成品、同单位的明细可共用新批次"
    @change="choose"
  >
    <el-option
      value=""
      label="独立新建"
    />
    <el-option
      v-for="group in choices"
      :key="group.value"
      :value="group.value"
      :label="group.label"
    />
  </el-select>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { NewBatchGroupChoice } from '../inbound-new-batch-groups';

defineOptions({ name: 'InboundNewBatchSelect' });
const props = withDefaults(
  defineProps<{
    modelValue: string;
    groups: readonly NewBatchGroupChoice[];
    disabled?: boolean;
    scopeLabel?: string;
  }>(),
  { scopeLabel: '本次' },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const current = computed(() => props.groups.find((group) => group.value === props.modelValue));
const selectedKey = computed((): string | undefined => {
  if (!props.modelValue && props.disabled) return '';
  if (!current.value) return undefined;
  return current.value.rowCount > 1 ? props.modelValue : '';
});
const choices = computed(() =>
  props.groups.filter((group) => group.value !== props.modelValue || group.rowCount > 1),
);
function choose(value: string): void {
  if (props.disabled || value === selectedKey.value) return;
  if (!value) emit('update:modelValue', crypto.randomUUID());
  else if (props.groups.some((group) => group.value === value)) emit('update:modelValue', value);
}
</script>
