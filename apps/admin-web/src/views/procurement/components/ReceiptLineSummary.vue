<template>
  <div>
    <el-descriptions
      :column="4"
      border
      size="small"
    >
      <el-descriptions-item
        label="物料"
        :span="2"
        >{{ line.itemCode }} · {{ line.itemName }}</el-descriptions-item
      >
      <el-descriptions-item
        label="精确版本"
        :span="2"
        >{{ line.materialVariantCode }}</el-descriptions-item
      >
      <el-descriptions-item
        label="供应商批号"
        :span="2"
        >{{ line.supplierBatchCode || '未提供' }}</el-descriptions-item
      >
      <el-descriptions-item
        label="内部批号"
        :span="2"
        >{{ line.batchCode || '首次确认入库时生成' }}</el-descriptions-item
      >
      <el-descriptions-item label="当前实收"
        >{{ Number(line.quantities.receivedQuantity) }} {{ line.unit }}</el-descriptions-item
      >
      <el-descriptions-item label="未判定量">{{
        Number(line.quantities.undeterminedQuantity)
      }}</el-descriptions-item>
      <el-descriptions-item label="有效批准量">{{
        Number(line.quantities.approvedQuantity)
      }}</el-descriptions-item>
      <el-descriptions-item label="累计已入量">{{
        Number(line.quantities.inboundQuantity)
      }}</el-descriptions-item>
      <el-descriptions-item label="当前可入量">{{
        Number(line.quantities.pendingInboundQuantity)
      }}</el-descriptions-item>
      <el-descriptions-item label="当前待退量">{{
        Number(line.quantities.pendingReturnQuantity)
      }}</el-descriptions-item>
      <el-descriptions-item label="累计已退量">{{
        Number(line.quantities.returnedQuantity)
      }}</el-descriptions-item>
      <el-descriptions-item label="复核中"
        ><el-tag
          v-if="line.quantities.hasOpenReview"
          type="warning"
          >有范围暂停办理</el-tag
        ><span v-else>无</span></el-descriptions-item
      >
    </el-descriptions>
    <p
      v-if="line.overReceiptNote"
      class="help"
    >
      超量接受依据：{{ line.overReceiptNote }}
    </p>
  </div>
</template>
<script setup lang="ts">
import type { ProcurementReceiptLine } from '@company/contracts';
defineProps<{ line: ProcurementReceiptLine }>();
</script>
<style scoped>
.help {
  color: #6b7280;
  font-size: 13px;
}
</style>
