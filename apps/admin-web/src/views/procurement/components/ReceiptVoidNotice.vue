<template>
  <el-alert
    :title="RECEIPT_LINE_STAGE_LABELS.voided"
    type="error"
    :closable="false"
    show-icon
  >
    <p class="void-reason">作废原因：{{ record.reason }}</p>
    <p>操作人：{{ record.createdBy }} · {{ formatDateTimeForDisplay(record.createdAt) }}</p>
    <p>原始到货、检验报告和处理说明保留历史，作废后不能新增仓库办理。</p>
  </el-alert>
</template>
<script setup lang="ts">
import type { ProcurementReceiptVoidItem } from '@company/contracts';
import { RECEIPT_LINE_STAGE_LABELS } from '@company/constants';
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
