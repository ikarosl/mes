<template>
  <div class="linked-supplements">
    <div class="summary-heading">
      <span>同次到货的相关补单</span>
      <el-button
        link
        type="primary"
        :disabled="disabled"
        @click="$emit('view')"
      >
        查看相关补单
      </el-button>
    </div>
    <span
      v-for="entry in summaries"
      :key="entry.status"
    >
      {{ PURCHASE_ORDER_STATUS_LABELS[entry.status] }}：补单明细
      <strong>{{ entry.count }}</strong> 条，补购量 <strong>{{ entry.plannedQuantity }}</strong>
      {{ unit }}
    </span>
    <span v-if="!summaries.length">暂无相关补单</span>
  </div>
</template>
<script setup lang="ts">
import type { PurchaseExcessReceiptCandidate } from '@company/contracts';
import { PURCHASE_ORDER_STATUS_LABELS } from '@company/constants';
defineProps<{
  summaries: PurchaseExcessReceiptCandidate['receiptLinkedSupplements'];
  unit: string;
  disabled: boolean;
}>();
defineEmits<{ view: [] }>();
</script>
<style scoped>
.linked-supplements {
  display: grid;
  gap: 4px;
  margin-left: 22px;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-regular);
}
.summary-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 18px;
}
.linked-supplements strong {
  color: var(--el-text-color-primary);
}
</style>
