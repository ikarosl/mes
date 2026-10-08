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
        label="采购归属"
        min-width="170"
      >
        <template #default="{ row }">
          <div class="allocation-purchase">{{ row.purchaseNo || '—' }}</div>
          <div class="allocation-id">分配 ID：{{ row.id }}</div>
        </template>
      </el-table-column>
      <el-table-column
        label="授权数量"
        width="100"
        align="right"
        header-align="right"
        ><template #default="{ row }">{{ row.quantity }} {{ line.unit }}</template></el-table-column
      >
      <el-table-column
        prop="inboundQuantity"
        label="已入库"
        width="75"
        align="right"
        header-align="right"
      />
      <el-table-column
        prop="returnedQuantity"
        label="已退回"
        width="75"
        align="right"
        header-align="right"
      />
      <el-table-column
        label="未执行量"
        width="110"
        align="right"
        header-align="right"
      >
        <template #default="{ row }">
          <strong
            :class="isKnownZero(row.remainingQuantity) ? 'quantity-zero' : 'quantity-executable'"
          >
            {{ row.remainingQuantity }} {{ line.unit }}
          </strong>
        </template>
      </el-table-column>
      <el-table-column
        label="授权去向"
        min-width="160"
        ><template #default="{ row }">
          <div>
            {{
              RECEIPT_ALLOCATION_AUTHORIZATION_LABELS[
                row.disposition as ReceiptAllocationDisposition
              ]
            }}
          </div>
          <div
            v-if="row.returnReason"
            class="allocation-return-reason"
          >
            · {{ SUPPLIER_RETURN_REASON_LABELS[row.returnReason as ReceiptReturnReason] }}
          </div>
        </template></el-table-column
      >
      <el-table-column
        label="执行状态"
        width="100"
        ><template #default="{ row }">
          <el-tag
            size="small"
            v-bind="receiptAllocationExecutionTag(line, row)"
          >
            {{ receiptAllocationExecutionLabel(line, row) }}
          </el-tag>
        </template></el-table-column
      >
      <el-table-column
        label="执行 / 追溯"
        width="184"
        fixed="right"
        ><template #default="{ row }">
          <div class="allocation-row-actions">
            <el-button
              v-if="
                !quality &&
                row.disposition === 'inbound' &&
                canExecuteReceiptAllocation(line, row) &&
                canAccessRoute({ name: 'warehouse-inbound' })
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
          </div>
        </template></el-table-column
      >
    </el-table>
    <div
      v-if="remarkedAllocations.length"
      class="allocation-remarks"
    >
      <div
        v-for="row in remarkedAllocations"
        :key="row.id"
        class="allocation-remark"
      >
        <strong>分配 ID：{{ row.id }}</strong
        ><span> · 说明：{{ row.remark }}</span>
      </div>
    </div>
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
  receiptAllocationExecutionTag,
} from '../receipt-round-presentation';
import { computed } from 'vue';
import { useRouteAccess } from '../../../composables/useRouteAccess';
const { canAccessRoute } = useRouteAccess();
const isKnownZero = (value: string): boolean => value.trim() !== '' && Number(value) === 0;
const props = defineProps<{ line: ProcurementReceiptLine; quality: boolean; disabled: boolean }>();
const remarkedAllocations = computed(() =>
  props.line.allocations.filter((row) => row.remark?.trim()),
);
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
.allocation-purchase,
.allocation-id,
.allocation-remark {
  overflow-wrap: anywhere;
}
.allocation-id,
.allocation-return-reason {
  color: var(--el-text-color-secondary);
}
.allocation-row-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
}
.allocation-row-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.allocation-remarks {
  margin-top: 8px;
}
.allocation-remark + .allocation-remark {
  margin-top: 4px;
}
.allocation-remark span {
  white-space: pre-wrap;
}
.quantity-executable {
  color: var(--el-text-color-primary);
  font-weight: 700;
}
.quantity-zero {
  color: var(--el-text-color-placeholder);
  font-weight: 400;
}
</style>
