<template>
  <section
    class="quantity-overview"
    aria-label="数量核对"
  >
    <el-descriptions
      :column="1"
      direction="vertical"
      border
      size="small"
      class="review-summary"
    >
      <el-descriptions-item label="数量核对">
        <div class="summary-quantities">
          <span>
            本采购行计划
            <strong>{{ quantityText(line.purchaseLineQuantities.plannedQuantity) }}</strong>
            {{ line.unit }}
          </span>
          <span>
            累计到货
            <strong>{{ quantityText(line.purchaseLineQuantities.receivedQuantity) }}</strong>
            {{ line.unit }}
          </span>
        </div>
        <template v-if="!isReceiptVoided(line)">
          <div class="receipt-composition">
            累计到货：其他到货
            <strong>{{ quantityText(otherReceivedQuantity) }} {{ line.unit }}</strong> + 本批到货
            <strong>{{ quantityText(line.quantities.receivedQuantity) }} {{ line.unit }}</strong>
          </div>
          <div class="receipt-composition">
            本批到货：已入库
            <strong>{{ quantityText(line.quantities.inboundQuantity) }} {{ line.unit }}</strong>
            + 已退回
            <strong
              :class="receiptReturnQuantityClass(parseQuantity(line.quantities.returnedQuantity))"
              >{{ quantityText(line.quantities.returnedQuantity) }} {{ line.unit }}</strong
            >
            + 剩余
            <strong>{{ quantityText(line.quantities.unprocessedQuantity) }} {{ line.unit }}</strong>
          </div>
        </template>
        <div
          v-else
          class="receipt-composition"
        >
          作废前到货量 <strong>{{ quantityText(registeredQuantity) }} {{ line.unit }}</strong
          >； 已入库
          <strong>{{ quantityText(line.quantities.inboundQuantity) }} {{ line.unit }}</strong
          >、已退回
          <strong
            :class="receiptReturnQuantityClass(parseQuantity(line.quantities.returnedQuantity))"
            >{{ quantityText(line.quantities.returnedQuantity) }} {{ line.unit }}</strong
          >
        </div>
        <div class="summary-note">
          <template v-if="!isReceiptVoided(line)">
            其他到货不含本明细；累计仅计本采购行、含已退回并排除作废；剩余为尚未入库或退回的实物。
          </template>
          <template v-else>
            本明细已作废，不计入累计到货；原登记数量仅供历史核对。
            <template v-if="registeredQuantity === null">请查看到货量修订。</template>
          </template>
        </div>
      </el-descriptions-item>
    </el-descriptions>
    <InlineHint
      v-if="line.overReceiptNote?.trim()"
      tone="warning"
      class="over-receipt-note"
    >
      超量接受依据：{{ line.overReceiptNote }}
    </InlineHint>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ProcurementReceiptLine } from '@company/contracts';
import InlineHint from '../../../components/InlineHint.vue';
import { isReceiptVoided, receiptReturnQuantityClass } from '../receipt-round-presentation';

const props = defineProps<{ line: ProcurementReceiptLine }>();
const parseQuantity = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null;
};
const quantityText = (value: string | number | null | undefined): string =>
  parseQuantity(value)?.toString() ?? '待核对';
const registeredQuantity = computed(() => {
  if (!isReceiptVoided(props.line)) return parseQuantity(props.line.quantities.receivedQuantity);
  return parseQuantity(props.line.registeredQuantity);
});
const otherReceivedQuantity = computed(() => {
  const received = parseQuantity(props.line.purchaseLineQuantities.receivedQuantity);
  const current = parseQuantity(props.line.quantities.receivedQuantity);
  if (received === null || current === null || isReceiptVoided(props.line)) return null;
  const other = received - current;
  return Number.isSafeInteger(other) && other >= 0 ? other : null;
});
</script>

<style scoped>
.quantity-overview {
  margin-bottom: 12px;
}
.review-summary :deep(.el-descriptions__body .el-descriptions__table .el-descriptions__cell) {
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.summary-quantities {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
}
.receipt-composition {
  margin: 3px 0;
}
.review-summary strong {
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}
.review-summary strong.quantity-return {
  color: var(--el-color-warning-dark-2);
  font-weight: 700;
}
.review-summary strong.quantity-zero {
  color: var(--el-text-color-placeholder);
  font-weight: 400;
}
.summary-note {
  color: var(--el-text-color-regular);
}
.over-receipt-note {
  margin-top: 12px;
}
</style>
