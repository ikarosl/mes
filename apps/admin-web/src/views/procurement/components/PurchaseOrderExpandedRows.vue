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
      <div class="supplement-actions">
        <el-button
          v-if="detail?.orderedAt"
          link
          type="primary"
          :disabled="
            disabled ||
            loading ||
            failed ||
            (detail.supplementReason === 'excess_purchase' && !excessOrigin)
          "
          @click="openSupplement"
          >{{
            detail.supplementReason === 'excess_purchase' ? '前往原采购单办理补单' : '办理补单'
          }}</el-button
        >
        <InlineHint
          v-if="detail?.supplementReason === 'excess_purchase'"
          :tone="excessOrigin ? 'info' : 'warning'"
          class="supplement-hint"
        >
          <template v-if="excessOrigin"
            >本单承接原到货；补单回原采购
            <strong>{{ excessOrigin.purchaseNo }}</strong> 办理。</template
          >
          <template v-else>原采购来源缺失或不一致，请先核对各行来源。</template>
        </InlineHint>
        <el-button
          link
          type="primary"
          :disabled="disabled || loading"
          @click="$emit('refresh')"
          >刷新本单</el-button
        >
      </div>
    </div>
    <el-alert
      v-if="failed"
      title="物料行读取失败，旧内容仅供参考，请刷新本单后办理。"
      type="error"
      :closable="false"
    />
    <template v-if="detail">
      <p
        v-if="detail?.remark"
        class="order-remark"
      >
        备注：{{ detail?.remark }}
      </p>
      <PurchaseOrderLines
        :order="detail"
        :focused-line-id="focusedLineId"
        :disabled="disabled || loading || failed"
        @close-line="$emit('close-line', $event)"
        @supplements="$emit('supplements', $event)"
        @supplement="$emit('supplement', $event)"
        @receipts="$emit('receipts')"
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
  supplements: [string];
  supplement: [string?];
  'supplement-origin': [string];
  receipts: [];
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
  margin-bottom: 12px;
  color: #606266;
}
.supplement-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.supplement-hint {
  max-width: 540px;
}
.order-remark {
  margin: 8px 0 12px;
  color: #606266;
  overflow-wrap: anywhere;
}
</style>
