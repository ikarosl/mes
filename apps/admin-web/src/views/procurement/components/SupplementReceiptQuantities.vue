<template>
  <div class="receipt-quantities">
    <div class="quantity-row">
      <span
        >到货量
        <strong :class="zeroQuantityClass(quantities.receivedQuantity)">{{
          quantities.receivedQuantity
        }}</strong>
        {{ unit }}</span
      >
      <span
        >当前可入库
        <strong :class="zeroQuantityClass(quantities.pendingInboundQuantity)">{{
          quantities.pendingInboundQuantity
        }}</strong>
        {{ unit }}</span
      >
      <span
        >已入库
        <strong :class="zeroQuantityClass(quantities.inboundQuantity)">{{
          quantities.inboundQuantity
        }}</strong>
        {{ unit }}</span
      >
    </div>
    <div class="quantity-row">
      <span
        >待退回
        <strong :class="receiptReturnQuantityClass(quantities.pendingReturnQuantity)">{{
          quantities.pendingReturnQuantity
        }}</strong>
        {{ unit }}</span
      >
      <span
        >已退回
        <strong :class="receiptReturnQuantityClass(quantities.returnedQuantity)">{{
          quantities.returnedQuantity
        }}</strong>
        {{ unit }}</span
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PurchaseSupplementReceiptQuantities } from '@company/contracts';
import { receiptReturnQuantityClass } from '../receipt-round-presentation';

defineOptions({ name: 'SupplementReceiptQuantities' });
defineProps<{
  quantities: PurchaseSupplementReceiptQuantities;
  unit: string;
}>();

const zeroQuantityClass = (quantity: string): 'quantity-zero' | undefined =>
  quantity.trim() !== '' && Number(quantity) === 0 ? 'quantity-zero' : undefined;
</script>

<style scoped>
.receipt-quantities {
  display: grid;
  gap: 4px;
  min-width: 0;
  color: var(--el-text-color-regular);
  overflow-wrap: anywhere;
}
.quantity-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 18px;
}
.quantity-row strong {
  color: var(--el-text-color-primary);
}
.quantity-row .quantity-return {
  color: var(--el-color-warning-dark-2);
  font-weight: 700;
}
.quantity-row .quantity-zero {
  color: var(--el-text-color-placeholder);
  font-weight: 400;
}
</style>
