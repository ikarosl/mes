<template>
  <div
    v-loading="releases.loading.value"
    class="release-groups"
  >
    <InlineHint class="page-scope-hint">
      按可入明细分页，组内仅展示本页命中项；选择本组仅作用于本页，可跨页保留已选。
    </InlineHint>
    <div
      v-if="!releaseGroups.length"
      class="empty-list"
    >
      {{
        releases.loadError.value
          ? '读取失败，请刷新重试'
          : releases.query.keyword || releases.query.receiptLineId
            ? '当前筛选无可入库授权，请清除筛选'
            : '无当前可入授权；请先核对到货检验与正式清单'
      }}
    </div>
    <section
      v-for="group in releaseGroups"
      :key="group.receiptId"
      class="receipt-block"
    >
      <InboundGroupHeader
        :expanded="!collapsedReceiptIds.has(group.receiptId)"
        :title="`到货 ${group.receiptNo}`"
        :count-label="`本页 ${group.items.length} 条可入明细`"
        @toggle="toggleReceipt(group.receiptId)"
      >
        <span class="receipt-meta">登记采购 {{ group.receiptPurchaseNo }}</span>
        <span class="receipt-meta">到货 {{ formatDateTimeForDisplay(group.receivedAt) }}</span>
        <el-checkbox
          :model-value="releases.isPageGroupSelected(group.items)"
          :indeterminate="
            releases.isPageGroupPartSelected(group.items) &&
            !releases.isPageGroupSelected(group.items)
          "
          :disabled="releases.locked.value"
          aria-label="选择本组本页可入明细"
          @change="releases.togglePageGroup(group.items)"
          >选择本组（本页）</el-checkbox
        >
        <el-button
          type="primary"
          link
          :disabled="releases.locked.value"
          @click="releases.reviewPageGroup(group.items)"
          >{{
            releases.hasSelectionOutsidePageGroup(group.items)
              ? '加入已选并核对'
              : '核对本组（本页）'
          }}</el-button
        >
      </InboundGroupHeader>
      <div v-if="!collapsedReceiptIds.has(group.receiptId)">
        <el-table
          :data="group.items"
          row-key="allocationId"
        >
          <el-table-column width="48">
            <template #default="{ row }">
              <el-checkbox
                :model-value="releases.isSelected(row.allocationId)"
                :disabled="releases.locked.value"
                :aria-label="`${releases.isSelected(row.allocationId) ? '取消可入明细选择' : '选择可入明细'} ${row.receiptNo} 第 ${row.receiptLineNo} 行 ${row.itemCode} ${row.purchaseNo}`"
                @change="releases.toggle(row)"
              />
            </template>
          </el-table-column>
          <el-table-column
            label="到货行"
            min-width="130"
          >
            <template #default="{ row }">
              <el-button
                v-if="auth.can(PERMISSIONS.procurement.receipts.view)"
                class="source-link"
                type="primary"
                link
                @click="goSource('procurement-receipts', { receiptLineId: row.receiptLineId })"
                >第 {{ row.receiptLineNo }} 行</el-button
              >
              <span
                v-else
                class="cell-wrap"
                >第 {{ row.receiptLineNo }} 行</span
              >
              <div class="source-id">到货明细 ID：{{ row.receiptLineId }}</div>
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
            label="实际归属采购"
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
                >{{ row.purchaseNo }}</el-button
              >
              <span
                v-else
                class="cell-wrap"
                >{{ row.purchaseNo }}</span
              >
              <div
                v-if="row.purchaseNo !== row.receiptPurchaseNo"
                class="assignment-note"
              >
                补单承接
              </div>
            </template>
          </el-table-column>
          <el-table-column
            label="供应商 / 批号"
            min-width="120"
          >
            <template #default="{ row }">
              <div class="cell-wrap">{{ row.supplierName }}</div>
              <div class="muted cell-wrap">批号 {{ row.supplierBatchCode || '未提供' }}</div>
            </template>
          </el-table-column>
          <el-table-column
            label="当前可入额度"
            min-width="130"
            align="right"
          >
            <template #default="{ row }"
              >{{ formatQuantity(row.approvedRemainingQuantity) }} {{ row.unit }}</template
            >
          </el-table-column>
          <el-table-column
            label="采用的检验"
            min-width="145"
            fixed="right"
          >
            <template #default="{ row }">
              <el-button
                v-if="auth.can(PERMISSIONS.quality.inboundInspections.view)"
                class="source-link"
                type="primary"
                link
                @click="
                  goSource('quality-inbound-inspections', {
                    receiptLineId: row.receiptLineId,
                    caseId: row.inspectionCaseId,
                  })
                "
                >检验记录 ID {{ row.inspectionId }}</el-button
              >
              <span
                v-else
                class="cell-wrap"
                >检验记录 ID {{ row.inspectionId }}</span
              >
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { PERMISSIONS } from '@company/constants';
import type { ProcurementInboundReleaseItem } from '@company/contracts';
import { useAuthStore } from '../../../stores/auth';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../production/production-status';
import InlineHint from '../../../components/InlineHint.vue';
import type { usePurchaseInboundReleases } from '../composables/usePurchaseInboundReleases';
import InboundGroupHeader from './InboundGroupHeader.vue';

defineOptions({ name: 'PurchaseInboundReleaseGroups' });
const props = defineProps<{
  releases: ReturnType<typeof usePurchaseInboundReleases>;
  goSource: (name: string, query: Record<string, string>) => Promise<void>;
}>();
const releases = props.releases;
const goSource = props.goSource;
const auth = useAuthStore();
interface ReceiptPageGroup {
  receiptId: string;
  receiptNo: string;
  receiptPurchaseNo: string;
  receivedAt: string;
  items: ProcurementInboundReleaseItem[];
}
const collapsedReceiptIds = ref(new Set<string>());
const toggleReceipt = (receiptId: string): void => {
  const next = new Set(collapsedReceiptIds.value);
  if (next.has(receiptId)) next.delete(receiptId);
  else next.add(receiptId);
  collapsedReceiptIds.value = next;
};
const releaseGroups = computed<ReceiptPageGroup[]>(() => {
  const byReceipt = new Map<string, ReceiptPageGroup>();
  for (const source of releases.rows.value) {
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
  for (const group of byReceipt.values())
    group.items.sort((a, b) => a.receiptLineNo - b.receiptLineNo);
  return [...byReceipt.values()];
});
</script>

<style scoped>
.release-groups {
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
.assignment-note {
  color: var(--el-color-warning-dark-2);
  font-size: 12px;
}
.source-id {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.source-link {
  height: auto;
  white-space: normal;
  text-align: left;
  overflow-wrap: anywhere;
}
.cell-wrap {
  overflow-wrap: anywhere;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
</style>
