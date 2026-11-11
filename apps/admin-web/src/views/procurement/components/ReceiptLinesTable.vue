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
      <template #receipt-title
        ><DisclosureToggle
          :expanded="expanded"
          :label="`到货单 ${header.receiptNo}`"
          @toggle="emit('toggle')"
        /><span
          >到货单 <strong>{{ header.receiptNo }}</strong></span
        ></template
      >
      <template #receipt-meta
        ><el-tag
          v-if="focused"
          size="small"
          effect="plain"
          >当前定位</el-tag
        ><span class="receipt-source"
          >采购单 <strong>{{ header.purchaseNo }}</strong></span
        ><span class="secondary">到货 {{ formatDateTimeForDisplay(header.receivedAt) }}</span>
        <div class="receipt-actions">
          <el-button
            link
            type="primary"
            @click="emit('detail', header.id)"
            >查看到货单</el-button
          ><el-button
            v-if="!header.void"
            link
            type="danger"
            @click="emit('detail', header.id, undefined, 'void')"
            >作废整单</el-button
          >
        </div></template
      >
      <template #material-detail="{ row }"
        ><div class="secondary">来料批次 {{ row.supplierBatchCode || '未填写' }}</div></template
      >
      <template #column-widths
        ><col style="width: 130px" />
        <col style="width: 240px" />
        <col style="width: 125px" />
        <col style="width: 235px"
      /></template>
      <template #column-headings
        ><th scope="col">累计已入库</th>
        <th scope="col">最近其他处理说明</th>
        <th scope="col">仓库办理</th>
        <th
          scope="col"
          class="actions-cell"
        >
          操作
        </th></template
      >
      <template #row="{ row }"
        ><td>
          <strong>{{ Number(row.quantities.inboundQuantity) }}</strong> {{ row.unit }}
        </td>
        <td class="handling-note">{{ row.otherHandlingNote || '—' }}</td>
        <td>
          <el-tag
            size="small"
            :type="receiptLineStageType(row)"
            effect="plain"
            >{{ receiptLineStageLabel(row) }}</el-tag
          >
        </td>
        <td class="actions-cell">
          <div class="line-actions">
            <el-button
              v-if="!isReceiptVoided(row) && auth.can(PERMISSIONS.warehouse.inbound.view)"
              link
              type="primary"
              @click="emit('inbound', row.id)"
              >入库</el-button
            ><el-button
              v-if="!isReceiptVoided(row)"
              link
              type="primary"
              @click="emit('detail', row.receiptId, row.id, 'handling')"
              >其他处理</el-button
            ><el-button
              v-if="auth.can(PERMISSIONS.quality.inboundInspections.view)"
              link
              type="primary"
              @click="emit('quality', row.id)"
              >检验报告</el-button
            ><el-button
              link
              type="primary"
              @click="emit('detail', row.receiptId, row.id)"
              >详情</el-button
            >
          </div>
        </td></template
      >
    </ReceiptWorklistReceiptGroup>
    <div
      v-if="expanded && (!state?.loaded || state.loading || state.error)"
      v-loading="state?.loading"
      class="receipt-feedback"
    >
      <template v-if="!state?.loading"
        ><InlineHint :tone="state?.error ? 'danger' : 'info'">{{
          state?.error || '尚未读取本单明细，请重新读取。'
        }}</InlineHint
        ><el-button
          link
          type="primary"
          @click="emit('retry')"
          >重新读取明细</el-button
        ></template
      ><span v-else>正在读取完整到货明细…</span>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { ProcurementReceiptItem } from '@company/contracts';
import { PERMISSIONS } from '@company/constants';
import DisclosureToggle from '../../../components/DisclosureToggle.vue';
import InlineHint from '../../../components/InlineHint.vue';
import { useAuthStore } from '../../../stores/auth';
import { formatDateTimeForDisplay } from '../../../utils/date';
import type { PurchaseReceiptState } from '../composables/usePurchaseReceipts';
import {
  isReceiptVoided,
  receiptLineStageLabel,
  receiptLineStageType,
  type ReceiptDetailIntent,
} from '../receipt-presentation';
import ReceiptWorklistReceiptGroup from './ReceiptWorklistReceiptGroup.vue';
defineOptions({ name: 'ReceiptLinesTable' });
const props = defineProps<{
  receipt: ProcurementReceiptItem;
  state?: PurchaseReceiptState;
  expanded: boolean;
  highlightedLineId?: string;
  focused?: boolean;
}>();
const emit = defineEmits<{
  detail: [receiptId: string, lineId?: string, intent?: ReceiptDetailIntent];
  quality: [lineId: string];
  inbound: [lineId: string];
  toggle: [];
  retry: [];
}>();
const auth = useAuthStore();
const header = computed(() => (props.state?.loaded ? props.state.receipt : props.receipt));
</script>
<style scoped>
.purchase-receipt {
  position: relative;
  min-width: 0;
}
.purchase-receipt + .purchase-receipt {
  margin-top: 12px;
}
.purchase-receipt :deep(.receipt-group) {
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
.purchase-receipt :deep(.receipt-heading) {
  padding: 10px 12px;
  background: var(--el-bg-color);
}
.purchase-receipt :deep(.receipt-table-scroll) {
  border-top: 1px solid var(--el-border-color-lighter);
}
.receipt-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.receipt-feedback {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 70px;
  padding: 12px;
}
.receipt-source {
  overflow-wrap: anywhere;
}
.secondary {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.handling-note {
  white-space: pre-wrap;
}
.actions-cell {
  position: sticky;
  right: 0;
  background: var(--el-bg-color);
}
.line-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.line-actions :deep(.el-button) {
  margin: 0;
}
</style>
