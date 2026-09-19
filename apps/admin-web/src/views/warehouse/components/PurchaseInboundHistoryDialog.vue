<template>
  <el-dialog
    :model-value="visible"
    title="外购物料入库详情"
    :width="DialogWidth.workbench"
    workbench
    @update:model-value="$emit('close')"
  >
    <div
      v-loading="history.detailLoading.value"
      class="history-detail"
    >
      <el-alert
        v-if="history.detailError.value"
        :title="history.detailError.value"
        type="error"
        :closable="false"
      />
      <template v-if="history.detail.value">
        <el-descriptions
          :column="3"
          border
        >
          <el-descriptions-item label="入库单号">{{
            history.detail.value.inboundNo
          }}</el-descriptions-item>
          <el-descriptions-item label="供应商">{{
            history.detail.value.provider || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{
            inboundOrderStatusLabel(history.detail.value.status)
          }}</el-descriptions-item>
          <el-descriptions-item label="确认时间">{{
            history.detail.value.inboundAt
              ? formatDateTimeForDisplay(history.detail.value.inboundAt)
              : '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="确认人">{{
            history.detail.value.operatorName || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="备注">{{
            history.detail.value.remark || '-'
          }}</el-descriptions-item>
        </el-descriptions>
        <el-table
          :data="history.detail.value.details"
          class="details-table"
        >
          <el-table-column
            label="物料"
            min-width="210"
            ><template #default="{ row }"
              >{{ row.itemCode }} · {{ row.itemName }}</template
            ></el-table-column
          >
          <el-table-column
            prop="materialVariantCode"
            label="精确版本"
            min-width="150"
          />
          <el-table-column
            label="内部批号"
            min-width="230"
            ><template #default="{ row }"
              ><el-button
                link
                type="primary"
                @click="openBatch(row.itemBatchId)"
                >{{ row.batchCode }}</el-button
              ></template
            ></el-table-column
          >
          <el-table-column
            label="本次入库数量"
            min-width="140"
            align="right"
            ><template #default="{ row }"
              >{{ formatQuantity(row.inboundQuantity) }} {{ row.unit }}</template
            ></el-table-column
          >
          <el-table-column
            label="来源追溯"
            min-width="150"
          >
            <template #default="{ row }">
              <template v-if="row.procurementReceiptLineId">
                <el-button
                  v-if="auth.can(PERMISSIONS.procurement.receipts.view)"
                  link
                  type="primary"
                  @click="openReceipt(row.procurementReceiptLineId)"
                  >到货明细</el-button
                >
                <el-button
                  v-if="auth.can(PERMISSIONS.quality.inboundInspections.view)"
                  link
                  type="primary"
                  @click="openInspection(row.procurementReceiptLineId)"
                  >检验记录</el-button
                >
              </template>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </div>
    <template #footer><el-button @click="$emit('close')">关闭</el-button></template>
  </el-dialog>
</template>
<script setup lang="ts">
import { useRouter } from 'vue-router';
import { PERMISSIONS } from '@company/constants';
import { useAuthStore } from '../../../stores/auth';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { DialogWidth } from '../../../utils/dialog';
import { inboundOrderStatusLabel } from '../../../constants/business-status';
import { formatQuantity } from '../../production/production-status';
import type { usePurchaseInbounds } from '../../production/composables/usePurchaseInbounds';

defineOptions({ name: 'PurchaseInboundHistoryDialog' });
defineProps<{ visible: boolean; history: ReturnType<typeof usePurchaseInbounds> }>();
defineEmits<{ close: [] }>();
const router = useRouter();
const auth = useAuthStore();
const openBatch = (itemBatchId: string) =>
  router.push({ name: 'warehouse-inventory', query: { itemBatchId } });
const openReceipt = (receiptLineId: string) =>
  router.push({ name: 'procurement-receipts', query: { receiptLineId } });
const openInspection = (receiptLineId: string) =>
  router.push({ name: 'quality-inbound-inspections', query: { receiptLineId } });
</script>
<style scoped>
.history-detail {
  min-height: 160px;
}
.details-table {
  margin-top: 20px;
}
</style>
