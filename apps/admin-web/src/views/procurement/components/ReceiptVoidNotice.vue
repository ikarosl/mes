<template>
  <el-alert
    :title="RECEIPT_ROUND_STATUS_LABELS.voided"
    type="error"
    :closable="false"
    show-icon
  >
    <p class="void-reason">作废原因：{{ record.reason }}</p>
    <p>操作人：{{ record.createdBy }} · {{ formatDateTimeForDisplay(record.createdAt) }}</p>
    <p>原始登记、检验和正式清单保留，未执行授权已失效；采购状态保持不变。</p>
  </el-alert>
</template>
<script setup lang="ts">
import type { ProcurementReceiptVoidItem } from '@company/contracts';
import { RECEIPT_ROUND_STATUS_LABELS } from '@company/constants';
import { formatDateTimeForDisplay } from '../../../utils/date';

defineProps<{ record: ProcurementReceiptVoidItem }>();
</script>
<style scoped>
p {
  margin: 4px 0;
}
.void-reason {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
