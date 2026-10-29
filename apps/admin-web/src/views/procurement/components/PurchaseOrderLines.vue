<template>
  <div
    v-show="hasHorizontalOverflow"
    ref="topScrollRef"
    class="purchase-line-top-scroll"
    role="region"
    aria-label="采购行横向滚动条"
    tabindex="0"
    @scroll.passive="syncFromTop"
  >
    <div :style="{ width: `${topScrollContentWidth}px` }" />
  </div>
  <el-table
    ref="lineTableRef"
    :data="order.items"
    row-key="id"
    :row-class-name="lineClassName"
    :row-expandable="hasLineContext"
    class="purchase-line-table"
    @scroll="syncFromTable"
  >
    <el-table-column
      v-if="order.items.some(hasLineContext)"
      type="expand"
    >
      <template #default="{ row }">
        <div class="line-context">
          <PurchaseOrderSources
            v-if="row.sources.length"
            :sources="row.sources"
          />
          <p v-if="row.originPurchaseOrderId">
            原采购：
            <el-button
              link
              type="primary"
              class="source-order-number"
              :disabled="disabled"
              @click="$emit('navigate', row.originPurchaseOrderId)"
              >{{ row.originPurchaseNo }}</el-button
            >
            · 采购行 ID：<strong class="identity-value">{{ row.originOrderLineId }}</strong>
          </p>
          <p v-if="row.supplementEvidence">补单依据：{{ row.supplementEvidence }}</p>
          <p v-if="row.originReceiptLineId">
            原到货单号：
            <span :class="{ 'identity-value': row.originReceiptNo }">{{
              row.originReceiptNo ?? '未提供'
            }}</span>
            · 到货行 ID：<strong class="identity-value">{{ row.originReceiptLineId }}</strong>
            <el-button
              v-if="auth.can(PERMISSIONS.warehouse.receipts.view)"
              link
              type="primary"
              :disabled="disabled"
              @click="$emit('source-receipt', row.originReceiptLineId)"
              >查看到货及正式清单</el-button
            >
          </p>
        </div>
      </template>
    </el-table-column>
    <el-table-column
      label="采购行 ID"
      min-width="160"
    >
      <template #default="{ row }">
        <div
          :id="`purchase-order-line-${row.id}`"
          class="purchase-line-identity"
        >
          <div class="purchase-line-heading">
            <strong class="purchase-line-id">{{ row.id }}</strong>
            <el-tag
              v-if="row.id === focusedLineId"
              size="small"
              type="primary"
              effect="light"
              >当前定位</el-tag
            >
          </div>
        </div>
      </template>
    </el-table-column>
    <el-table-column
      label="物料 / 精确版本"
      min-width="190"
    >
      <template #default="{ row }">
        <div class="material-identity">
          <div class="material-name">{{ row.itemName }}</div>
          <div class="material-variant">{{ row.materialVariantCode }}</div>
        </div>
      </template>
    </el-table-column>
    <el-table-column
      label="到货方式"
      min-width="140"
      ><template #default="{ row }">{{
        PURCHASE_FULFILLMENT_MODE_LABELS[row.fulfillmentMode as PurchaseFulfillmentMode]
      }}</template></el-table-column
    >
    <el-table-column
      :label="order.supplementReason === 'excess_purchase' ? '补购量' : '采购量'"
      width="120"
      ><template #default="{ row }"
        >{{ Number(row.plannedQuantity) }} {{ row.unit }}</template
      ></el-table-column
    >
    <el-table-column
      v-if="order.supplementReason !== 'excess_purchase'"
      label="累计到货"
      width="100"
      ><template #default="{ row }">{{
        row.quantities?.receivedQuantity ?? '—'
      }}</template></el-table-column
    >
    <el-table-column
      v-if="order.supplementReason !== 'excess_purchase'"
      label="累计已入"
      width="100"
      ><template #default="{ row }">{{
        row.quantities?.inboundQuantity ?? '—'
      }}</template></el-table-column
    >
    <el-table-column
      v-if="order.supplementReason !== 'excess_purchase'"
      label="当前待退"
      width="100"
      ><template #default="{ row }">{{
        row.quantities?.pendingReturnQuantity ?? '—'
      }}</template></el-table-column
    >
    <el-table-column
      v-if="order.supplementReason !== 'excess_purchase'"
      label="实际已退"
      width="100"
      ><template #default="{ row }">{{
        row.quantities?.returnedQuantity ?? '—'
      }}</template></el-table-column
    >
    <el-table-column
      label="状态"
      width="100"
      fixed="right"
      ><template #default="{ row }"
        ><el-tag v-bind="purchaseOrderLineStatusTag(row.status as PurchaseOrderLineStatus)">{{
          PURCHASE_ORDER_LINE_STATUS_LABELS[row.status as PurchaseOrderLineStatus]
        }}</el-tag></template
      ></el-table-column
    >
    <el-table-column
      label="操作"
      width="200"
      fixed="right"
      ><template #default="{ row }">
        <div class="line-actions">
          <el-button
            v-if="
              order.orderedAt && row.fulfillmentMode === 'new_arrival' && row.status !== 'cancelled'
            "
            link
            type="primary"
            :disabled="disabled"
            @click="$emit('supplement', row.id)"
            >补单</el-button
          >
          <el-button
            v-if="order.status === 'ordered' && row.status === 'open'"
            link
            type="primary"
            :disabled="disabled"
            @click="$emit('close-line', row.id)"
            >结束此行</el-button
          >
          <el-button
            v-if="
              (order.status === 'ordered' || order.status === 'completed') &&
              row.status === 'closed'
            "
            link
            type="primary"
            :disabled="disabled"
            @click="$emit('reopen-line', row.id)"
            >恢复此行</el-button
          >
          <el-dropdown
            trigger="click"
            :disabled="disabled"
          >
            <el-button
              link
              type="primary"
              :disabled="disabled"
              >更多 <el-icon><ArrowDown /></el-icon
            ></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="$emit('supplements', row.id)">相关补单</el-dropdown-item>
                <el-dropdown-item
                  v-if="row.fulfillmentMode === 'new_arrival'"
                  @click="$emit('receipt-records', row.id)"
                  >到货记录</el-dropdown-item
                >
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </template></el-table-column
    >
  </el-table>
