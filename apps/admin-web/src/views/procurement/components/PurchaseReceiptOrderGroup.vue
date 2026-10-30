<template>
  <section
    class="document-block"
    :data-purchase-order-id="group.purchaseOrder.id"
  >
    <div class="document-heading">
      <div class="order-identity">
        <DisclosureToggle
          :expanded="expanded"
          :label="`采购单 ${group.purchaseOrder.purchaseNo}`"
          :disabled="loading"
          @toggle="emit('toggle')"
        />
        <span class="order-title"
          >采购单 <strong class="order-number">{{ group.purchaseOrder.purchaseNo }}</strong></span
        >
        <el-tag
          v-if="focused"
          size="small"
          effect="plain"
          >当前定位</el-tag
        >
        <span class="supplier-name">供应商 {{ group.purchaseOrder.supplierName }}</span>
        <span class="document-meta"
          >{{ group.purchaseOrder.receiptCount }} 张到货<template
            v-if="group.purchaseOrder.awaitingAcceptanceCount > 0"
          >
            · {{ group.purchaseOrder.awaitingAcceptanceCount }} 条待核对</template
          ></span
        >
        <p
          v-if="group.purchaseOrder.remark"
          class="order-remark"
        >
          <span class="remark-label">备注</span>{{ group.purchaseOrder.remark }}
        </p>
      </div>
      <el-button
        v-if="group.purchaseOrder.status === 'ordered'"
        link
        type="primary"
        :disabled="blocked"
        @click="emit('create')"
        >记录到货</el-button
      >
    </div>
    <div
      v-if="expanded"
      v-loading="group.loading"
      class="receipt-directory"
    >
      <div
        v-if="group.error || (!group.loading && !group.loaded)"
        class="directory-error"
      >
        <InlineHint :tone="group.error ? 'danger' : 'info'">{{
          group.error || '尚未读取本单到货目录，请重新读取。'
        }}</InlineHint>
        <el-button
          link
          type="primary"
          @click="emit('refresh')"
          >重新读取到货目录</el-button
        >
      </div>
      <template v-else>
        <el-empty
          v-if="group.loaded && !group.receipts.length"
          description="本采购单暂无到货登记"
          :image-size="56"
        />
        <div
          v-if="group.receipts.length"
          class="receipt-tree"
        >
          <ReceiptLinesTable
            v-for="receipt in group.receipts"
            :key="receipt.id"
            :receipt="receipt"
            :state="group.lines[receipt.id]"
            :expanded="group.expandedReceipts.has(receipt.id)"
            :highlighted-line-id="focusedLineId"
            :focused="receipt.id === focusedReceiptId"
            @toggle="emit('receipt-toggle', receipt)"
            @retry="emit('receipt-retry', receipt)"
            @detail="(id, lineId, intent) => emit('detail', id, lineId, intent)"
            @quality="emit('quality', $event)"
            @inbound="emit('inbound', $event)"
          />
        </div>
      </template>
      <PaginationFooter
        v-if="group.total >= 10"
        class="receipt-pagination"
        :total="group.total"
        :current-page="group.page"
        :page-size="10"
        :show-page-size="false"
        :disabled="group.loading"
        total-suffix="张到货"
        @page-change="emit('receipt-page', $event)"
      />
    </div>
  </section>
</template>
<script setup lang="ts">
import type { ProcurementReceiptItem } from '@company/contracts';
import DisclosureToggle from '../../../components/DisclosureToggle.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import InlineHint from '../../../components/InlineHint.vue';
import type { ReceiptPurchaseOrderGroup } from '../composables/usePurchaseReceiptOrders';
import type { ReceiptDetailIntent } from '../receipt-round-presentation';
import ReceiptLinesTable from './ReceiptLinesTable.vue';

defineOptions({ name: 'PurchaseReceiptOrderGroup' });
defineProps<{
  group: ReceiptPurchaseOrderGroup;
  expanded: boolean;
  loading: boolean;
  blocked: boolean;
  focusedLineId?: string;
  focusedReceiptId?: string;
  focused: boolean;
}>();
const emit = defineEmits<{
  toggle: [];
  refresh: [];
  create: [];
  'receipt-toggle': [ProcurementReceiptItem];
  'receipt-retry': [ProcurementReceiptItem];
  'receipt-page': [number];
  detail: [receiptId: string, lineId?: string, intent?: ReceiptDetailIntent];
  quality: [string];
  inbound: [string];
}>();
</script>
<style scoped>
.document-block {
  min-width: 0;
  margin: 0 16px 18px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}
.document-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 8px 20px;
  padding: 12px 16px;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.document-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.order-identity {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  min-width: 0;
}
.order-title {
  font-size: 14px;
  font-weight: 400;
  overflow-wrap: anywhere;
}
.order-number {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.supplier-name {
  overflow-wrap: anywhere;
}
.order-remark {
  flex: 1 1 160px;
  min-width: 0;
  margin: 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.remark-label {
  margin-right: 10px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.receipt-directory {
  min-width: 0;
  min-height: 56px;
  padding: 16px 16px 16px 24px;
}
.receipt-tree {
  min-width: 0;
  padding-left: 16px;
  border-left: 1px solid var(--el-border-color);
}
.receipt-pagination {
  justify-content: space-between;
  margin-top: 12px;
  margin-left: 17px;
  padding-right: 0;
  padding-left: 0;
  border-top: 1px solid var(--el-border-color-lighter);
}
.receipt-pagination :deep(.total-text) {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.directory-error {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 0 4px 17px;
}
</style>
