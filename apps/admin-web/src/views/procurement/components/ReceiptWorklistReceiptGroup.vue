<template>
  <div class="receipt-group">
    <div class="receipt-heading">
      <slot name="receipt-title"
        ><strong>到货单 {{ receipt.receiptNo }}</strong></slot
      >
      <el-tag
        v-if="voidRecord ?? receipt.lines[0]?.void"
        type="danger"
        effect="plain"
        size="small"
        :title="(voidRecord ?? receipt.lines[0]?.void)?.reason"
        >{{ RECEIPT_ROUND_STATUS_LABELS.voided }}</el-tag
      >
      <span class="document-meta"
        >{{ quantityScope }} {{ lineCount ?? receipt.lines.length }} 条到货明细</span
      >
      <span class="supplier-name">供应商 {{ receipt.supplierName }}</span>
      <slot
        name="receipt-meta"
        :receipt="receipt"
      />
    </div>
    <div
      v-if="showLines"
      class="receipt-table-scroll"
    >
      <table class="receipt-table">
        <caption class="visually-hidden">
          {{
            receipt.receiptNo
          }}
          {{
            quantityScope
          }}到货明细
        </caption>
        <colgroup>
          <col style="width: 90px" />
          <col style="width: 210px" />
          <slot name="column-widths" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">明细 ID</th>
            <th scope="col">物料 / 精确版本</th>
            <slot name="column-headings" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in receipt.lines"
            :key="rowId(row)"
            class="line-row"
            :class="{ highlighted: highlightedLineId === rowId(row) }"
          >
            <td class="receipt-line-id">到货 id:{{ rowId(row) }}</td>
            <td>
              <strong class="material-name">{{ row.itemName }}</strong>
              <div class="material-version">{{ row.materialVariantCode }}</div>
              <slot
                name="material-detail"
                :row="row"
              />
            </td>
            <slot
              name="row"
              :row="row"
            />
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
<script setup lang="ts" generic="T extends ProcurementReceiptListSource">
import type { ProcurementReceiptListSource, ProcurementReceiptVoidItem } from '@company/contracts';
import { RECEIPT_ROUND_STATUS_LABELS } from '@company/constants';
import type { ReceiptWorklistReceipt } from '../receipt-worklist';

defineOptions({ name: 'ReceiptWorklistReceiptGroup' });
withDefaults(
  defineProps<{
    receipt: ReceiptWorklistReceipt<T>;
    rowId: (row: T) => string;
    highlightedLineId?: string;
    quantityScope: string;
    lineCount?: number;
    showLines?: boolean;
    voidRecord?: ProcurementReceiptVoidItem | null;
  }>(),
  { showLines: true, highlightedLineId: '', lineCount: undefined, voidRecord: null },
);
defineSlots<{
  'receipt-title'(): unknown;
  'receipt-meta'(props: { receipt: ReceiptWorklistReceipt<T> }): unknown;
  'material-detail'(props: { row: T }): unknown;
  'column-widths'(): unknown;
  'column-headings'(): unknown;
  row(props: { row: T }): unknown;
}>();
</script>
<style scoped>
.receipt-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  padding: 9px 12px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.document-meta {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.receipt-group + .receipt-group {
  border-top: 1px solid var(--el-border-color-lighter);
}
.receipt-table-scroll {
  overflow-x: auto;
}
.receipt-table {
  width: 100%;
  min-width: 930px;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.receipt-table :deep(th),
.receipt-table :deep(td) {
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  text-align: left;
  vertical-align: middle;
  overflow-wrap: anywhere;
}
.receipt-table :deep(thead th) {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-weight: 600;
}
.line-row:hover :deep(td) {
  background: var(--el-fill-color);
}
.line-row.highlighted > td:first-child {
  box-shadow: inset 3px 0 var(--el-color-primary);
}
.material-name {
  display: block;
  font-weight: 600;
}
.material-version {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.receipt-line-id {
  font-weight: 600;
}
.supplier-name {
  overflow-wrap: anywhere;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
