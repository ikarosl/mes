<template>
  <el-descriptions
    :column="2"
    border
    size="small"
  >
    <el-descriptions-item label="物料 / 精确版本"
      ><strong>{{ line.itemName }}</strong> · {{ line.materialVariantCode }}</el-descriptions-item
    ><el-descriptions-item label="仓库办理"
      ><el-tag
        :type="receiptLineStageType(line)"
        effect="plain"
        >{{ receiptLineStageLabel(line) }}</el-tag
      ></el-descriptions-item
    >
    <el-descriptions-item label="实际供应商">{{ line.supplierName }}</el-descriptions-item
    ><el-descriptions-item label="来料批次号">{{
      line.supplierBatchCode || '未提供'
    }}</el-descriptions-item
    ><el-descriptions-item label="累计已入库"
      ><strong
        >{{ Number(line.quantities.inboundQuantity) }} {{ line.unit }}</strong
      ></el-descriptions-item
    ><el-descriptions-item label="采购行 ID">{{ line.purchaseOrderLineId }}</el-descriptions-item
    ><el-descriptions-item
      label="最近其他处理说明"
      :span="2"
      ><span class="handling-note">{{ line.otherHandlingNote || '—' }}</span></el-descriptions-item
    >
  </el-descriptions>
</template>
<script setup lang="ts">
import type { ProcurementReceiptLineOverview } from '@company/contracts';
import { receiptLineStageLabel, receiptLineStageType } from '../receipt-presentation';
defineProps<{ line: ProcurementReceiptLineOverview }>();
</script>
<style scoped>
.handling-note {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
