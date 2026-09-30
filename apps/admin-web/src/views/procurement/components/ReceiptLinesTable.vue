<template>
  <div
    v-loading="loading"
    class="receipt-lines-scroll"
  >
    <table
      v-if="groups.length"
      class="receipt-lines-table"
    >
      <caption class="visually-hidden">
        当前查询页的采购到货物料明细
      </caption>
      <colgroup>
        <col class="material-column" />
        <col class="supplier-column" />
        <col class="received-column" />
        <col class="executed-column" />
        <col class="remaining-column" />
        <col class="stage-column" />
        <col class="action-column" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">物料 / 版本</th>
          <th scope="col">供应商 / 批号</th>
          <th
            scope="col"
            class="quantity-cell"
          >
            核实量
          </th>
          <th scope="col">已入 / 已退</th>
          <th scope="col">剩余 / 待办</th>
          <th scope="col">当前阶段</th>
          <th
            scope="col"
            class="actions-cell"
          >
            操作
          </th>
        </tr>
      </thead>
      <tbody
        v-for="group in groups"
        :key="group.receiptId"
      >
        <tr class="group-row">
          <th
            colspan="7"
            scope="rowgroup"
          >
            <span class="group-heading">
              <strong class="receipt-number">到货 {{ group.receiptNo }}</strong>
              <span class="group-meta">采购 {{ group.purchaseNo }}</span>
              <span class="group-meta">到货 {{ formatDateTimeForDisplay(group.receivedAt) }}</span>
              <el-button
                link
                type="primary"
                @click="emit('detail', group.receiptId)"
                >查看到货单</el-button
              >
            </span>
          </th>
        </tr>
        <tr
          v-for="row in group.lines"
          :key="row.id"
          class="line-row"
        >
          <td>
            <strong
              class="material-name"
              :title="row.itemName"
              >{{ row.itemName }}</strong
            >
            <div class="source-line">到货 {{ row.receiptNo }} · 第 {{ row.lineNo }} 行</div>
            <div class="source-id">到货明细 ID：{{ row.id }}</div>
            <div
              class="secondary"
              :title="`${row.itemCode} · ${row.materialVariantCode}`"
            >
              {{ row.itemCode }} · {{ row.materialVariantCode }}
            </div>
          </td>
          <td>
            <div
              class="supplier-name"
              :title="row.supplierName"
            >
              {{ row.supplierName }}
            </div>
            <div
              class="secondary"
              :title="row.supplierBatchCode ?? '未填写'"
            >
              批号 {{ row.supplierBatchCode || '未填写' }}
            </div>
          </td>
          <td class="quantity-cell">
            <strong :class="{ 'zero-quantity': Number(row.quantities.receivedQuantity) === 0 }">{{
              row.quantities.receivedQuantity
            }}</strong>
            <span
              class="unit"
              :class="{ 'zero-quantity': Number(row.quantities.receivedQuantity) === 0 }"
              >{{ row.unit }}</span
            >
          </td>
          <td>
            <div class="executed-quantity">
              <span>已入</span>
              <strong :class="{ 'zero-quantity': Number(row.quantities.inboundQuantity) === 0 }">{{
                row.quantities.inboundQuantity
              }}</strong>
            </div>
            <div class="executed-quantity">
              <span>已退</span>
              <strong :class="{ 'zero-quantity': Number(row.quantities.returnedQuantity) === 0 }">{{
                row.quantities.returnedQuantity
              }}</strong>
            </div>
          </td>
          <td>
            <div class="remaining-quantity">
              <strong
                :class="{ 'zero-quantity': Number(row.quantities.unprocessedQuantity) === 0 }"
                >{{ row.quantities.unprocessedQuantity }}</strong
              >
              <span
                class="unit"
                :class="{ 'zero-quantity': Number(row.quantities.unprocessedQuantity) === 0 }"
                >{{ row.unit }}</span
              >
            </div>
            <div class="pending-quantities">
              <span
                v-if="Number(row.quantities.pendingInboundQuantity) > 0"
                class="pending-inbound"
                >待入 <strong>{{ row.quantities.pendingInboundQuantity }}</strong></span
              >
              <span
                v-if="Number(row.quantities.pendingReturnQuantity) > 0"
                class="pending-return"
                >待退 <strong>{{ row.quantities.pendingReturnQuantity }}</strong></span
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
        </tr>
      </tbody>
    </table>
    <el-empty
      v-else
      :description="
        awaitingAcceptance
          ? '当前筛选下没有待核对定稿的到货明细'
          : '当前筛选下没有到货明细，可登记实际到货或调整查询'
      "
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ProcurementReceiptLineListItem } from '@company/contracts';
import { PERMISSIONS } from '@company/constants';
import { useAuthStore } from '../../../stores/auth';
import { formatDateTimeForDisplay } from '../../../utils/date';
import {
  canAcceptReceipt,
  canReviewReceipt,
  receiptLineStageLabel,
  receiptLineStageType,
  receiptLineStageEffect,
  type ReceiptDetailIntent,
} from '../receipt-round-presentation';