</template>
<script setup lang="ts">
import { nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import type { TableInstance } from 'element-plus';
import { ArrowDown } from '@element-plus/icons-vue';
import type {
  PurchaseOrderDetail,
  PurchaseOrderLine,
  PurchaseOrderLineStatus,
  PurchaseFulfillmentMode,
} from '@company/contracts';
import {
  PURCHASE_ORDER_LINE_STATUS_LABELS,
  PURCHASE_FULFILLMENT_MODE_LABELS,
  PERMISSIONS,
} from '@company/constants';
import { useAuthStore } from '../../../stores/auth';
import { purchaseOrderLineStatusTag } from '../purchase-order-presentation';
import PurchaseOrderSources from './PurchaseOrderSources.vue';
const props = defineProps<{
  order: PurchaseOrderDetail;
  disabled: boolean;
  focusedLineId?: string;
}>();
defineEmits<{
  'close-line': [string];
  'reopen-line': [string];
  supplements: [string];
  supplement: [string];
  'receipt-records': [string];
  'source-receipt': [string];
  navigate: [string];
}>();
const auth = useAuthStore();
const hasLineContext = (row: PurchaseOrderLine): boolean =>
  Boolean(
    row.sources.length ||
    row.originPurchaseOrderId ||
    row.supplementEvidence ||
    row.originReceiptLineId,
  );
const lineClassName = ({ row }: { row: PurchaseOrderLine }): string =>
  row.id === props.focusedLineId ? 'source-line-highlight' : '';

const lineTableRef = ref<TableInstance>();
const topScrollRef = ref<HTMLDivElement>();
const topScrollContentWidth = ref(0);
const hasHorizontalOverflow = ref(false);
let resizeObserver: ResizeObserver | undefined;
let observedWrap: HTMLDivElement | undefined;
let observedBody: HTMLElement | undefined;
let measureFrame = 0;
let active = true;

const tableScrollWrap = (): HTMLDivElement | undefined => lineTableRef.value?.scrollBarRef?.wrapRef;
const measureScrollWidth = (): void => {
  const wrap = tableScrollWrap();
  if (!active || !wrap) return;
  const top = topScrollRef.value;
  hasHorizontalOverflow.value = wrap.scrollWidth - wrap.clientWidth > 1;
  topScrollContentWidth.value =
    wrap.scrollWidth - wrap.clientWidth + (top?.clientWidth || wrap.clientWidth);
  if (top && Math.abs(top.scrollLeft - wrap.scrollLeft) > 1) top.scrollLeft = wrap.scrollLeft;
};
const scheduleMeasure = (): void => {
  cancelAnimationFrame(measureFrame);
  measureFrame = requestAnimationFrame(measureScrollWidth);
};
const observeTableScroll = (): void => {
  const wrap = tableScrollWrap();
  if (!active || !wrap) return;
  const body = wrap.querySelector<HTMLElement>('table.el-table__body') ?? undefined;
  if (wrap !== observedWrap || body !== observedBody) {
    resizeObserver?.disconnect();
    resizeObserver ??= new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(wrap);
    if (body) resizeObserver.observe(body);
    if (topScrollRef.value) resizeObserver.observe(topScrollRef.value);
    observedWrap = wrap;
    observedBody = body;
  }
  scheduleMeasure();
};
const refreshTableScroll = async (): Promise<void> => {
  await nextTick();
  observeTableScroll();
};
const syncFromTop = (event: Event): void => {
  const top = event.target;
  const wrap = tableScrollWrap();
  if (top instanceof HTMLDivElement && wrap && Math.abs(wrap.scrollLeft - top.scrollLeft) > 1)
    lineTableRef.value?.setScrollLeft(top.scrollLeft);
};
const syncFromTable = ({ scrollLeft }: { scrollLeft: number }): void => {
  const top = topScrollRef.value;
  if (top && Math.abs(top.scrollLeft - scrollLeft) > 1) top.scrollLeft = scrollLeft;
};
const disconnectScrollObserver = (): void => {
  resizeObserver?.disconnect();
  observedWrap = undefined;
  observedBody = undefined;
  cancelAnimationFrame(measureFrame);
};
watch(
  () => props.order,
  () => void refreshTableScroll(),
  { flush: 'post' },
);
onMounted(() => void refreshTableScroll());
onActivated(() => {
  active = true;
  void refreshTableScroll();
});
onDeactivated(() => {
  active = false;
  disconnectScrollObserver();
});
onUnmounted(() => {
  active = false;
  disconnectScrollObserver();
});
</script>
<style scoped>
.purchase-line-top-scroll {
  height: 16px;
  margin-bottom: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  background: var(--el-fill-color-light);
  scrollbar-color: var(--el-border-color-darker) var(--el-fill-color-light);
  scrollbar-width: thin;
}
.purchase-line-top-scroll > div {
  height: 1px;
}
.purchase-line-top-scroll:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.purchase-line-table {
  container-type: inline-size;
}
.purchase-line-table :deep(.el-table__expand-icon.is-disabled) {
  visibility: hidden;
}
.purchase-line-table :deep(.el-table__expanded-cell:has(> .line-context)) {
  padding: 0;
}
.line-context {
  box-sizing: border-box;
  position: sticky;
  left: 0;
  width: 100cqw;
  padding: 16px 24px;
  overflow-wrap: anywhere;
}
.material-identity {
  min-width: 0;
  overflow-wrap: anywhere;
}
.material-name {
  color: var(--el-text-color-primary);
  font-weight: 500;
}
.material-variant {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.line-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 10px;
}
.line-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.purchase-line-identity {
  overflow-wrap: anywhere;
}
.purchase-line-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.purchase-line-id {
  color: var(--el-text-color-primary);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.identity-value {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.source-order-number {
  --el-button-font-weight: 600;
}
:deep(.source-line-highlight td) {
  background: var(--el-color-primary-light-9) !important;
}
</style>
