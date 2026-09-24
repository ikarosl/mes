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
      <el-button
        link
        type="primary"
        :disabled="disabled || loading"
        @click="$emit('refresh')"
        >刷新本单</el-button
      >
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
        :disabled="disabled || loading || failed"
        @close-line="$emit('close-line', $event)"
        @supplements="$emit('supplements', $event)"
        @excess-supplement="$emit('excess-supplement', $event)"
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
import type { PurchaseOrderDetail } from '@company/contracts';
import PurchaseOrderLines from './PurchaseOrderLines.vue';
import { formatDateTimeForDisplay } from '../../../utils/date';
defineProps<{
  detail: PurchaseOrderDetail | null;
  loading: boolean;
  failed: boolean;
  disabled: boolean;
  lineCount: number;
}>();
defineEmits<{
  refresh: [];
  'close-line': [string];
  supplements: [string];
  'excess-supplement': [string];
  receipts: [];
  'source-receipt': [string];
  navigate: [string];
}>();
</script>
<style scoped>
.order-lines {
  margin: 0 20px 16px 48px;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
}
.line-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  color: #606266;
}
.order-remark {
  margin: 8px 0 12px;
  color: #606266;
}
</style>
