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
      <template #column-widths
        ><col style="width: 130px" />
        <col style="width: 130px" />
        <col style="width: 150px" />
        <col style="width: 240px" />
        <col style="width: 165px"
      /></template>
      <template #column-headings
        ><th scope="col">计划采购量</th>
        <th scope="col">累计已入库</th>
        <th
          scope="col"
          title="记录数包含登记和修订历史，不代表检查次数"
        >
          检验报告
        </th>
        <th scope="col">最近其他处理说明</th>
        <th
          scope="col"
          class="actions-cell"
        >
          操作
        </th></template
      >
      <template #row="{ row }"
        ><td>{{ Number(row.plannedQuantity) }} {{ row.unit }}</td>
        <td>
          <strong>{{ Number(row.quantities.inboundQuantity) }}</strong> {{ row.unit }}
        </td>
        <td>
          <span
            v-if="!canViewQuality"
            class="secondary"
            >无查看权限</span
          >
          <span
            v-else-if="qualityLoading"
            class="secondary"
            >读取中…</span
          >
          <span
            v-else-if="qualityError"
            class="secondary"
            >读取失败</span
          >
          <template v-else-if="qualityLines[row.id]">
            <span v-if="qualityLines[row.id].reportCount">
              已登记 · {{ qualityLines[row.id].reportCount }} 条记录
            </span>
            <span
              v-else
              class="secondary"
              >暂无检验报告</span
            >
          </template>
          <span
            v-else
            class="secondary"
            >尚未读取</span
          >
        </td>
        <td class="handling-note">{{ row.otherHandlingNote || '—' }}</td>
        <td class="actions-cell">
          <div class="line-actions">
            <el-button
              v-if="!isReceiptVoided(row)"
              link
              type="primary"
              @click="emit('detail', row.receiptId, row.id, 'handling')"
              >登记说明</el-button
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
      v-if="
        expanded &&
        canViewQuality &&
        state?.loaded &&
        !state.error &&
        !qualityLoading &&
        (qualityError || !qualityLoaded)
      "
      class="receipt-feedback"
    >
      <InlineHint :tone="qualityError ? 'danger' : 'info'">
        {{ qualityError || '检验摘要尚未读取，不影响查看入库和其他处理说明。' }}
      </InlineHint>
      <el-button
        link
        type="primary"
        @click="loadQuality"
        >重新读取检验摘要</el-button
      >
    </div>
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
import { computed, ref, watch } from 'vue';
import type { ProcurementReceiptItem, QualityIncomingInspectionLineItem } from '@company/contracts';
import { incomingInspectionReceiptsApi } from '../../../api/incoming-inspection-receipts';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import DisclosureToggle from '../../../components/DisclosureToggle.vue';
import InlineHint from '../../../components/InlineHint.vue';
import { formatDateTimeForDisplay } from '../../../utils/date';
import type { PurchaseReceiptState } from '../composables/usePurchaseReceipts';
import { isReceiptVoided, type ReceiptDetailIntent } from '../receipt-presentation';
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
  toggle: [];
  retry: [];
}>();
const header = computed(() => (props.state?.loaded ? props.state.receipt : props.receipt));
const { canAccessRoute } = useRouteAccess();
const canViewQuality = computed(() => canAccessRoute({ name: 'quality-inbound-inspections' }));
const qualityLines = ref<Record<string, QualityIncomingInspectionLineItem>>({});
const qualityLoading = ref(false),
  qualityLoaded = ref(false),
  qualityError = ref('');
const qualityRead = useLatestReadRequest(() => {
  qualityLoading.value = false;
});
async function loadQuality(): Promise<void> {
  if (
    !props.expanded ||
    !props.state?.loaded ||
    props.state.error ||
    !canViewQuality.value ||
    !qualityRead.isActive()
  )
    return;
  const receiptId = props.receipt.id;
  const items = props.state.items;
  const current = qualityRead.begin(
    () =>
      props.expanded &&
      props.receipt.id === receiptId &&
      props.state?.items === items &&
      canViewQuality.value,
  );
  qualityLoading.value = true;
  try {
    const result = await incomingInspectionReceiptsApi.lines(receiptId, current.signal);
    if (!current.isCurrent()) return;
    const expected = new Set(items.map((line) => line.id));
    if (
      result.receipt.receiptId !== receiptId ||
      result.items.length !== expected.size ||
      new Set(result.items.map((line) => line.receiptLineId)).size !== expected.size ||
      result.items.some(
        (line) =>
          line.receiptId !== receiptId ||
          !expected.has(line.receiptLineId) ||
          !Number.isSafeInteger(line.reportCount) ||
          line.reportCount < 0,
      )
    )
      throw new Error('检验摘要与当前到货物料不匹配');
    qualityLines.value = Object.fromEntries(result.items.map((line) => [line.receiptLineId, line]));
    qualityLoaded.value = true;
    qualityError.value = '';
  } catch {
    if (current.isCurrent())
      qualityError.value = '检验摘要读取失败，不影响查看入库和其他处理说明。';
  } finally {
    if (current.isCurrent()) qualityLoading.value = false;
  }
}
watch(
  [
    () => props.expanded,
    () => props.state?.items,
    () => props.state?.error,
    () => props.receipt.id,
    canViewQuality,
  ],
  () => {
    qualityRead.invalidate();
    qualityLines.value = {};
    qualityLoaded.value = false;
    qualityError.value = '';
    void loadQuality();
  },
  { immediate: true },
);
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
.purchase-receipt :deep(.receipt-table) {
  min-width: 1115px;
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
