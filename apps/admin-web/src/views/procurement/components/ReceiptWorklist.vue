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
        <strong>{{ rows.length }}</strong>
        条到货明细，按采购单、到货单分组（同单可跨页）。</InlineHint
      >
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
        <span class="supplier-name">供应商 {{ purchase.supplierName }}</span>
        <span class="document-meta">本页含本单 {{ purchase.lines.length }} 条到货明细</span>
      </div>
      <div v-if="!collapsedPurchases.has(purchase.purchaseOrderId)">
        <ReceiptWorklistReceiptGroup
          v-for="receipt in purchase.receipts"
          :key="receipt.receiptId"
          :receipt="receipt"
          :row-id="rowId"
          quantity-scope="本页"
        >
          <template #receipt-meta="scope"
            ><slot
              name="receipt-meta"
              v-bind="scope"
          /></template>
          <template #material-detail="scope"
            ><slot
              name="material-detail"
              v-bind="scope"
          /></template>
          <template #column-widths><slot name="column-widths" /></template>
          <template #column-headings><slot name="column-headings" /></template>
          <template #row="scope"
            ><slot
              name="row"
              v-bind="scope"
          /></template>
        </ReceiptWorklistReceiptGroup>
      </div>
    </section>
  </div>
</template>
<script setup lang="ts" generic="T extends ProcurementReceiptListSource">
import { computed, ref, watch } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import type { ProcurementReceiptListSource } from '@company/contracts';
import TableToolbar from '../../../components/TableToolbar.vue';
import InlineHint from '../../../components/InlineHint.vue';
import ReceiptWorklistReceiptGroup from './ReceiptWorklistReceiptGroup.vue';
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
}>();
const emit = defineEmits<{ refresh: [] }>();
defineSlots<{
  actions(): unknown;
  'receipt-meta'(props: { receipt: ReceiptWorklistReceipt<T> }): unknown;
  'material-detail'(props: { row: T }): unknown;
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
defineExpose<ReceiptWorklistHandle>({ expandPage });
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
.document-heading {
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
.supplier-name {
  overflow-wrap: anywhere;
}
</style>
