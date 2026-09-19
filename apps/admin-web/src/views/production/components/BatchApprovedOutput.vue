<template>
  <div
    v-if="output"
    class="approved-output"
  >
    <strong>可用 {{ formatQuantity(approvedUsableQuantity(output)) }}</strong>
    <div>
      计划内 {{ formatQuantity(output.availableQuantity) }} / 计划外
      {{ formatQuantity(output.extraQuantity) }}
    </div>
    <div>报废 {{ formatQuantity(output.scrapQuantity) }} · 第 {{ output.revisionNo }} 版</div>
  </div>
  <span
    v-else
    class="unapproved"
    >尚无批准清单</span
  >
</template>

<script setup lang="ts">
import type { ProductionBatchItem } from '@company/contracts';
import { approvedUsableQuantity } from '../production-output-quantity';
import { formatQuantity } from '../production-status';

defineProps<{ output: ProductionBatchItem['finalOutput'] }>();
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
