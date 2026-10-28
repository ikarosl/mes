<template>
  <section
    v-loading="loading"
    class="order-lines"
  >
    <div class="line-toolbar">
      <span
        >物料行 · {{ lineCount }} 行<span v-if="detail?.orderedAt">
          · 下单于
          {{ formatDateTimeForDisplay(detail?.orderedAt) }}</span
        ></span
      >
      <div class="toolbar-actions">
        <el-button
          v-if="detail?.orderedAt && detail.supplementReason !== 'excess_purchase'"
          link
          type="primary"
          :disabled="disabled || loading || failed"
          @click="openSupplement"
          >办理补单</el-button
        >
        <el-button
          link
          type="primary"
          :disabled="disabled || loading"
          @click="$emit('refresh')"
          >刷新本单</el-button
        >
      </div>
    </div>
    <div
      v-if="detail"
      class="line-metadata"
    >
      <span>供应商：{{ detail.supplierName }}</span>
      <template v-if="detail?.supplementReason === 'excess_purchase'">
        <span
          v-if="excessOrigin"
          class="origin-purchase"
        >
          原采购单 <strong>{{ excessOrigin.purchaseNo }}</strong> · 本单记录已有到货补购
        </span>
        <InlineHint
          v-else
          tone="warning"
          >原采购来源缺失或不一致，请先核对各行来源。</InlineHint
        >
        <el-button
          v-if="detail.orderedAt"
          link
          type="primary"
          :disabled="disabled || loading || failed || !excessOrigin"
          @click="openSupplement"
          >前往原单补单</el-button
        >
      </template>
      <span
        v-if="detail?.remark"
        class="order-remark"
        >备注：{{ detail.remark }}</span
      >
    </div>
    <el-alert
      v-if="failed"
      title="物料行读取失败，旧内容仅供参考，请刷新本单后办理。"
      type="error"
      :closable="false"
    />
    <template v-if="detail">
      <PurchaseOrderLines
        :order="detail"
        :focused-line-id="focusedLineId"
        :disabled="disabled || loading || failed"
        @close-line="$emit('close-line', $event)"
        @reopen-line="$emit('reopen-line', $event)"
        @supplements="$emit('supplements', $event)"
        @supplement="$emit('supplement', $event)"
        @receipt-records="$emit('receipt-records', $event)"
        @source-receipt="$emit('source-receipt', $event)"
        @navigate="$emit('navigate', $event)"
      />
    </template>
    <el-empty
      v-else-if="!loading && !failed"
      description="展开后读取物料行"
    />
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { PurchaseOrderDetail } from '@company/contracts';
import PurchaseOrderLines from './PurchaseOrderLines.vue';
import InlineHint from '../../../components/InlineHint.vue';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { excessSupplementOrigin } from '../supplement-origin';
const props = defineProps<{
  detail: PurchaseOrderDetail | null;
  loading: boolean;
  failed: boolean;
  disabled: boolean;
  lineCount: number;
  focusedLineId?: string;
}>();
const emit = defineEmits<{
  refresh: [];
  'close-line': [string];
  'reopen-line': [string];
  supplements: [string];
  supplement: [string?];
  'supplement-origin': [string];
  'receipt-records': [string];
  'source-receipt': [string];
  navigate: [string];
}>();
const excessOrigin = computed(() => excessSupplementOrigin(props.detail));
const openSupplement = (): void => {
  if (props.detail?.supplementReason === 'excess_purchase') {
    if (excessOrigin.value) emit('supplement-origin', excessOrigin.value.orderId);
  } else emit('supplement');
};
</script>
<style scoped>
.order-lines {
  box-sizing: border-box;
  position: sticky;
  left: 48px;
  width: calc(100cqw - 68px);
  margin: 10px 20px 16px 48px;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
}
.line-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 6px;
  color: #606266;
}
.toolbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin-left: auto;
}
.toolbar-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.line-metadata {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-bottom: 8px;
  color: #606266;
  font-size: 13px;
  line-height: 1.6;
}
.line-metadata :deep(.el-button) {
  flex: none;
  margin-left: 0;
}
.origin-purchase,
.order-remark {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}
</style>
