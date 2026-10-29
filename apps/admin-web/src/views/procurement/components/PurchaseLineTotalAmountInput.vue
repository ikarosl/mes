<template>
  <div class="total-amount-field">
    <el-input
      :model-value="manualTotalAmount"
      :maxlength="PURCHASE_ORDER_TOTAL_AMOUNT_MAX_LENGTH"
      :disabled="disabled"
      :aria-label="`${itemName || '本行'}含税总金额手填值`"
      inputmode="decimal"
      clearable
      placeholder="留空自动推算"
      @update:model-value="emit('update:manualTotalAmount', $event)"
    />
    <div
      class="amount-preview"
      :class="{ 'amount-error': preview.error }"
      aria-live="polite"
    >
      <template v-if="preview.error">{{ preview.error }}</template>
      <template v-else-if="!preview.amount">填写数量后预览总额</template>
      <template v-else>
        <span>
          本次预览：
          {{
            preview.amount.totalAmountSource
              ? PURCHASE_ORDER_TOTAL_AMOUNT_SOURCE_LABELS[preview.amount.totalAmountSource]
              : '待填写无税单价'
          }}
          <strong v-if="preview.amount.totalAmount !== null">
            {{ preview.amount.totalAmount }}</strong
          >
        </span>
        <span
          v-if="preview.amount.totalAmountSource === 'manual'"
          class="calculated-reference"
        >
          自动参考：{{ preview.amount.calculatedTotalAmount ?? '待填写无税单价' }}
        </span>
      </template>
    </div>
    <div
      v-if="savedAmountDiffers"
      class="saved-total-amount"
    >
      <span>已保存总金额：</span>
      <PurchaseLineTotalAmount
        :total-amount="savedTotalAmount ?? null"
        :total-amount-source="savedTotalAmountSource ?? null"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PurchaseOrderTotalAmountSource } from '@company/contracts';
import {
  PURCHASE_ORDER_TOTAL_AMOUNT_MAX_LENGTH,
  PURCHASE_ORDER_TOTAL_AMOUNT_SOURCE_LABELS,
} from '@company/constants';
import { previewPurchaseLineAmount, type PurchaseLineAmountDraft } from '../purchase-line-amount';
import PurchaseLineTotalAmount from './PurchaseLineTotalAmount.vue';

const props = defineProps<
  PurchaseLineAmountDraft & {
    itemName?: string;
    disabled?: boolean;
    savedTotalAmount?: string | null;
    savedTotalAmountSource?: PurchaseOrderTotalAmountSource | null;
  }
>();
const emit = defineEmits<{ 'update:manualTotalAmount': [string] }>();
const preview = computed(() => previewPurchaseLineAmount(props));
const savedAmountDiffers = computed(() => {
  const amount = preview.value.amount;
  return (
    props.savedTotalAmount !== undefined &&
    props.savedTotalAmountSource !== undefined &&
    amount !== null &&
    (props.savedTotalAmount !== amount.totalAmount ||
      props.savedTotalAmountSource !== amount.totalAmountSource)
  );
});
</script>

<style scoped>
.total-amount-field {
  min-width: 0;
  width: 100%;
}
.amount-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 0 8px;
  margin-top: 3px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.amount-preview strong {
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}
.calculated-reference {
  flex-basis: 100%;
}
.amount-error {
  color: var(--el-color-danger);
}
.saved-total-amount {
  display: flex;
  flex-wrap: wrap;
  gap: 0 4px;
  margin-top: 3px;
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.5;
}
</style>
