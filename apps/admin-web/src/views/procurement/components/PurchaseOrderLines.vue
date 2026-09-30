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
    class="purchase-line-table"
    @scroll="syncFromTable"
  >
    <el-table-column type="expand">
      <template #default="{ row }">
        <div class="line-context">
          <PurchaseOrderSources :sources="row.sources" />
          <el-descriptions
            :column="4"
            border
            size="small"
            title="当前履约与仓库待办"
          >
            <el-descriptions-item label="累计实收">{{
              Number(row.quantities.receivedQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item label="少收量">{{
              Math.max(Number(row.plannedQuantity) - Number(row.quantities.receivedQuantity), 0)
            }}</el-descriptions-item>
            <el-descriptions-item label="有效允许入库量">{{
              Number(row.quantities.approvedQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item label="放行差额">{{
              Math.max(Number(row.plannedQuantity) - Number(row.quantities.approvedQuantity), 0)
            }}</el-descriptions-item>
            <el-descriptions-item label="累计已入量">{{
              Number(row.quantities.inboundQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item label="当前可入量">{{
              Number(row.quantities.pendingInboundQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item label="当前待退量">{{
              Number(row.quantities.pendingReturnQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item label="实际已退量">{{
              Number(row.quantities.returnedQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item label="未判定量">{{
              Number(row.quantities.undeterminedQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item label="复核中">{{
              row.quantities.hasOpenReview ? '有范围暂停办理' : '无'
            }}</el-descriptions-item>
          </el-descriptions>
          <p v-if="row.originPurchaseOrderId">
            原采购：<el-button
              link
              type="primary"
              :disabled="disabled"
              @click="$emit('navigate', row.originPurchaseOrderId)"
              >{{ row.originPurchaseNo }}</el-button
            >
            · 原采购行 {{ row.originOrderLineId }}
          </p>
          <p>
            履约方式：{{
              PURCHASE_FULFILLMENT_MODE_LABELS[row.fulfillmentMode as PurchaseFulfillmentMode]
            }}
          </p>
          <p v-if="row.supplementEvidence">补单依据：{{ row.supplementEvidence }}</p>
          <p v-if="row.originReceiptLineId">
            原到货明细：<el-button
              v-if="auth.can(PERMISSIONS.procurement.receipts.view)"
              link
              type="primary"
              :disabled="disabled"
              @click="$emit('source-receipt', row.originReceiptLineId)"
              >查看到货及正式清单</el-button
            ><span v-else>{{ row.originReceiptLineId }}</span>
            <template v-if="row.originAllocationId">
              · 质量退回分配明细 {{ row.originAllocationId }}</template
            >
          </p>
          <el-descriptions
            v-if="row.closure"
            :column="4"
            border
            size="small"
            title="关闭时的冻结依据"
          >
            <el-descriptions-item label="关闭原因">{{
              PURCHASE_ORDER_CLOSURE_REASON_LABELS[
                row.closure.reasonType as PurchaseOrderClosureReason
              ]
            }}</el-descriptions-item>
            <el-descriptions-item label="计划量">{{
              Number(row.closure.plannedQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item label="实收量">{{
              Number(row.closure.receivedQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item label="未判定量">{{
              Number(row.closure.undeterminedQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item label="有效批准量">{{
              Number(row.closure.approvedQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item label="累计已入量">{{
              Number(row.closure.inboundQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item label="待退量">{{
              Number(row.closure.returnDueQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item label="实际已退量">{{
              Number(row.closure.returnedQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item
              label="说明"
              :span="4"
              >{{ row.closure.reason || '—' }}</el-descriptions-item
            >
          </el-descriptions>
        </div>
      </template>
    </el-table-column>
    <el-table-column
      label="采购行"
      min-width="160"
    >
      <template #default="{ row }">
        <div
          :id="`purchase-order-line-${row.id}`"
          class="purchase-line-identity"
        >
          <div class="purchase-line-heading">
            <strong>第 {{ row.lineNo }} 行</strong>
            <el-tag
              v-if="row.id === focusedLineId"
              size="small"
              type="primary"
              effect="light"
              >当前定位</el-tag
            >
          </div>
          <div class="purchase-line-id">采购行 ID：{{ row.id }}</div>
        </div>
      </template>
    </el-table-column>
    <el-table-column
      prop="supplierName"
      label="实际供应商"
      min-width="160"
    />
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
      label="履约方式"
      min-width="140"
      ><template #default="{ row }">{{
        PURCHASE_FULFILLMENT_MODE_LABELS[row.fulfillmentMode as PurchaseFulfillmentMode]
      }}</template></el-table-column
    >
    <el-table-column
      label="采购量"
      width="120"
      ><template #default="{ row }"
        >{{ Number(row.plannedQuantity) }} {{ row.unit }}</template
      ></el-table-column
    >
    <el-table-column
      label="累计实收"
      width="100"
      ><template #default="{ row }">{{
        row.quantities.receivedQuantity
      }}</template></el-table-column
    >
    <el-table-column
      label="正式可入 / 已入"
      width="145"
      ><template #default="{ row }"
        >{{ row.quantities.pendingInboundQuantity }} /
        {{ row.quantities.inboundQuantity }}</template
      ></el-table-column
    >
    <el-table-column
      label="待处理 / 待退"
      width="145"
      ><template #default="{ row }"
        >{{ row.quantities.undeterminedQuantity }} /
        {{ row.quantities.pendingReturnQuantity }}</template
      ></el-table-column
    >
    <el-table-column
      label="状态"
      width="100"
      fixed="right"
      ><template #default="{ row }">{{
        PURCHASE_ORDER_LINE_STATUS_LABELS[row.status as PurchaseOrderLineStatus]
      }}</template></el-table-column
    >
    <el-table-column
      label="操作"
      width="220"
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
            link
            type="primary"
            :disabled="disabled"
            @click="$emit('supplements', row.id)"
            >相关补单</el-button
          >
          <el-button
            v-if="row.status === 'open'"
            link
            type="primary"
            :disabled="disabled || !row.allowedCloseReasons.length"
            @click="$emit('close-line', row.id)"
            >结束此行</el-button
          >
          <el-button
            v-if="
              auth.can(PERMISSIONS.procurement.receipts.view) &&
              (order.status === 'ordered' || order.status === 'completed') &&
              row.status !== 'cancelled'
            "
            link
            type="primary"
            :disabled="disabled"
            @click="$emit('receipts')"
            >到货记录</el-button
          >
        </div>
      </template></el-table-column
    >
  </el-table>
</template>
<script setup lang="ts">
import { nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import type { TableInstance } from 'element-plus';
import type {
  PurchaseOrderDetail,
  PurchaseOrderLine,
  PurchaseOrderLineStatus,
  PurchaseOrderClosureReason,
  PurchaseFulfillmentMode,
} from '@company/contracts';
import {
  PURCHASE_ORDER_LINE_STATUS_LABELS,
  PURCHASE_ORDER_CLOSURE_REASON_LABELS,
  PURCHASE_FULFILLMENT_MODE_LABELS,
  PERMISSIONS,
} from '@company/constants';
import { useAuthStore } from '../../../stores/auth';
import PurchaseOrderSources from './PurchaseOrderSources.vue';
const props = defineProps<{
  order: PurchaseOrderDetail;
  disabled: boolean;
  focusedLineId?: string;
}>();
defineEmits<{
  'close-line': [string];
  supplements: [string];
  supplement: [string];
  receipts: [];
  'source-receipt': [string];
  navigate: [string];
}>();
const auth = useAuthStore();
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
.line-context :deep(.el-descriptions__body table) {
  table-layout: fixed;
}
.line-context :deep(.el-descriptions__content) {
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
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
:deep(.source-line-highlight td) {
  background: var(--el-color-primary-light-9) !important;
}
</style>
