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
        <div class="receipt-actions">
          <el-button
            link
            type="primary"
            @click="emit('associate', receipt)"
            >调整归属</el-button
          >
        </div>
      </template>
      <template #column-widths>
        <col style="width: 110px" />
        <col style="width: 175px" />
        <col style="width: 200px" />
        <col style="width: 145px" />
      </template>
      <template #column-headings>
        <th scope="col">剩余实物</th>
        <th scope="col">当前阶段</th>
        <th scope="col">检验记录 / 结论</th>
        <th scope="col">下一步</th>
      </template>
      <template #row="{ row: line }">
        <td>{{ Number(line.quantities.unprocessedQuantity) }} {{ line.unit }}</td>
        <td>
          <el-tag
            size="small"
            :type="receiptLineStageType(line)"
            :effect="receiptLineStageEffect(line)"
          >
            {{ receiptLineStageLabel(line) }}
          </el-tag>
          <span class="round-reference">当前处理第 {{ line.currentRound.roundNo }} 轮</span>
        </td>
        <td>
          <div class="inspection-result">
            <template v-if="line.currentCase?.inspection">
              <el-button
                class="inspection-id-link"
                link
                type="primary"
                @click="emit('open', line.receiptLineId, line.currentCase.id)"
                >检验记录 ID {{ line.currentCase.inspection.id }}</el-button
              >
              <span>{{
                QUALITY_RELEASE_DECISION_LABELS[line.currentCase.inspection.releaseDecision]
              }}</span>
              <span class="reference-note">
                {{ line.isInherited ? '当前采用 · 沿用此前检验' : '当前采用' }}
                <template v-if="line.isInherited && line.currentCaseRoundNo !== null">
                  · 来源第 {{ line.currentCaseRoundNo }} 轮</template
                >
              </span>
            </template>
            <span
              v-else
              class="muted"
              >{{
                line.currentCase?.status === 'reviewing'
                  ? '本轮正在检查，尚无检验记录'
                  : '本轮尚无检验记录'
              }}</span
            >
          </div>
        </td>
        <td>
          <el-button
            link
            type="primary"
            @click="emit('open', line.receiptLineId)"
            >{{ lineAction(line) }}</el-button
          >
        </td>
      </template>
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
import type {
  ProcurementInboundInspectionLineItem,
  QualityIncomingInspectionReceiptItem,
} from '@company/contracts';
import { QUALITY_RELEASE_DECISION_LABELS } from '@company/constants';
import DisclosureToggle from '../../../components/DisclosureToggle.vue';
import InlineHint from '../../../components/InlineHint.vue';
import ReceiptWorklistReceiptGroup from '../../procurement/components/ReceiptWorklistReceiptGroup.vue';
import {
  receiptLineStageLabel,
  receiptLineStageType,
  receiptLineStageEffect,
} from '../../procurement/receipt-round-presentation';
import type { IncomingInspectionReceiptState } from '../composables/useIncomingInspectionOrders';

defineOptions({ name: 'IncomingInspectionReceipt' });
defineProps<{
  receipt: QualityIncomingInspectionReceiptItem;
  state?: IncomingInspectionReceiptState | null;
  expanded: boolean;
  highlightedLineId?: string;
}>();
const emit = defineEmits<{
  toggle: [];
  retry: [];
  associate: [receipt: QualityIncomingInspectionReceiptItem];
  open: [receiptLineId: string, caseId?: string];
}>();
function lineAction(item: ProcurementInboundInspectionLineItem): string {
  if (item.stage === 'uninspected' || item.stage === 'reinspection_required')
    return '查看 / 核对待检';
  if (item.stage === 'reviewing') return '查看 / 填写结果';
  return '查看详情';
}
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
.incoming-receipt::before {
  position: absolute;
  top: 25px;
  left: -17px;
  width: 16px;
  border-top: 1px solid var(--el-border-color);
  content: '';
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
