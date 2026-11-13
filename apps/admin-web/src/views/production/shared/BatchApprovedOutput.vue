<template>
  <div
    v-if="output && output.confirmedOutputCount > 0"
    class="approved-output"
  >
    <strong>可用 {{ formatQuantity(approvedUsableQuantity(output)) }}</strong
    ><span v-if="approvedUsableQuantity(output) === 0">（已确认零产出）</span>
  </div>
  <span
    v-else
    class="unapproved"
    >尚未确认产出</span
  >
</template>

<script setup lang="ts">
import type { ProductionBatchItem } from '@company/contracts';
import { approvedUsableQuantity } from './production-output-quantity';
import { formatQuantity } from '../../../utils/quantity';

defineProps<{ output: ProductionBatchItem['finalOutput']; compact?: boolean }>();
</script>

<style scoped>
.approved-output {
  line-height: 1.7;
  color: var(--el-text-color-regular);
}
.approved-output strong {
  color: var(--el-text-color-primary);
}
.unapproved {
  color: var(--el-text-color-regular);
}
</style>
