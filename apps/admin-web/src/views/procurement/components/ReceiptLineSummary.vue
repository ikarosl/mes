<template>
  <div class="line-summary">
    <el-descriptions
      :column="3"
      border
      size="small"
    >
      <el-descriptions-item
        label="物料 / 版本"
        :span="2"
      >
        <strong>{{ line.itemName }}</strong> · {{ line.itemCode }} · {{ line.materialVariantCode }}
      </el-descriptions-item>
      <el-descriptions-item label="当前阶段">
        <el-tag :type="isReceiptRejected(line) ? 'danger' : 'info'">
          {{
            isReceiptRejected(line)
              ? RECEIPT_ROUND_TRIGGER_LABELS.manual_rejection
              : RECEIPT_ROUND_STATUS_LABELS[line.currentRound.status]
          }}
        </el-tag>
        <span class="round-number">第 {{ line.currentRound.roundNo }} 轮</span>
      </el-descriptions-item>
      <el-descriptions-item label="实际供应商">{{ line.supplierName }}</el-descriptions-item>
      <el-descriptions-item label="供应商批号">{{
        line.supplierBatchCode || '未提供'
      }}</el-descriptions-item>
      <el-descriptions-item label="明细身份">#{{ line.id }}</el-descriptions-item>
    </el-descriptions>
    <el-descriptions
      :column="4"
      border
      size="small"
      class="quantity-summary"
    >
      <el-descriptions-item label="本批核实总量"
        >{{ Number(line.quantities.receivedQuantity) }} {{ line.unit }}</el-descriptions-item
      >
      <el-descriptions-item label="累计已入"
        >{{ Number(line.quantities.inboundQuantity) }} {{ line.unit }}</el-descriptions-item
      >
      <el-descriptions-item label="累计已退"
        >{{ Number(line.quantities.returnedQuantity) }} {{ line.unit }}</el-descriptions-item
      >
      <el-descriptions-item label="本轮未处置"
        ><strong
          >{{ Number(line.quantities.unprocessedQuantity) }} {{ line.unit }}</strong
        ></el-descriptions-item
      >
    </el-descriptions>
    <div
      v-if="line.quantities.hasOpenReview"
      class="quality-blocker"
    >
      质量阻断：整批暂停正常定稿与入库
    </div>
    <el-collapse class="quantity-basis">
      <el-collapse-item
        title="查看本轮授权与数量依据"
        name="basis"
      >
        <el-descriptions
          :column="4"
          border
          size="small"
        >
          <el-descriptions-item label="待检 / 待定稿"
            >{{ Number(line.quantities.undeterminedQuantity) }}
            {{ line.unit }}</el-descriptions-item
          >
          <el-descriptions-item label="当前可入"
            >{{ Number(line.quantities.pendingInboundQuantity) }}
            {{ line.unit }}</el-descriptions-item
          >
          <el-descriptions-item label="当前待退"
            >{{ Number(line.quantities.pendingReturnQuantity) }}
            {{ line.unit }}</el-descriptions-item
          >
          <el-descriptions-item label="有效批准"
            >{{ Number(line.quantities.approvedQuantity) }} {{ line.unit }}</el-descriptions-item
          >
          <el-descriptions-item
            label="已入库存批次"
            :span="4"
            >{{
              line.batches.length
                ? line.batches.map((batch) => batch.batchCode).join('、')
                : '暂无实际入库'
            }}</el-descriptions-item
          >
          <el-descriptions-item
            v-if="line.overReceiptNote"
            label="超量接受依据"
            :span="4"
            >{{ line.overReceiptNote }}</el-descriptions-item
          >
        </el-descriptions>
        <p class="help">本批核实总量 = 累计已入 + 累计已退 + 本轮未处置；新到货另建记录。</p>
      </el-collapse-item>
    </el-collapse>
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
  margin-left: 8px;
}
.quantity-summary,
.quantity-basis {
  margin-top: 8px;
}
.quality-blocker {
  margin-top: 8px;
  padding: 8px 12px;
  color: #9a3412;
  background: #fff7ed;
  border-left: 3px solid #f59e0b;
}
.help {
  color: #6b7280;
  font-size: 13px;
}
</style>
