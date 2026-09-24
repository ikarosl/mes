<template>
  <div>
    <el-descriptions
      :column="4"
      border
      size="small"
    >
      <el-descriptions-item label="实际供应商">{{ line.supplierName }}</el-descriptions-item>
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
      <el-descriptions-item
        label="当前处理阶段"
        :span="2"
      >
        <el-tag :type="isReceiptRejected(line) ? 'danger' : 'info'">
          {{
            isReceiptRejected(line)
              ? RECEIPT_ROUND_TRIGGER_LABELS.manual_rejection
              : RECEIPT_ROUND_STATUS_LABELS[line.currentRound.status]
          }}
        </el-tag>
        <span class="round-number">第 {{ line.currentRound.roundNo }} 轮</span>
      </el-descriptions-item>
      <el-descriptions-item
        label="当前未处置总量"
        :span="2"
        >{{ Number(line.quantities.unprocessedQuantity) }} {{ line.unit }}</el-descriptions-item
      >
      <el-descriptions-item label="本次到货核实总量"
        >{{ Number(line.quantities.receivedQuantity) }} {{ line.unit }}</el-descriptions-item
      >
      <el-descriptions-item label="待检 / 待定稿量">{{
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
      <el-descriptions-item label="质量阻断"
        ><el-tag
          v-if="line.quantities.hasOpenReview"
          type="warning"
          >整批暂停正常办理</el-tag
        ><span v-else>无</span></el-descriptions-item
      >
    </el-descriptions>
    <p
      class="help"
      style="color: chocolate"
    >
      本次到货明细 {{ line.id }}：核实总量 {{ Number(line.quantities.receivedQuantity) }}
      {{ line.unit }} = 已入库 {{ Number(line.quantities.inboundQuantity) }} + 已退回
      {{ Number(line.quantities.returnedQuantity) }} + 未处置
      {{ Number(line.quantities.unprocessedQuantity) }}。后续新到货另建记录，不累计到本明细。
    </p>
    <p
      v-if="line.overReceiptNote"
      class="help"
    >
      超量接受依据：{{ line.overReceiptNote }}
    </p>
  </div>
</template>
<script setup lang="ts">
import { RECEIPT_ROUND_STATUS_LABELS, RECEIPT_ROUND_TRIGGER_LABELS } from '@company/constants';
import type { ProcurementReceiptLine } from '@company/contracts';
import { isReceiptRejected } from '../receipt-round-presentation';
defineProps<{ line: ProcurementReceiptLine }>();
</script>
<style scoped>
.round-number {
  margin-left: 12px;
}
.help {
  color: #6b7280;
  font-size: 13px;
}
</style>
