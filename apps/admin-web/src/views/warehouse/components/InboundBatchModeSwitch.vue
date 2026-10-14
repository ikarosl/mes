<template>
  <el-radio-group
    :model-value="modelValue"
    :disabled="disabled"
    size="default"
    aria-label="入库批次方式"
    @change="changeMode"
  >
    <el-radio-button
      v-for="mode in INVENTORY_TARGET_MODES"
      :key="mode"
      :value="mode"
      class="radio-button"
    >
      {{ INVENTORY_TARGET_MODE_LABELS[mode] }}
    </el-radio-button>
  </el-radio-group>
</template>

<script setup lang="ts">
import { INVENTORY_TARGET_MODES, INVENTORY_TARGET_MODE_LABELS } from '@company/constants';
import type { InventoryInboundTarget } from '@company/contracts';

defineOptions({ name: 'InboundBatchModeSwitch' });
const props = defineProps<{
  modelValue: InventoryInboundTarget['mode'];
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: InventoryInboundTarget['mode']] }>();

function changeMode(value: unknown): void {
  const mode = INVENTORY_TARGET_MODES.find((candidate) => candidate === value);
  if (props.disabled || !mode || mode === props.modelValue) return;
  emit('update:modelValue', mode);
}
</script>

<style scoped>
.radio-button {
  top: 2px;
}
</style>
