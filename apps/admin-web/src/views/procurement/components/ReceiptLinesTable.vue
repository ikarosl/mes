<template>
  <ReceiptWorklist
    ref="worklist"
    :rows="rows"
    :row-id="(row) => row.id"
    :loading="loading"
    :empty-text="
      awaitingAcceptance
        ? '当前筛选下没有待核对定稿的到货明细'
        : '当前筛选下没有到货明细，可登记实际到货或调整查询'
    "
    @refresh="emit('refresh')"
  >
    <template #actions><slot name="actions" /></template>
    <template #receipt-meta="{ receipt }">
      <span class="group-meta"
        >到货 {{ formatDateTimeForDisplay(receipt.lines[0].receivedAt) }}</span
      >
      <el-button
        link
        type="primary"
        @click="emit('detail', receipt.receiptId)"
        >查看到货单</el-button
      >
      <el-button
        v-if="!receipt.lines[0].void"
        link
        type="danger"
        @click="emit('detail', receipt.receiptId, undefined, 'void')"
        >作废整单</el-button
      >
    </template>
    <template #supplier-detail="{ row }"
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
  </ReceiptWorklist>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import ReceiptWorklist from './ReceiptWorklist.vue';
import type { ReceiptWorklistHandle } from '../receipt-worklist';
import type { ProcurementReceiptLineListItem } from '@company/contracts';
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
defineProps<{
  rows: ProcurementReceiptLineListItem[];
  loading: boolean;
  awaitingAcceptance: boolean;
}>();
const emit = defineEmits<{
  detail: [receiptId: string, lineId?: string, intent?: ReceiptDetailIntent];
  quality: [lineId: string];
  inbound: [lineId: string];
  refresh: [];
}>();
const auth = useAuthStore();
const worklist = ref<ReceiptWorklistHandle>();
defineExpose<Pick<ReceiptWorklistHandle, 'expandPage'>>({
  expandPage: () => worklist.value?.expandPage(),
});
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
