<template>
  <div
    class="purchase-receipt"
    :data-receipt-id="receipt.id"
  >
    <ReceiptWorklistReceiptGroup
      :receipt="{
        receiptNo: header.receiptNo,
        supplierName: header.supplierName,
        lines: state?.items ?? [],
      }"
      :row-id="(row) => row.id"
      :highlighted-line-id="highlightedLineId"
      :line-count="header.lineCount"
      :void-record="header.void"
      :show-lines="expanded && Boolean(state?.loaded) && !state?.error"
    >
      <template #receipt-title>
        <button
          class="receipt-disclosure"
          type="button"
          :aria-expanded="expanded"
          @click="emit('toggle')"
        >
          <el-icon
            class="receipt-fold-icon"
            :class="{ 'is-expanded': expanded }"
            aria-hidden="true"
            ><ArrowRight
          /></el-icon>
          <strong>到货单 {{ header.receiptNo }}</strong>
          <span class="fold-action">{{ expanded ? '收起物料' : '展开物料' }}</span>
        </button>
      </template>
      <template #receipt-meta>
        <el-tag
          v-if="focused"
          size="small"
          effect="plain"
          >当前定位</el-tag
        >
        <span class="group-meta">到货 {{ formatDateTimeForDisplay(header.receivedAt) }}</span>
        <span
          v-if="header.awaitingAcceptanceCount > 0"
          class="group-meta"
          >待核对 {{ header.awaitingAcceptanceCount }} 条</span
        >
        <div class="receipt-actions">
          <el-button
            link
            type="primary"
            @click="emit('detail', header.id)"
            >查看到货单</el-button
          >
          <el-button
            v-if="!header.void"
            link
            type="danger"
            @click="emit('detail', header.id, undefined, 'void')"
            >作废整单</el-button
          >
        </div>
      </template>
      <template #material-detail="{ row }"
        ><div class="secondary">批号 {{ row.supplierBatchCode || '未填写' }}</div></template
      >
      <template #column-widths
        ><col style="width: 110px" />
        <col style="width: 135px" />
        <col style="width: 175px" />
        <col style="width: 130px" />
        <col style="width: 230px"
      /></template>
      <template #column-headings
        ><th
          scope="col"
          class="quantity-cell"
        >
          到货量
        </th>
        <th scope="col">已入库 / 已退回</th>
        <th
          scope="col"
          title="尚未入库或退回 = 到货量 − 已入库 − 已退回"
        >
          尚未入库或退回
        </th>
        <th scope="col">当前阶段</th>
        <th
          scope="col"
          class="actions-cell"
        >
          操作
        </th></template
      >
      <template #row="{ row }">
        <td class="quantity-cell">
          <span v-if="isReceiptVoided(row)">—</span>
          <template v-else>
            <strong :class="{ 'zero-quantity': Number(row.quantities.receivedQuantity) === 0 }">{{
              row.quantities.receivedQuantity
            }}</strong>
            <span
              class="unit"
              :class="{ 'zero-quantity': Number(row.quantities.receivedQuantity) === 0 }"
              >{{ row.unit }}</span
            >
          </template>
        </td>
        <td>
          <div class="executed-quantity">
            <span>已入库</span>
            <strong :class="{ 'zero-quantity': Number(row.quantities.inboundQuantity) === 0 }">{{
              row.quantities.inboundQuantity
            }}</strong>
          </div>
          <div class="executed-quantity">
            <span
              :class="{
                'returned-label':
                  receiptReturnQuantityClass(row.quantities.returnedQuantity) === 'quantity-return',
              }"
              >已退回</span
            >
            <strong :class="receiptReturnQuantityClass(row.quantities.returnedQuantity)">{{
              row.quantities.returnedQuantity
            }}</strong>
          </div>
        </td>
        <td>
          <div class="remaining-quantity">
            <span v-if="isReceiptVoided(row)">—</span>
            <template v-else>
              <strong
                :class="{ 'zero-quantity': Number(row.quantities.unprocessedQuantity) === 0 }"
                >{{ row.quantities.unprocessedQuantity }}</strong
              >
              <span
                class="unit"
                :class="{ 'zero-quantity': Number(row.quantities.unprocessedQuantity) === 0 }"
                >{{ row.unit }}</span
              >
            </template>
          </div>
          <div
            v-if="!isReceiptVoided(row)"
            class="pending-quantities"
          >
            <span
              v-if="Number(row.quantities.pendingInboundQuantity) > 0"
              class="pending-inbound"
              >待入库 <strong>{{ row.quantities.pendingInboundQuantity }}</strong></span
            >
            <span
              v-if="Number(row.quantities.pendingReturnQuantity) > 0"
              class="pending-return"
              >待退回 <strong>{{ row.quantities.pendingReturnQuantity }}</strong></span
            >
            <span
              v-if="
                row.currentRound.status === 'finalized' &&
                Number(row.quantities.undeterminedQuantity) > 0
              "
              class="pending-review"
              >待处理 <strong>{{ row.quantities.undeterminedQuantity }}</strong></span
            >
          </div>
        </td>
        <td>
          <el-tag
            size="small"
            :type="receiptLineStageType(row)"
            :effect="receiptLineStageEffect(row)"
            >{{ receiptLineStageLabel(row) }}</el-tag
          >
        </td>
        <td class="actions-cell">
          <div class="line-actions">
            <el-button
              v-if="hasInbound(row)"
              link
              type="primary"
              @click="emit('inbound', row.id)"
              >入库</el-button
            >
            <el-button
              v-if="hasReturn(row)"
              link
              type="primary"
              @click="emit('detail', row.receiptId, row.id, 'allocations')"
              >退回</el-button
            >
            <el-button
              v-if="hasAcceptancePrimary(row)"
              link
              type="primary"
              @click="emit('detail', row.receiptId, row.id, 'acceptance')"
              >{{ row.currentRound.status === 'finalized' ? '更正分配' : '核对定稿' }}</el-button
            >
            <el-button
              v-if="hasQualityPrimary(row)"
              link
              type="primary"
              @click="emit('quality', row.id)"
              >{{ row.currentRound.status === 'reviewing' ? '继续检验' : '去质检' }}</el-button
            >
            <el-button
              link
              type="primary"
              @click="emit('detail', row.receiptId, row.id, 'history')"
              >历史</el-button
            >
            <el-button
              link
              type="primary"
              @click="emit('detail', row.receiptId, row.id)"
              >详情</el-button
            >
          </div>
        </td>
      </template>
    </ReceiptWorklistReceiptGroup>
    <div
      v-if="expanded && (!state?.loaded || state.loading || state.error)"
      v-loading="state?.loading"
      class="receipt-feedback"
    >
      <template v-if="!state?.loading">
        <InlineHint :tone="state?.error ? 'danger' : 'info'">{{
          state?.error || '尚未读取本单明细，请重新读取。'
        }}</InlineHint>
        <el-button
          link
          type="primary"
          @click="emit('retry')"
          >重新读取明细</el-button
        >
      </template>
      <span v-else>正在读取本单完整到货明细…</span>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight } from '@element-plus/icons-vue';
