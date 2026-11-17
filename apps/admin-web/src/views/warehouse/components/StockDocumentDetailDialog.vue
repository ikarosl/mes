<template>
  <el-dialog
    :model-value="visible"
    :title="`${STOCK_DOCUMENT_DIRECTION_LABELS[direction]}单详情`"
    :width="DialogWidth.workbench"
    workbench
    @update:model-value="emit('update:visible', $event)"
  >
    <div
      v-loading="loading"
      class="document-detail"
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
          <el-descriptions-item label="单号"
            ><strong>{{ order.orderNo }}</strong></el-descriptions-item
          >
          <el-descriptions-item label="业务类型">{{
            STOCK_DOCUMENT_SOURCE_LABELS[order.sourceType]
          }}</el-descriptions-item>
          <el-descriptions-item label="状态"
            ><el-tag :type="stockDocumentStatusTag(order.status)">{{
              STOCK_DOCUMENT_STATUS_LABELS[order.status]
            }}</el-tag></el-descriptions-item
          >
          <el-descriptions-item label="有效明细">{{ order.detailCount }} 条</el-descriptions-item>
          <el-descriptions-item
            label="本单数量"
            :span="2"
            ><strong>{{ stockDocumentQuantitySummary(order) }}</strong></el-descriptions-item
          >
          <el-descriptions-item label="制单人">{{
            order.createdByName || '—'
          }}</el-descriptions-item>
          <el-descriptions-item
            label="制单时间"
            :span="2"
            >{{ formatDateTimeForDisplay(order.createdAt) }}</el-descriptions-item
          >
          <el-descriptions-item label="确认人">{{
            order.operatorName || '—'
          }}</el-descriptions-item>
          <el-descriptions-item
            label="确认时间"
            :span="2"
            >{{ formatDateTimeForDisplay(order.confirmedAt) }}</el-descriptions-item
          >
          <el-descriptions-item
            v-if="order.reason"
            label="办理原因"
            :span="3"
            >{{ order.reason }}</el-descriptions-item
          >
          <el-descriptions-item
            label="备注"
            :span="3"
            >{{ order.remark || '—' }}</el-descriptions-item
          >
          <template v-if="order.status === 'cancelled'">
            <el-descriptions-item label="取消人">{{
              order.cancelledByName || '—'
            }}</el-descriptions-item>
            <el-descriptions-item
              label="取消时间"
              :span="2"
              >{{ formatDateTimeForDisplay(order.cancelledAt) }}</el-descriptions-item
            >
            <el-descriptions-item
              label="取消原因"
              :span="3"
              >{{ order.cancelReason || '—' }}</el-descriptions-item
            >
          </template>
        </el-descriptions>
        <InlineHint v-if="detailId && !order.details.some((line) => line.id === detailId)"
          >指定明细不属于本单，请按真实单号和明细核对。</InlineHint
        >
        <el-table
          :data="order.details"
          row-key="id"
          :row-class-name="lineClass"
        >
          <el-table-column
            prop="lineNo"
            label="行号"
            width="75"
            ><template #default="{ row }"
              >{{ row.lineNo
              }}<el-tag
                v-if="row.isDeleted"
                size="small"
                type="info"
                >已移除</el-tag
              ></template
            ></el-table-column
          >
          <el-table-column
            label="物料 / 成品"
            min-width="210"
            ><template #default="{ row }"
              ><strong>{{ row.itemName }}</strong>
              <div class="secondary">{{ row.itemCode }}</div>
              <div
                v-if="row.materialVariantCode"
                class="secondary"
              >
                {{ row.materialVariantCode }}
              </div></template
            ></el-table-column
          >
          <el-table-column
            label="库存批次"
            min-width="175"
            ><template #default="{ row }"
              ><el-button
                v-if="row.batchId && canAccessRoute({ name: 'warehouse-inventory' })"
                link
                type="primary"
                @click="go({ name: 'warehouse-inventory', query: { itemBatchId: row.batchId } })"
                >{{ row.batchCode }}</el-button
              ><span v-else>{{
                row.batchCode || (row.targetMode === 'new' ? '确认时生成新批次' : '—')
              }}</span></template
            ></el-table-column
          >
          <el-table-column
            label="数量"
            min-width="135"
            align="right"
            ><template #default="{ row }"
              >{{ formatQuantity(row.quantity) }} {{ row.unit }}</template
            ></el-table-column
          >
          <el-table-column
            label="来源"
            min-width="300"
            ><template #default="{ row }">
              <template v-if="row.procurementSource">
                <div>
                  <el-button
                    v-if="canAccessRoute({ name: 'procurement-orders' })"
                    link
                    type="primary"
                    @click="
                      go({
                        name: 'procurement-orders',
                        query: {
                          purchaseOrderId: row.procurementSource.purchaseOrder.purchaseOrderId,
                          purchaseOrderLineId:
                            row.procurementSource.purchaseOrder.purchaseOrderLineId,
                        },
                      })
                    "
                    >{{ row.procurementSource.purchaseOrder.purchaseOrderNo }}</el-button
                  ><span v-else>{{ row.procurementSource.purchaseOrder.purchaseOrderNo }}</span>
                </div>
                <div>
                  <el-button
                    v-if="canAccessRoute({ name: 'procurement-receipts' })"
                    link
                    type="primary"
                    @click="
                      go({
                        name: 'procurement-receipts',
                        query: {
                          receiptId: row.procurementSource.receipt.receiptId,
                          receiptLineId: row.procurementSource.receipt.receiptLineId,
                        },
                      })
                    "
                    >{{ row.procurementSource.receipt.receiptNo }}</el-button
                  ><span v-else>{{ row.procurementSource.receipt.receiptNo }}</span>
                </div>
                <div class="secondary">
                  {{ row.procurementSource.supplierName || '未记录供应商' }}
                </div>
              </template>
              <template v-else-if="row.productionSource"
                ><div>{{ row.productionSource.workOrderNo }}</div>
                <el-button
                  v-if="canAccessRoute({ name: 'production-tasks' })"
                  link
                  type="primary"
                  @click="
                    go({
                      name: 'production-tasks',
                      query: { batchId: row.productionSource.productionBatchId },
                    })
                  "
                  >{{ row.productionSource.batchNo }}</el-button
                ><span v-else>{{ row.productionSource.batchNo }}</span>
                <div
                  v-if="row.productionSource.trackingCardNo"
                  class="secondary"
                >
                  {{ row.productionSource.trackingCardNo }}
                </div></template
              ><span v-else>—</span>
            </template></el-table-column
          >
          <el-table-column
            prop="remark"
            label="行备注"
            min-width="180"
          />
        </el-table>
      </template>
    </div>
    <template #footer
      ><el-button
        :loading="loading"
        @click="emit('refresh')"
        >刷新</el-button
      ><el-button
        v-if="order"
        @click="printStockDocument(order)"
        >打印</el-button
      ><el-button @click="emit('update:visible', false)">关闭</el-button></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';