defineOptions({ name: 'ReceiptLinesTable' });
const props = defineProps<{
  rows: ProcurementReceiptLineListItem[];
  loading: boolean;
  awaitingAcceptance: boolean;
}>();
const emit = defineEmits<{
  detail: [receiptId: string, lineId?: string, intent?: ReceiptDetailIntent];
  quality: [lineId: string];
  inbound: [lineId: string];
}>();
const auth = useAuthStore();
interface ReceiptPageGroup {
  receiptId: string;
  receiptNo: string;
  purchaseNo: string;
  receivedAt: string;
  lines: ProcurementReceiptLineListItem[];
}
const groups = computed<ReceiptPageGroup[]>(() => {
  const byReceipt = new Map<string, ReceiptPageGroup>();
  for (const row of props.rows) {
    let group = byReceipt.get(row.receiptId);
    if (!group) {
      group = {
        receiptId: row.receiptId,
        receiptNo: row.receiptNo,
        purchaseNo: row.purchaseNo,
        receivedAt: row.receivedAt,
        lines: [],
      };
      byReceipt.set(row.receiptId, group);
    }
    group.lines.push(row);
  }
  return [...byReceipt.values()];
});
const hasInbound = (row: ProcurementReceiptLineListItem): boolean =>
  auth.can(PERMISSIONS.production.inbounds.view) &&
  row.currentRound.status === 'finalized' &&
  Number(row.quantities.pendingInboundQuantity) > 0;
const hasReturn = (row: ProcurementReceiptLineListItem): boolean =>
  row.currentRound.status === 'finalized' && Number(row.quantities.pendingReturnQuantity) > 0;
const hasAcceptancePrimary = (row: ProcurementReceiptLineListItem): boolean =>
  canAcceptReceipt(row) &&
  (row.currentRound.status === 'awaiting_acceptance' ||
    (row.currentRound.status === 'finalized' && Number(row.quantities.undeterminedQuantity) > 0));
const canVisitQuality = (row: ProcurementReceiptLineListItem): boolean =>
  auth.can(PERMISSIONS.quality.inboundInspections.view) &&
  Number(row.quantities.unprocessedQuantity) > 0 &&
  (row.currentRound.status === 'reviewing' || canReviewReceipt(row));
const hasQualityPrimary = (row: ProcurementReceiptLineListItem): boolean =>
  !hasInbound(row) && !hasReturn(row) && !hasAcceptancePrimary(row) && canVisitQuality(row);
</script>

<style scoped>
.receipt-lines-scroll {
  min-height: 160px;
  overflow-x: auto;
}
.receipt-lines-table {
  width: 100%;
  min-width: 1080px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.material-column {
  width: 18%;
}
.supplier-column {
  width: 15%;
}
.received-column {
  width: 9%;
}
.executed-column {
  width: 12%;
}
.remaining-column {
  width: 13%;
}
.stage-column {
  width: 11%;
}
.action-column {
  width: 22%;
}
.receipt-lines-table th,
.receipt-lines-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  text-align: left;
  vertical-align: middle;
}
.receipt-lines-table thead th {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-weight: 600;
}
.receipt-lines-table tbody .line-row:hover td {
  background: var(--el-fill-color);
}
.group-row th {
  padding-top: 8px;
  padding-bottom: 8px;
  background: var(--el-fill-color-light);
  font-weight: 400;
}
.group-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 20px;
}
.receipt-number {
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.group-meta {
  color: var(--el-text-color-regular);
  font-size: 12px;
}
.executed-quantity,
.remaining-quantity {
  display: flex;
  align-items: baseline;
  gap: 5px;
}
.material-name {
  display: block;
  color: var(--el-text-color-primary);
  font-weight: 600;
  overflow-wrap: anywhere;
}
.source-line,
.source-id,
.secondary,
.unit,
.executed-quantity span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.secondary {
  overflow: hidden;
  margin-top: 4px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.source-line {
  margin-top: 4px;
}
.source-id {
  overflow-wrap: anywhere;
  font-size: 12px;
}
.supplier-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.quantity-cell {
  text-align: right !important;
}
.executed-quantity strong,
.remaining-quantity strong {
  font-variant-numeric: tabular-nums;
}
.zero-quantity {
  color: var(--el-text-color-placeholder);
  font-weight: 400;
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
.receipt-lines-table thead .actions-cell {
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
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
</style>
