<template>
  <article
    class="association-receipt-card"
    :class="{ 'association-receipt-card--selected': selected }"
    :data-receipt-id="receipt.receiptId"
  >
    <div class="receipt-heading">
      <strong class="receipt-number">{{ receipt.receiptNo }}</strong>
      <span
        class="receipt-purchase"
        :title="`采购单 ${receipt.purchaseNo}`"
        >采购单 {{ receipt.purchaseNo }}</span
      >
      <span
        class="receipt-suppliers"
        :title="`供应商：${receipt.supplierName || '—'}`"
        >{{ receipt.supplierName || '—' }}</span
      >
      <span class="line-count">{{ receipt.lineCount }} 行物料</span>
    </div>
    <div
      v-if="showAssociation || receipt.void || $slots.default || $slots.actions"
      class="receipt-secondary"
    >
      <div class="receipt-context">
        <el-tag
          v-if="receipt.void"
          size="small"
          type="danger"
          effect="plain"
          >{{ RECEIPT_ROUND_STATUS_LABELS.voided }}</el-tag
        >
        <span
          v-if="showAssociation"
          class="receipt-association"
          ><span class="association-label">当前关联：</span
          >{{ receipt.order?.inspectionNo ?? '未关联' }}</span
        >
        <div
          v-if="$slots.default"
          class="receipt-extra"
        >
          <slot />
        </div>
      </div>
      <div
        v-if="$slots.actions"
        class="receipt-actions"
      >
        <slot name="actions" />
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { RECEIPT_ROUND_STATUS_LABELS } from '@company/constants';
import type { QualityIncomingInspectionReceiptItem } from '@company/contracts';

defineOptions({ name: 'IncomingInspectionAssociationReceiptCard' });
withDefaults(
  defineProps<{
    receipt: QualityIncomingInspectionReceiptItem;
    selected?: boolean;
    showAssociation?: boolean;
  }>(),
  { selected: false, showAssociation: true },
);
</script>

<style scoped>
.association-receipt-card {
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-bg-color);
}
.association-receipt-card--selected {
  border-color: var(--el-color-primary-light-5);
}
.receipt-heading {
  display: grid;
  grid-template-columns: max-content max-content minmax(0, 1fr) max-content;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-primary);
  line-height: 1.5;
}
.receipt-number,
.receipt-purchase,
.line-count {
  white-space: nowrap;
}
.receipt-number {
  font-size: 14px;
}
.receipt-purchase,
.receipt-suppliers {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.receipt-suppliers {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.association-label {
  color: var(--el-text-color-secondary);
}
.line-count,
.receipt-association {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.receipt-secondary,
.receipt-context,
.receipt-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.receipt-secondary {
  justify-content: space-between;
  min-height: 24px;
  margin-top: 5px;
}
.receipt-context {
  flex: 1;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.receipt-association {
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.receipt-extra {
  flex: 1;
  min-width: 0;
}
.receipt-actions {
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px 12px;
}
.receipt-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
</style>
