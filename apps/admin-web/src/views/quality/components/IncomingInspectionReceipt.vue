<template>
  <div
    class="incoming-receipt"
    :class="{ 'has-feedback': expanded && (state?.loading || state?.error) }"
    :data-receipt-id="receipt.receiptId"
  >
    <ReceiptWorklistReceiptGroup
      :receipt="{
        receiptNo: receipt.receiptNo,
        supplierName: receipt.supplierName,
        lines: state?.items ?? [],
      }"
      :row-id="(row) => row.receiptLineId"
      :highlighted-line-id="highlightedLineId"
      :line-count="receipt.lineCount"
      :void-record="receipt.void"
      :show-lines="expanded && Boolean(state?.loaded) && !state?.error"
    >
      <template #receipt-title>
        <span class="receipt-title-group">
          <DisclosureToggle
            :expanded="expanded"
            :label="`到货单 ${receipt.receiptNo}的物料`"
            @toggle="emit('toggle')"
          />
          <span class="receipt-title"
            >到货单 <strong class="receipt-number">{{ receipt.receiptNo }}</strong></span
          >
        </span>
      </template>
      <template #receipt-meta>
        <div class="receipt-source-meta">
          <span class="source-meta"
            >采购单 <strong class="identity-value">{{ receipt.purchaseNo }}</strong></span
          >
        </div>
        <div
          v-if="allowAssociation"
          class="receipt-actions"
        >
          <el-button
            link
            type="primary"
            @click="emit('associate', receipt)"
            >调整归属</el-button
          >
        </div>
      </template>
      <template #column-widths
        ><col style="width: 120px" />
        <col style="width: 235px" />
        <col style="width: 180px" />
        <col style="width: 160px"
      /></template>
      <template #column-headings
        ><th
          scope="col"
          title="包含登记和修订历史，不代表检查次数"
        >
          报告记录
        </th>
        <th scope="col">当前报告</th>
        <th scope="col">合格 / 不合格</th>
        <th scope="col">操作</th></template
      >
      <template #row="{ row: line }"
        ><td>{{ line.reportCount }} 条</td>
        <td>
          <el-button
            v-if="line.latestReport"
            link
            type="primary"
            class="inspection-id-link"
            @click="emit('open', line.receiptLineId, line.latestReport.id)"
            >{{ line.latestReport.reportNo }}</el-button
          ><span
            v-else
            class="muted"
            >尚未填写报告</span
          >
          <div
            v-if="line.latestReport"
            class="reference-note"
          >
            {{ formatDateTimeForDisplay(line.latestReport.inspectedAt) }} ·
            {{ QUALITY_INSPECTION_METHOD_LABELS[line.latestReport.inspectionMethod] }}
          </div>
        </td>
        <td>
          <template v-if="line.latestReport"
            >{{ Number(line.latestReport.qualifiedQuantity) }} /
            {{ Number(line.latestReport.unqualifiedQuantity) }} {{ line.unit }}</template
          ><span v-else>—</span>
        </td>
        <td>
          <el-button
            link
            type="primary"
            @click="emit('open', line.receiptLineId)"
            >{{ inspectionReportActionLabel(line) }}</el-button
          >
        </td></template
      >
    </ReceiptWorklistReceiptGroup>
    <div
      v-if="expanded && (state?.loading || state?.error)"
      v-loading="state?.loading"
      class="receipt-feedback"
    >
      <template v-if="state?.error">
        <InlineHint tone="danger">{{ state.error }}</InlineHint>
        <el-button
          link
          type="primary"
          @click="emit('retry')"
          >重新读取物料</el-button
        >
      </template>
      <span v-else>正在读取本单物料…</span>
    </div>
  </div>
</template>
<script setup lang="ts">
import type { QualityIncomingInspectionReceiptItem } from '@company/contracts';
import { QUALITY_INSPECTION_METHOD_LABELS } from '@company/constants';
import DisclosureToggle from '../../../components/DisclosureToggle.vue';
import InlineHint from '../../../components/InlineHint.vue';
import ReceiptWorklistReceiptGroup from '../../procurement/components/ReceiptWorklistReceiptGroup.vue';
import { formatDateTimeForDisplay } from '../../../utils/date';
import type { IncomingInspectionReceiptState } from '../composables/useIncomingInspectionReceipts';
import { inspectionReportActionLabel } from '../incoming-inspection-presentation';

defineOptions({ name: 'IncomingInspectionReceipt' });
defineProps<{
  receipt: QualityIncomingInspectionReceiptItem;
  state?: IncomingInspectionReceiptState | null;
  expanded: boolean;
  highlightedLineId?: string;
  /** @deprecated 仅停用的旧分组目录使用；现行来料入口不提供归属调整。 */
  allowAssociation?: boolean;
}>();
const emit = defineEmits<{
  toggle: [];
  retry: [];
  associate: [receipt: QualityIncomingInspectionReceiptItem];
  open: [receiptLineId: string, reportId?: string];
}>();
</script>
<style scoped>
.identity-value {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.incoming-receipt {
  position: relative;
  min-width: 0;
}
.incoming-receipt + .incoming-receipt {
  margin-top: 12px;
}
.incoming-receipt :deep(.receipt-group) {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
.incoming-receipt :deep(.receipt-heading) {
  gap: 6px 12px;
  padding: 10px 12px;
  background: var(--el-bg-color);
}
.incoming-receipt :deep(.receipt-table-scroll) {
  border-top: 1px solid var(--el-border-color-lighter);
}
.has-feedback :deep(.receipt-group) {
  border-bottom-right-radius: 0;
  border-bottom-left-radius: 0;
}
.receipt-title-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.receipt-title {
  font-weight: 400;
  overflow-wrap: anywhere;
}
.receipt-number {
  font-weight: 600;
}
.receipt-source-meta {
  display: flex;
  flex: 1 1 240px;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 16px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.receipt-actions {
  margin-left: auto;
}
.source-meta,
.round-reference,
.reference-note {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.round-reference {
  display: block;
  margin-top: 5px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.inspection-result {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}
.inspection-id-link {
  height: auto;
  padding: 0;
  font-weight: 600;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
}
.receipt-feedback {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 70px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-top: 0;
  border-radius: 0 0 6px 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
