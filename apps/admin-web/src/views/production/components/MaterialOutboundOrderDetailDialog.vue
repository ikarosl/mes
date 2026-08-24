<template>
  <el-dialog
    :model-value="modelValue"
    title="生产领料出库单详情"
    :width="DialogWidth.xl"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div
      v-loading="loading"
      class="detail-body"
    >
      <template v-if="detail">
        <el-alert
          :title="notice"
          :type="
            detail.status === 'completed'
              ? 'success'
              : detail.status === 'cancelled'
                ? 'error'
                : 'warning'
          "
          :closable="false"
        />
        <el-descriptions
          :column="3"
          border
          class="detail-summary"
        >
          <el-descriptions-item label="出库单号">{{ detail.outboundNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{
            OUTBOUND_ORDER_STATUS_LABELS[detail.status]
          }}</el-descriptions-item>
          <el-descriptions-item label="版本">{{ detail.version }}</el-descriptions-item>
          <el-descriptions-item label="生产工单">{{ detail.workOrderNo }}</el-descriptions-item>
          <el-descriptions-item label="生产批次">{{ detail.batchNo }}</el-descriptions-item>
          <el-descriptions-item label="产品"
            >{{ detail.productCode }} · {{ detail.productName }}</el-descriptions-item
          >
          <el-descriptions-item label="制单人">{{
            detail.createdByName || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="制单时间">{{
            formatDateTimeForDisplay(detail.createdAt)
          }}</el-descriptions-item>
          <el-descriptions-item label="实际出库"
            >{{ detail.operatorName || '-' }} /
            {{
              detail.outboundAt ? formatDateTimeForDisplay(detail.outboundAt) : '-'
            }}</el-descriptions-item
          >
          <el-descriptions-item
            label="备注"
            :span="3"
            >{{ detail.remark || '-' }}</el-descriptions-item
          >
          <template v-if="detail.status === 'cancelled'">
            <el-descriptions-item label="取消来源">{{
              detail.cancelSource === 'production_batch'
                ? '生产任务取消'
                : detail.cancelSource === 'manual'
                  ? '人工取消'
                  : '历史数据未记录'
            }}</el-descriptions-item>
            <el-descriptions-item label="取消人">{{
              detail.cancelledByName || '-'
            }}</el-descriptions-item>
            <el-descriptions-item label="取消时间">{{
              formatDateTimeForDisplay(detail.cancelledAt)
            }}</el-descriptions-item>
            <el-descriptions-item
              label="取消原因"
              :span="3"
              >{{ detail.cancelReason || '-' }}</el-descriptions-item
            >
          </template>
        </el-descriptions>
        <el-table :data="detail.details">
          <el-table-column
            prop="demandId"
            label="需求 ID"
            width="105"
          />
          <el-table-column
            prop="allocationId"
            label="分配行 ID"
            width="110"
          />
          <el-table-column
            label="物料"
            min-width="170"
          >
            <template #default="{ row }">{{ row.itemCode }} · {{ row.itemName }}</template>
          </el-table-column>
          <el-table-column
            prop="batchCode"
            label="库存批次"
            min-width="140"
          />
          <el-table-column
            label="本次数量"
            width="130"
            align="right"
          >
            <template #default="{ row }"
              >{{ formatQuantity(row.outboundQuantity) }} {{ row.unit }}</template
            >
          </el-table-column>
          <el-table-column
            label="库存流水"
            width="120"
          >
            <template #default="{ row }">{{
              row.inventoryTransactionId ? `#${row.inventoryTransactionId}` : '尚未生成'
            }}</template>
          </el-table-column>
        </el-table>
      </template>
    </div>
    <template #footer>
      <el-button
        v-if="detail"
        @click="emit('print', detail)"
        >打印</el-button
      >
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { OUTBOUND_ORDER_STATUS_LABELS } from '@company/constants';
import type { MaterialOutboundItem } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../production-status';

defineOptions({ name: 'MaterialOutboundOrderDetailDialog' });

const props = defineProps<{
  modelValue: boolean;
  loading: boolean;
  detail: MaterialOutboundItem | null;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  print: [detail: MaterialOutboundItem];
}>();

const notice = computed(() => {
  if (props.detail?.status === 'completed') return '整张单据已确认，每条明细均已生成负库存流水。';
  if (props.detail?.status === 'cancelled')
    return '单据已取消，未扣减库存；明细仅作为历史记录保留。';
  return '单据尚未扣减库存，可打印用于拣货、领料和签字。';
});
</script>

<style scoped>
.detail-body {
  min-height: 180px;
  max-height: 70vh;
  overflow-y: auto;
}
.detail-summary {
  margin: 16px 0;
}
</style>
