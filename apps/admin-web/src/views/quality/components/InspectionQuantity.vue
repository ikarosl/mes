<template>
  <span
    class="inspection-quantity"
    :class="positive ? `inspection-quantity--${kind}` : undefined"
    >{{ value }}{{ unit ? ` ${unit}` : '' }}</span
  >
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  value: number | string;
  kind: 'qualified' | 'unqualified';
  unit?: string;
}>();
const positive = computed(() => Number.isFinite(Number(props.value)) && Number(props.value) > 0);
</script>

<style scoped>
.inspection-quantity {
  font-variant-numeric: tabular-nums;
}

.inspection-quantity--qualified {
  color: var(--el-color-success-dark-2);
  font-weight: 600;
}

.inspection-quantity--unqualified {
  color: var(--el-color-danger-dark-2);
  font-weight: 600;
}
</style>
