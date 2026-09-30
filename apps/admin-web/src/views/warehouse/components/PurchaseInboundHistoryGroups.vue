<template>
  <div
    ref="container"
    v-loading="loading"
    class="history-groups"
  >
    <div
      v-if="!rows.length"
      class="empty-list"
    >
      暂无已确认外购入库单
    </div>
    <section
      v-for="order in rows"
      :key="order.inboundId"
      class="inbound-block"
      :class="{ 'is-located': order.inboundId === locatedInboundId }"
    >
      <InboundGroupHeader
        :expanded="!collapsedInboundIds.has(order.inboundId)"
        :title="`入库单 ${order.inboundNo}`"
        :count-label="`本单 ${order.detailCount} 条实际入库明细`"
        @toggle="toggleInbound(order.inboundId)"
      >
        <span class="group-meta supplier-summary"
          >供应商<span v-if="order.suppliers.length > 1">（{{ order.suppliers.length }} 家）</span>
          {{ supplierSummary(order) }}</span
        >
        <span class="group-meta">
          确认 {{ order.inboundAt ? formatDateTimeForDisplay(order.inboundAt) : '未记录' }}
        </span>
        <span class="group-meta">确认人 {{ order.operatorName || '未记录' }}</span>
        <span class="group-meta">入库 {{ quantitySummary(order) }}</span>
        <el-tag
          v-if="order.inboundId === locatedInboundId"
          type="primary"
          effect="plain"
        >
          当前定位
        </el-tag>
        <el-button
          v-if="order.inboundId === locatedInboundId"
          link
          @click="$emit('clear-location')"
          >取消定位</el-button
        >
      </InboundGroupHeader>
      <div
        v-if="!collapsedInboundIds.has(order.inboundId)"
        class="details-scroll"
      >
        <div
          v-if="order.remark"
          class="order-remark"
        >
          备注：{{ order.remark }}
        </div>
        <el-table
          :data="order.details"
          row-key="id"
          class="details-table"
          empty-text="本单无实际入库明细"
        >
          <el-table-column
            label="到货来源"
            min-width="185"
          >
            <template #default="{ row }">
              <template v-if="row.procurementSource">
                <el-button
                  v-if="auth.can(PERMISSIONS.procurement.receipts.view)"
                  class="source-link"
                  type="primary"
                  link
                  @click="
                    goSource('procurement-receipts', {
                      receiptLineId: row.procurementSource.receipt.receiptLineId,
                    })
                  "
                  >{{ row.procurementSource.receipt.receiptNo }} · 第
                  {{ row.procurementSource.receipt.receiptLineNo }} 行</el-button
                >
                <span v-else>
                  {{ row.procurementSource.receipt.receiptNo }} · 第
                  {{ row.procurementSource.receipt.receiptLineNo }} 行
                </span>
                <div class="source-id">
                  到货明细 ID：{{ row.procurementSource.receipt.receiptLineId }}
                </div>
              </template>
              <span
                v-else-if="row.procurementReceiptLineId"
                class="muted"
                >来源信息未完整提供<br />到货明细 ID：{{ row.procurementReceiptLineId }}</span
              >
              <span
                v-else
                class="muted"
                >无采购来源记录</span
              >
            </template>
          </el-table-column>
          <el-table-column
            label="物料 / 精确版本"
            min-width="195"
          >
            <template #default="{ row }">
              <div>{{ row.itemCode }} · {{ row.itemName }}</div>
              <div class="muted">{{ row.materialVariantCode }}</div>
            </template>
          </el-table-column>
          <el-table-column
            label="供应商"
            min-width="145"
          >
            <template #default="{ row }">{{ row.supplierName || '未记录' }}</template>
          </el-table-column>
          <el-table-column
            label="采购归属与采用检验"
            min-width="350"
          >
            <template #default="{ row }">
              <div
                v-if="row.procurementSource"
                class="source-trace"
              >
                <div>
                  <span class="source-label">实际归属采购</span>
                  <el-button
                    v-if="auth.can(PERMISSIONS.procurement.orders.view)"
                    class="source-link"
                    type="primary"
                    link
                    @click="
                      goSource('procurement-orders', {
                        purchaseOrderId: row.procurementSource.purchaseOrder.purchaseOrderId,
                        purchaseOrderLineId:
                          row.procurementSource.purchaseOrder.purchaseOrderLineId,
                      })
                    "
                    >{{ row.procurementSource.purchaseOrder.purchaseOrderNo }} · 第
                    {{ row.procurementSource.purchaseOrder.purchaseOrderLineNo }} 行</el-button
                  >
                  <span v-else>
                    {{ row.procurementSource.purchaseOrder.purchaseOrderNo }} · 第
                    {{ row.procurementSource.purchaseOrder.purchaseOrderLineNo }} 行
                  </span>
                </div>
                <div
                  v-if="
                    row.procurementSource.receipt.purchaseOrderNo !==
                    row.procurementSource.purchaseOrder.purchaseOrderNo
                  "
                  class="assignment-note"
                >
                  补单承接 · 到货登记采购 {{ row.procurementSource.receipt.purchaseOrderNo }}
                </div>
                <div>
                  <span class="source-label">采用检验</span>
                  <el-button
                    v-if="auth.can(PERMISSIONS.quality.inboundInspections.view)"
                    class="source-link"
                    type="primary"
                    link
                    :title="`检验时间：${formatDateTimeForDisplay(row.procurementSource.inspection.inspectedAt)}`"
                    @click="
                      goSource('quality-inbound-inspections', {
                        receiptLineId: row.procurementSource.receipt.receiptLineId,
                        caseId: row.procurementSource.inspection.caseId,
                      })
                    "
                    >检验记录 ID {{ row.procurementSource.inspection.inspectionId }}</el-button
                  >
                  <span
                    v-else
                    :title="`检验时间：${formatDateTimeForDisplay(row.procurementSource.inspection.inspectedAt)}`"
                    >检验记录 ID {{ row.procurementSource.inspection.inspectionId }}</span
                  >
                </div>
              </div>
              <span
                v-else-if="row.procurementReceiptLineId"
                class="muted"
                >来源信息未完整提供</span
              >
              <span
                v-else
                class="muted"
                >无采购来源记录</span
              >
            </template>
          </el-table-column>
          <el-table-column
            label="目标库存批次"
            min-width="150"
          >
            <template #default="{ row }">
              <el-button
                class="source-link"
                type="primary"
                link
                @click="goSource('warehouse-inventory', { itemBatchId: row.itemBatchId })"
                >{{ row.batchCode }}</el-button
              >
            </template>
          </el-table-column>
          <el-table-column
            label="本次入库"
            min-width="125"
            align="right"
          >
            <template #default="{ row }">
              <strong>{{ formatQuantity(row.inboundQuantity) }} {{ row.unit }}</strong>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { PERMISSIONS } from '@company/constants';
