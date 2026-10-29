<template>
  <div class="total-amount">
    <span>{{ totalAmount ?? '待填写' }}</span>
    <span
      v-if="totalAmountSource"
      class="amount-source"
      >{{ PURCHASE_ORDER_TOTAL_AMOUNT_SOURCE_LABELS[totalAmountSource] }}</span
    >
  </div>
</template>

<script setup lang="ts">
import type { PurchaseOrderTotalAmountSource } from '@company/contracts';
import { PURCHASE_ORDER_TOTAL_AMOUNT_SOURCE_LABELS } from '@company/constants';

defineProps<{
  totalAmount: string | null;
  totalAmountSource: PurchaseOrderTotalAmountSource | null;
}>();
</script>

<style scoped>
.total-amount {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 8px;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.amount-source {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
