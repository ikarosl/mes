<template>
  <el-dialog
    v-model="visible"
    title="盘点单详情"
    :width="DialogWidth.workbench"
    workbench
  >
    <div
      v-loading="loading"
      class="stock-check-detail"
    >
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
      />
      <template v-if="order">
        <el-descriptions
          :column="3"
          border
        >
          <el-descriptions-item label="盘点单号"
            ><strong>{{ order.checkNo }}</strong></el-descriptions-item
          >
          <el-descriptions-item label="状态">{{
            STOCK_CHECK_STATUS_LABELS[order.status]
          }}</el-descriptions-item>
          <el-descriptions-item label="盘点人">{{
            order.operatorName || '—'
          }}</el-descriptions-item>
          <el-descriptions-item label="制单人">{{
            order.createdByName || '—'
          }}</el-descriptions-item>
          <el-descriptions-item label="制单时间">{{
            formatDateTimeForDisplay(order.createdAt)
          }}</el-descriptions-item>
          <el-descriptions-item label="盘点时间">{{
            formatDateTimeForDisplay(order.checkAt)
          }}</el-descriptions-item>
          <el-descriptions-item
            label="备注"
            :span="3"
            >{{ order.remark || '—' }}</el-descriptions-item
          >
          <el-descriptions-item
            v-if="order.cancelReason"
            label="取消原因"
            :span="3"
            >{{ order.cancelReason }}</el-descriptions-item
          >
        </el-descriptions>
        <el-table
          :data="order.details"
          row-key="id"
          :row-class-name="lineClass"
        >
          <el-table-column
            label="物料 / 版本"
            min-width="230"
            ><template #default="{ row }"
              ><strong>{{ row.itemName }}</strong>
              <div class="secondary">
                {{ row.itemCode }} · {{ row.materialVariantCode }}
              </div></template
            ></el-table-column
          >
          <el-table-column
            prop="batchCode"
            label="库存批次"
            min-width="180"
          />
          <el-table-column
            label="库存状态"
            width="110"
            ><template #default="{ row }">{{
              stockStatusLabel(row.stockStatus)
            }}</template></el-table-column
          >
          <el-table-column
            label="账面数量"
            min-width="130"
            align="right"
            ><template #default="{ row }"
              >{{ formatQuantity(row.systemQuantity) }} {{ row.unit }}</template
            ></el-table-column
          >
          <el-table-column
            label="实盘数量"
            min-width="130"
            align="right"
            ><template #default="{ row }">{{
              row.actualQuantity === null
                ? '尚未记录'
                : `${formatQuantity(row.actualQuantity)} ${row.unit}`
            }}</template></el-table-column
          >
          <el-table-column
            label="差异"
            min-width="130"
            align="right"
            ><template #default="{ row }">{{
              row.differenceQuantity === null
                ? '—'
                : `${formatQuantity(row.differenceQuantity)} ${row.unit}`
            }}</template></el-table-column
          >
          <el-table-column
            label="结果"
            width="110"
            ><template #default="{ row }">{{
              row.result ? STOCK_CHECK_RESULT_LABELS[row.result as StockCheckResult] : '—'
            }}</template></el-table-column
          >
          <el-table-column
            label="库存调整"
            width="110"
            ><template #default="{ row }">{{
              row.adjusted ? '已记账' : '未记账'
            }}</template></el-table-column
          >
        </el-table>
      </template>
    </div>
    <template #footer
      ><el-button
        :loading="loading"
        @click="load"
        >刷新</el-button
      ><el-button @click="visible = false">关闭</el-button></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import type {
  StockCheckDetailItem,
  StockCheckOrderItem,
  StockCheckResult,
} from '@company/contracts';
import { STOCK_CHECK_RESULT_LABELS, STOCK_CHECK_STATUS_LABELS } from '@company/constants';
import { warehouseApi } from '../../../api/warehouse';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { stockStatusLabel } from '../../../constants/business-status';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../../utils/quantity';
defineOptions({ name: 'StockCheckReadonlyDialog' });
const visible = ref(false),
  loading = ref(false),
  error = ref('');
const order = ref<StockCheckOrderItem | null>(null),
  selectedId = ref(''),
  detailId = ref('');
const read = useLatestReadRequest(() => {
  loading.value = false;
});
function lineClass({ row }: { row: StockCheckDetailItem }): string {
  return row.id === detailId.value ? 'located-line' : '';
}
async function load(): Promise<void> {
  if (!visible.value || !selectedId.value || !read.isActive()) return;
  const id = selectedId.value;
  const current = read.begin(() => visible.value && selectedId.value === id);
  loading.value = true;
  try {
    const result = await warehouseApi.getStockCheck(id, current.signal);
    if (current.isCurrent()) {
      order.value = result;
      error.value = '';
    }
  } catch (cause) {
    if (current.isCurrent())
      error.value = cause instanceof Error ? cause.message : '盘点单读取失败';
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
}
async function open(id: string, lineId: string): Promise<void> {
  selectedId.value = id;
  detailId.value = lineId;
  order.value = null;
  error.value = '';
  visible.value = true;
  await load();
}
watch(visible, (value) => {
  if (!value) read.invalidate();
});
defineExpose({ open });
</script>
<style scoped>
.stock-check-detail {
  display: grid;
  gap: 16px;
  min-height: 120px;
}
.secondary {
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  font-size: 12px;
}
.stock-check-detail :deep(.located-line td:first-child) {
  box-shadow: inset 3px 0 var(--el-color-primary);
}
</style>
