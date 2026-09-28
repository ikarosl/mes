<template>
  <el-popover
    :visible="visible"
    placement="left"
    :width="250"
  >
    <p class="split-title">分到另一批次</p>
    <p class="split-hint">从本行分出数量，原行同步扣减。</p>
    <el-input
      v-model="draft"
      inputmode="numeric"
      placeholder="填写分出数量"
      :disabled="disabled"
      @keyup.enter="confirm"
    />
    <p
      v-if="draft && !canConfirm"
      class="split-error"
    >
      分出量须为小于本行数量的正整数
    </p>
    <div class="split-actions">
      <el-button
        size="small"
        @click="visible = false"
        >取消</el-button
      >
      <el-button
        size="small"
        type="primary"
        :disabled="!canConfirm || disabled"
        @click="confirm"
      >
        确认分配
      </el-button>
    </div>
    <template #reference>
      <el-button
        link
        :disabled="disabled || !canSplit"
        @click="open"
        >分到另一批次</el-button
      >
    </template>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { parseInboundQuantity } from '../inbound-quantity';

defineOptions({ name: 'InboundSplitControl' });
const props = defineProps<{ quantity: string; disabled?: boolean }>();
const emit = defineEmits<{ split: [quantity: number] }>();
const visible = ref(false);
const draft = ref('');
const sourceQuantity = computed(() => parseInboundQuantity(props.quantity));
const splitQuantity = computed(() => parseInboundQuantity(draft.value));
const canSplit = computed(() => sourceQuantity.value !== null && sourceQuantity.value > 1);
const canConfirm = computed(
  () =>
    splitQuantity.value !== null &&
    sourceQuantity.value !== null &&
    splitQuantity.value < sourceQuantity.value,
);
function open(): void {
  draft.value = '';
  visible.value = true;
}
function confirm(): void {
  if (!canConfirm.value || props.disabled || splitQuantity.value === null) return;
  emit('split', splitQuantity.value);
  visible.value = false;
}
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) visible.value = false;
  },
);
</script>

<style scoped>
.split-title {
  margin: 0 0 4px;
  font-weight: 600;
}
.split-hint {
  margin: 0 0 10px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.split-error {
  margin: 5px 0 0;
  color: var(--el-color-danger);
  font-size: 12px;
}
.split-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
</style>
