<template>
  <el-descriptions
    :column="3"
    border
    size="small"
  >
    <el-descriptions-item label="到货明细"
      >{{ line.receiptNo }} · id:{{ line.id }}</el-descriptions-item
    >
    <el-descriptions-item label="采购单">{{ line.purchaseNo }}</el-descriptions-item>
    <el-descriptions-item label="供应商">{{ line.supplierName }}</el-descriptions-item>
    <el-descriptions-item
      label="物料 / 版本"
      :span="2"
    >
      <strong>{{ line.itemName }}</strong> · {{ line.itemCode }} · {{ line.materialVariantCode }}
    </el-descriptions-item>
    <el-descriptions-item label="供应商批号">{{
      line.supplierBatchCode || '未提供'
    }}</el-descriptions-item>
  </el-descriptions>
</template>
<script setup lang="ts">
import type { ProcurementInboundInspectionDetail } from '@company/contracts';
defineProps<{
  line: ProcurementInboundInspectionDetail;
}>();
</script>
