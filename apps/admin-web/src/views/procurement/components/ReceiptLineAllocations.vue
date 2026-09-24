<template>
  <div>
    <div class="allocation-heading">
      <strong>当前处置分配</strong
      ><el-button
        link
        type="primary"
        @click="$emit('history', 'allocations')"
        >分配历史</el-button
      >
    </div>
    <el-table
      :data="line.allocations"
      row-key="id"
      empty-text="本批暂无当前分配，请按当前阶段办理"
    >
      <el-table-column
        prop="id"
        label="分配"
        width="85"
      />
      <el-table-column
        prop="purchaseNo"
        label="采购归属"
        min-width="190"
      />
      <el-table-column
        label="授权数量"
        width="115"
        ><template #default="{ row }">{{ row.quantity }} {{ line.unit }}</template></el-table-column
      >
      <el-table-column
        prop="inboundQuantity"
        label="已入库"
        width="95"
      />
      <el-table-column
        prop="returnedQuantity"
        label="已退回"
        width="95"
      />
      <el-table-column
        prop="remainingQuantity"
        label="未执行量"
        width="105"
      />
      <el-table-column
        label="授权去向"
        min-width="170"
        ><template #default="{ row }">
          {{
            RECEIPT_ALLOCATION_AUTHORIZATION_LABELS[row.disposition as ReceiptAllocationDisposition]
          }}
          <span v-if="row.returnReason">
            · {{ SUPPLIER_RETURN_REASON_LABELS[row.returnReason as ReceiptReturnReason] }}</span
          >
        </template></el-table-column
      >
      <el-table-column
        label="执行状态"
        width="125"
        ><template #default="{ row }">{{
          receiptAllocationExecutionLabel(line, row)
        }}</template></el-table-column
      >
      <el-table-column
        prop="remark"
        label="说明"
        min-width="180"
      />
      <el-table-column
        label="执行 / 追溯"
        min-width="220"
        ><template #default="{ row }">
          <el-button
            v-if="
              !quality && row.disposition === 'inbound' && canExecuteReceiptAllocation(line, row)
            "
            link
            type="primary"
            :disabled="disabled"
            @click="$emit('inbound', row)"
            >办理实际入库</el-button
          >
          <el-button
            v-if="
              !quality && row.disposition === 'return' && canExecuteReceiptAllocation(line, row)
            "
            link
            type="primary"
            :disabled="disabled"
            @click="$emit('return', row)"
            >确认全部退回</el-button
          >
          <el-button
            link
            type="primary"
            @click="$emit('history', row.acceptanceId ? 'acceptances' : 'rounds')"
            >查看依据</el-button
          >
        </template></el-table-column
      >
    </el-table>
  </div>
</template>
<script setup lang="ts">
import type {
  ProcurementReceiptLine,
  ReceiptAllocationItem,
  ReceiptHistoryKind,
  ReceiptAllocationDisposition,
  ReceiptReturnReason,
} from '@company/contracts';
import {
  RECEIPT_ALLOCATION_AUTHORIZATION_LABELS,
  SUPPLIER_RETURN_REASON_LABELS,
} from '@company/constants';
import {
  canExecuteReceiptAllocation,
  receiptAllocationExecutionLabel,
} from '../receipt-round-presentation';
defineProps<{ line: ProcurementReceiptLine; quality: boolean; disabled: boolean }>();
defineEmits<{
  return: [ReceiptAllocationItem];
  inbound: [ReceiptAllocationItem];
  history: [ReceiptHistoryKind];
}>();
</script>
<style scoped>
.allocation-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 16px 0 8px;
}
</style>
