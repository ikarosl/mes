<template>
  <el-descriptions
    :column="3"
    border
    size="small"
  >
    <el-descriptions-item label="到货来源"
      ><strong class="identity-value">{{ line.receiptNo }}</strong> · 到货行 ID：<strong
        class="identity-value"
        >{{ line.id }}</strong
      ></el-descriptions-item
    >
    <el-descriptions-item label="采购单"
      ><strong class="identity-value">{{ line.purchaseNo }}</strong></el-descriptions-item
    >
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
<style scoped>
.identity-value {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
</style>