import type { PurchaseInboundOrderItem } from '@company/contracts';
import { useAuthStore } from '../../../stores/auth';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../production/production-status';
import InboundGroupHeader from './InboundGroupHeader.vue';

defineOptions({ name: 'PurchaseInboundHistoryGroups' });
const props = defineProps<{
  rows: PurchaseInboundOrderItem[];
  loading: boolean;
  locatedInboundId?: string | null;
  goSource: (name: string, query: Record<string, string>) => Promise<void>;
}>();
defineEmits<{ 'clear-location': [] }>();
const auth = useAuthStore();
const container = ref<HTMLElement | null>(null);
const collapsedInboundIds = ref(new Set<string>());
watch(
  () => props.rows.map((row) => row.inboundId).join('\u0000'),
  () => {
    collapsedInboundIds.value = new Set(
      props.rows
        .slice(1)
        .map((row) => row.inboundId)
        .filter((id) => id !== props.locatedInboundId),
    );
  },
  { immediate: true },
);
watch(
  () => props.locatedInboundId,
  (id) => {
    if (!id) return;
    const next = new Set(collapsedInboundIds.value);
    next.delete(id);
    collapsedInboundIds.value = next;
  },
);
watch(
  () => [props.locatedInboundId, props.rows.map((row) => row.inboundId).join('\u0000')] as const,
  async ([id]) => {
    if (!id || !props.rows.some((row) => row.inboundId === id)) return;
    await nextTick();
    container.value?.querySelector<HTMLElement>('.inbound-block.is-located')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  },
  { immediate: true, flush: 'post' },
);
const toggleInbound = (id: string): void => {
  const next = new Set(collapsedInboundIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsedInboundIds.value = next;
};
const quantitySummary = (order: PurchaseInboundOrderItem): string =>
  order.quantitySummary.length
    ? order.quantitySummary
        .map((item) => `${formatQuantity(item.quantity)} ${item.unit}`)
        .join(' / ')
    : '—';
const supplierSummary = (order: PurchaseInboundOrderItem): string =>
  order.suppliers.length
    ? order.suppliers.map((supplier) => supplier.supplierName || '未记录').join('、')
    : '未记录';
</script>

<style scoped>
.history-groups {
  min-height: 90px;
}
.empty-list {
  padding: 32px 16px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
.inbound-block {
  border-top: 1px solid var(--el-border-color-lighter);
}
.inbound-block.is-located {
  box-shadow: inset 3px 0 var(--el-color-primary);
}
.group-meta {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.supplier-summary {
  overflow-wrap: anywhere;
}
.details-scroll {
  max-width: 100%;
  overflow-x: auto;
}
.order-remark {
  padding: 8px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-regular);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.details-table {
  min-width: 1000px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
.source-link {
  height: auto;
  white-space: normal;
  text-align: left;
  overflow-wrap: anywhere;
}
.source-id,
.source-label {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.source-id {
  margin-top: 3px;
  overflow-wrap: anywhere;
}
.source-label {
  margin-right: 6px;
}
.source-trace {
  display: grid;
  gap: 3px;
  line-height: 1.5;
}
.assignment-note {
  color: var(--el-color-warning-dark-2);
  font-size: 12px;
}
</style>