import { useRouter } from 'vue-router';
import type {
  StockDocumentDirection,
  StockDocumentLine,
  StockDocumentOrder,
} from '@company/contracts';
import {
  STOCK_DOCUMENT_DIRECTION_LABELS,
  STOCK_DOCUMENT_SOURCE_LABELS,
  STOCK_DOCUMENT_STATUS_LABELS,
} from '@company/constants';
import InlineHint from '../../../components/InlineHint.vue';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../../utils/quantity';
import {
  printStockDocument,
  stockDocumentQuantitySummary,
  stockDocumentStatusTag,
} from '../stock-document-presentation';
defineOptions({ name: 'StockDocumentDetailDialog' });
const props = defineProps<{
  visible: boolean;
  direction: StockDocumentDirection;
  order: StockDocumentOrder | null;
  loading: boolean;
  error: string;
  detailId: string;
}>();
const emit = defineEmits<{ 'update:visible': [value: boolean]; refresh: [] }>();
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
function lineClass({ row }: { row: StockDocumentLine }): string {
  return row.id === props.detailId ? 'located-line' : '';
}
async function go(target: RouteLocationRaw): Promise<void> {
  if (canAccessRoute(target)) await router.push(target);
}
</script>
<style scoped>
.document-detail {
  display: grid;
  gap: 16px;
  min-height: 120px;
}
.secondary {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 4px;
}
.document-detail :deep(.located-line td:first-child) {
  box-shadow: inset 3px 0 var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
</style>