import ReceiptWorklistReceiptGroup from './ReceiptWorklistReceiptGroup.vue';
import InlineHint from '../../../components/InlineHint.vue';
import type { PurchaseReceiptState } from '../composables/usePurchaseReceiptOrders';
import type { ProcurementReceiptItem, ProcurementReceiptLineListItem } from '@company/contracts';
import { PERMISSIONS } from '@company/constants';
import { useAuthStore } from '../../../stores/auth';
import { formatDateTimeForDisplay } from '../../../utils/date';
import {
  canAcceptReceipt,
  canReviewReceipt,
  isReceiptVoided,
  receiptLineStageLabel,
  receiptLineStageType,
  receiptLineStageEffect,
  receiptReturnQuantityClass,
  type ReceiptDetailIntent,
} from '../receipt-round-presentation';

defineOptions({ name: 'ReceiptLinesTable' });
const props = defineProps<{
  receipt: ProcurementReceiptItem;
  state?: PurchaseReceiptState;
  expanded: boolean;
  highlightedLineId?: string;
  focused?: boolean;
}>();
const header = computed(() => (props.state?.loaded ? props.state.receipt : props.receipt));
const emit = defineEmits<{
  detail: [receiptId: string, lineId?: string, intent?: ReceiptDetailIntent];
  quality: [lineId: string];
  inbound: [lineId: string];
  toggle: [];
  retry: [];
}>();
const auth = useAuthStore();
const hasInbound = (row: ProcurementReceiptLineListItem): boolean =>
  !isReceiptVoided(row) &&
  auth.can(PERMISSIONS.warehouse.inbound.view) &&
  row.currentRound.status === 'finalized' &&
  Number(row.quantities.pendingInboundQuantity) > 0;
