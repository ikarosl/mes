<template>
  <div
    v-loading="sources.loading.value"
    class="source-groups"
  >
    <InlineHint class="page-scope-hint">
      按有效到货明细分页，组内仅展示本页命中项；选择本组仅作用于本页，可跨页保留已选。
    </InlineHint>
    <div
      v-if="!sourceGroups.length"
      class="empty-list"
    >
      {{ emptyText }}
    </div>
    <section
      v-for="group in sourceGroups"
      :key="group.receiptId"
      class="receipt-block"
    >
      <InboundGroupHeader
        :expanded="!collapsedReceiptIds.has(group.receiptId)"
        title-label="到货单"
        :title="group.receiptNo"
        :count-label="`本页 ${group.items.length} 条到货明细`"
        @toggle="toggleReceipt(group.receiptId)"
      >
        <span class="receipt-meta"
          >登记采购 <span class="identity-value">{{ group.receiptPurchaseNo }}</span></span
        >
        <span class="receipt-meta">到货 {{ formatDateTimeForDisplay(group.receivedAt) }}</span>
        <el-checkbox
          :model-value="sources.isPageGroupSelected(group.items)"
          :indeterminate="
            sources.isPageGroupPartSelected(group.items) &&
            !sources.isPageGroupSelected(group.items)
          "
          :disabled="sources.locked.value"
          aria-label="选择本组本页到货明细"
          @change="sources.togglePageGroup(group.items)"
          >选择本组（本页）</el-checkbox
        >
      </InboundGroupHeader>
      <div v-if="!collapsedReceiptIds.has(group.receiptId)">
        <el-table
          :data="group.items"
          row-key="receiptLineId"
        >
          <el-table-column width="48">
            <template #default="{ row }">
              <el-checkbox
                :model-value="sources.isSelected(row.receiptLineId)"
                :disabled="sources.locked.value"
                :aria-label="`${sources.isSelected(row.receiptLineId) ? '取消到货明细选择' : '选择到货明细'} ${row.receiptNo} · 到货行 ID ${row.receiptLineId} ${row.itemCode} ${row.purchaseNo}`"
                @change="sources.toggle(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            label="到货行 ID"
            min-width="130"
          >
            <template #default="{ row }">
              <el-button
                v-if="auth.can(PERMISSIONS.warehouse.receipts.view)"
                class="source-link"
                type="primary"
                link
                @click="goSource('procurement-receipts', { receiptLineId: row.receiptLineId })"
                ><span class="identity-value">{{ row.receiptLineId }}</span></el-button
              >
              <span
                v-else
                class="cell-wrap identity-value"
                >{{ row.receiptLineId }}</span
              >
            </template>
          </el-table-column>
          <el-table-column
            label="物料 / 精确版本"
            min-width="200"
          >
            <template #default="{ row }">
              <div>{{ row.itemCode }} · {{ row.itemName }}</div>
              <div class="muted">{{ row.materialVariantCode }}</div>
            </template>
          </el-table-column>
          <el-table-column
            label="来源采购"
            min-width="160"
          >
            <template #default="{ row }">
              <el-button
                v-if="auth.can(PERMISSIONS.procurement.orders.view)"
                class="source-link"
                type="primary"
                link
                @click="
                  goSource('procurement-orders', {
                    purchaseOrderId: row.purchaseOrderId,
                    purchaseOrderLineId: row.purchaseOrderLineId,
                  })
                "
                ><span class="identity-value">{{ row.purchaseNo }}</span></el-button
              >
              <span
                v-else
                class="cell-wrap identity-value"
                >{{ row.purchaseNo }}</span
              >
            </template>
          </el-table-column>
          <el-table-column
            label="供应商"
            min-width="120"
          >
            <template #default="{ row }">
              <div class="cell-wrap">{{ row.supplierName }}</div>
            </template>
          </el-table-column>
          <el-table-column
            label="计划采购量"
            min-width="130"
            align="right"
            ><template #default="{ row }"
              ><template v-if="row.plannedQuantity"
                >{{ formatQuantity(row.plannedQuantity) }} {{ row.unit }}</template
              ><span v-else>—</span></template
            ></el-table-column
          >
          <el-table-column
            label="累计已入库"
            min-width="130"
            align="right"
            ><template #default="{ row }"
              >{{ formatQuantity(row.inboundQuantity) }} {{ row.unit }}</template
            ></el-table-column
          >
          <el-table-column
            label="最近其他处理说明"
            min-width="200"
            ><template #default="{ row }"
              ><span class="cell-wrap handling-note">{{
                row.otherHandlingNote || '—'
              }}</span></template
            ></el-table-column
          >
        </el-table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { PERMISSIONS } from '@company/constants';
import type { ProcurementInboundSourceItem } from '@company/contracts';
import { useAuthStore } from '../../../stores/auth';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../../utils/quantity';
import InlineHint from '../../../components/InlineHint.vue';
import type { usePurchaseInboundSources } from '../composables/usePurchaseInboundSources';
import InboundGroupHeader from './InboundGroupHeader.vue';

defineOptions({ name: 'PurchaseInboundSourceGroups' });
const props = defineProps<{
  sources: ReturnType<typeof usePurchaseInboundSources>;
  goSource: (name: string, query: Record<string, string>) => Promise<void>;
}>();
const sources = props.sources;
const emptyText = computed(() => {
  if (sources.loadError.value) return '读取失败，请刷新重试';
  if (sources.query.keyword || sources.query.receiptLineId) return '当前筛选无到货明细，请清除筛选';
  return '暂无有效到货明细，请先登记到货';
});
const goSource = props.goSource;
const auth = useAuthStore();
interface ReceiptPageGroup {
  receiptId: string;
  receiptNo: string;
  receiptPurchaseNo: string;
  receivedAt: string;
  items: ProcurementInboundSourceItem[];
}
const collapsedReceiptIds = ref(new Set<string>());
const toggleReceipt = (receiptId: string): void => {
  const next = new Set(collapsedReceiptIds.value);
  if (next.has(receiptId)) next.delete(receiptId);
  else next.add(receiptId);
  collapsedReceiptIds.value = next;
};
const sourceGroups = computed<ReceiptPageGroup[]>(() => {
  const byReceipt = new Map<string, ReceiptPageGroup>();
  for (const source of sources.rows.value) {
    let group = byReceipt.get(source.receiptId);
    if (!group) {
      group = {
        receiptId: source.receiptId,
        receiptNo: source.receiptNo,
        receiptPurchaseNo: source.receiptPurchaseNo,
        receivedAt: source.receiptReceivedAt,
        items: [],
      };
      byReceipt.set(source.receiptId, group);
    }
    group.items.push(source);
  }
  return [...byReceipt.values()];
});
</script>

<style scoped>
.source-groups {
  min-height: 90px;
}
.page-scope-hint {
  margin: 12px 16px;
}
.empty-list {
  padding: 32px 16px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
.receipt-block {
  border-top: 1px solid var(--el-border-color-lighter);
}
.receipt-meta {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.source-link {
  height: auto;
  font-weight: 400;
  white-space: normal;
  text-align: left;
  overflow-wrap: anywhere;
}
.identity-value {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.source-link .identity-value {
  color: inherit;
}
.cell-wrap {
  overflow-wrap: anywhere;
}
.handling-note {
  white-space: pre-wrap;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
</style>
