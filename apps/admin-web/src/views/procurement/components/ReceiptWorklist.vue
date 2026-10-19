<template>
  <div
    v-loading="loading"
    class="receipt-worklist"
  >
    <TableToolbar>
      <template #actions><slot name="actions" /></template>
      <template #tools>
        <el-button
          text
          @click="expandPage"
          >展开当前页</el-button
        >
        <el-button
          text
          @click="collapsePage"
          >收起当前页</el-button
        >
        <el-button
          :icon="Refresh"
          text
          circle
          :loading="loading"
          aria-label="刷新到货明细"
          @click="emit('refresh')"
        />
      </template>
    </TableToolbar>
    <div class="list-hint">
      <InlineHint
        >本页
        <strong>{{ rows.length }}</strong> 条到货明细，按采购单、到货单分组（同单可跨页）。<slot
          name="hint"
      /></InlineHint>
    </div>
    <el-empty
      v-if="!groups.length && !loading"
      :description="emptyText"
      :image-size="72"
    />
    <section
      v-for="purchase in groups"
      :key="purchase.purchaseOrderId"
      class="document-block"
    >
      <div class="document-heading">
        <button
          class="fold-button business-disclosure"
          type="button"
          :aria-expanded="!collapsedPurchases.has(purchase.purchaseOrderId)"
          @click="togglePurchase(purchase.purchaseOrderId)"
        >
          <span
            class="fold-icon"
            aria-hidden="true"
            >{{ collapsedPurchases.has(purchase.purchaseOrderId) ? '▶' : '▼' }}</span
          >
          <strong>采购单 {{ purchase.purchaseNo }}</strong>
          <span class="fold-action">{{
            collapsedPurchases.has(purchase.purchaseOrderId) ? '展开' : '收起'
          }}</span>
        </button>
        <span class="document-meta">本页含本单 {{ purchase.lines.length }} 条到货明细</span>
        <slot
          name="purchase-summary"
          :lines="purchase.lines"
        />
      </div>
      <div v-if="!collapsedPurchases.has(purchase.purchaseOrderId)">
        <div
          v-for="receipt in purchase.receipts"
          :key="receipt.receiptId"
          class="receipt-group"
        >
          <div class="receipt-heading">
            <strong>到货单 {{ receipt.receiptNo }}</strong>
            <el-tag
              v-if="receipt.lines[0].void"
              type="danger"
              effect="plain"
              size="small"
              :title="receipt.lines[0].void.reason"
              >{{ RECEIPT_ROUND_STATUS_LABELS.voided }}</el-tag
            >
            <span class="document-meta">本页 {{ receipt.lines.length }} 条到货明细</span>
            <slot
              name="receipt-meta"
              :receipt="receipt"
            />
          </div>
          <div class="receipt-table-scroll">
            <table class="receipt-table">
              <caption class="visually-hidden">
                {{
                  receipt.receiptNo
                }}
                本页到货明细
              </caption>
              <colgroup>
                <col style="width: 90px" />
                <col style="width: 210px" />
                <col style="width: 150px" />
                <slot name="column-widths" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">明细 ID</th>
                  <th scope="col">物料 / 精确版本</th>
                  <th scope="col">供应商</th>
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
                  </td>
                  <td>
                    <div class="supplier-name">{{ row.supplierName }}</div>
                    <slot
                      name="supplier-detail"
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
      </div>
    </section>
  </div>
</template>
<script setup lang="ts" generic="T extends ProcurementReceiptListSource">
import { computed, ref, watch } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import type { ProcurementReceiptListSource } from '@company/contracts';
import { RECEIPT_ROUND_STATUS_LABELS } from '@company/constants';
import TableToolbar from '../../../components/TableToolbar.vue';
import InlineHint from '../../../components/InlineHint.vue';
import {
  groupReceiptWorklist,
  type ReceiptWorklistHandle,
  type ReceiptWorklistReceipt,
} from '../receipt-worklist';

defineOptions({ name: 'ReceiptWorklist' });
const props = defineProps<{
  rows: T[];
  rowId: (row: T) => string;
  loading: boolean;
  emptyText: string;
  highlightedLineId?: string;
}>();
const emit = defineEmits<{ refresh: [] }>();
defineSlots<{
  actions(): unknown;
  hint(): unknown;
  'purchase-summary'(props: { lines: T[] }): unknown;
  'receipt-meta'(props: { receipt: ReceiptWorklistReceipt<T> }): unknown;
  'supplier-detail'(props: { row: T }): unknown;
  'column-widths'(): unknown;
  'column-headings'(): unknown;
  row(props: { row: T }): unknown;
}>();
const groups = computed(() => groupReceiptWorklist(props.rows));
const collapsedPurchases = ref(new Set<string>());
watch(groups, (current) => {
  const ids = new Set(current.map((group) => group.purchaseOrderId));
  collapsedPurchases.value = new Set([...collapsedPurchases.value].filter((id) => ids.has(id)));
});
function togglePurchase(id: string): void {
  const next = new Set(collapsedPurchases.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsedPurchases.value = next;
}
function expandPage(): void {
  collapsedPurchases.value = new Set();
}
function collapsePage(): void {
  collapsedPurchases.value = new Set(groups.value.map((group) => group.purchaseOrderId));
}
function revealLine(id: string): void {
  const group = groups.value.find((purchase) =>
    purchase.lines.some((row) => props.rowId(row) === id),
  );
  if (!group) return;
  const next = new Set(collapsedPurchases.value);
  next.delete(group.purchaseOrderId);
  collapsedPurchases.value = next;
}
defineExpose<ReceiptWorklistHandle>({ expandPage, revealLine });
</script>
<style scoped>
.receipt-worklist {
  min-height: 160px;
}
.list-hint {
  padding: 2px 16px 10px;
}
.document-block {
  margin: 0 16px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}
.document-heading,
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
.document-heading {
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.fold-button {
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
  min-width: 1080px;
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