const hasReturn = (row: ProcurementReceiptLineListItem): boolean =>
  !isReceiptVoided(row) &&
  row.currentRound.status === 'finalized' &&
  Number(row.quantities.pendingReturnQuantity) > 0;
const hasAcceptancePrimary = (row: ProcurementReceiptLineListItem): boolean =>
  canAcceptReceipt(row) &&
  (row.currentRound.status === 'awaiting_acceptance' ||
    (row.currentRound.status === 'finalized' && Number(row.quantities.undeterminedQuantity) > 0));
const canVisitQuality = (row: ProcurementReceiptLineListItem): boolean =>
  !isReceiptVoided(row) &&
  auth.can(PERMISSIONS.quality.inboundInspections.view) &&
  Number(row.quantities.unprocessedQuantity) > 0 &&
  (row.currentRound.status === 'reviewing' || canReviewReceipt(row));
const hasQualityPrimary = (row: ProcurementReceiptLineListItem): boolean =>
  !hasInbound(row) && !hasReturn(row) && !hasAcceptancePrimary(row) && canVisitQuality(row);
</script>

<style scoped>
.purchase-receipt {
  position: relative;
  min-width: 0;
}
.purchase-receipt::before {
  position: absolute;
  top: 25px;
  left: -17px;
  width: 16px;
  border-top: 1px solid var(--el-border-color);
  content: '';
}
.purchase-receipt + .purchase-receipt {
  margin-top: 12px;
}
.purchase-receipt :deep(.receipt-group) {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
.purchase-receipt :deep(.receipt-heading) {
  gap: 6px 12px;
  padding: 10px 12px;
  background: var(--el-bg-color);
}
.purchase-receipt :deep(.receipt-table-scroll) {
  border-top: 1px solid var(--el-border-color-lighter);
}
.receipt-disclosure {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 28px;
  margin-left: -4px;
  padding: 3px 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.receipt-disclosure:hover {
  background: var(--el-fill-color-light);
}
.receipt-disclosure:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.receipt-disclosure strong {
  font-size: 14px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.receipt-fold-icon {
  flex-shrink: 0;
  color: var(--el-text-color-regular);
  font-size: 14px;
}
.receipt-fold-icon.is-expanded {
  transform: rotate(90deg);
}
.fold-action {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.receipt-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.receipt-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.receipt-feedback {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 70px;
  padding: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.group-meta,
.secondary,
.unit,
.executed-quantity span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.secondary {
  margin-top: 4px;
  overflow-wrap: anywhere;
}
.executed-quantity,
.remaining-quantity {
  display: flex;
  align-items: baseline;
  gap: 5px;
}
.quantity-cell {
  text-align: right !important;
}
.executed-quantity strong,
.remaining-quantity strong {
  font-variant-numeric: tabular-nums;
}
.zero-quantity,
.quantity-zero {
  color: var(--el-text-color-placeholder);
  font-weight: 400;
}
.quantity-return {
  color: var(--el-color-warning-dark-2);
  font-weight: 700;
}
.executed-quantity .returned-label {
  color: var(--el-color-warning-dark-2);
}
.quantity-cell .unit,
.remaining-quantity .unit {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.quantity-cell .unit {
  margin-left: 4px;
}
.quantity-cell .unit.zero-quantity,
.remaining-quantity .unit.zero-quantity {
  color: var(--el-text-color-placeholder);
  font-weight: 400;
}
.pending-quantities {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 9px;
  margin-top: 4px;
  font-size: 12px;
}
.pending-quantities strong {
  font-weight: 700;
}
.pending-inbound {
  color: var(--el-text-color-regular);
}
.pending-inbound strong {
  color: var(--el-text-color-primary);
}
.pending-return,
.pending-review {
  color: var(--el-color-warning-dark-2);
}
.actions-cell {
  position: sticky;
  right: 0;
  z-index: 1;
  background: var(--el-bg-color);
  box-shadow: -1px 0 0 var(--el-border-color-lighter);
}
th.actions-cell {
  z-index: 2;
  background: var(--el-fill-color-light);
}
.line-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.line-actions :deep(.el-button) {
  margin: 0;
}
</style>
