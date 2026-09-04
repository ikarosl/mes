<template>
  <div class="inventory-page">
    <el-tabs v-model="viewMode">
      <el-tab-pane
        label="物料供需预警"
        name="supply-demand"
      />
      <el-tab-pane
        label="库存批次"
        name="inventory-batches"
      />
    </el-tabs>
    <section
      v-if="viewMode === 'supply-demand'"
      class="query-panel"
    >
      <el-form
        class="query-form"
        :inline="true"
        :model="supplyDemandQuery"
        ><el-form-item label="物料"
          ><el-input
            v-model="supplyDemandQuery.keyword"
            clearable
            placeholder="编码或名称" /></el-form-item
        ><el-form-item class="query-actions"
          ><el-button
            type="primary"
            :loading="supplyDemandLoading"
            @click="searchSupplyDemand"
            >查询</el-button
          ><el-button @click="resetSupplyDemandQuery">重置</el-button></el-form-item
        ></el-form
      >
    </section>
    <section
      v-if="viewMode === 'supply-demand'"
      class="table-panel"
    >
      <TableToolbar :total="supplyDemandTotal"
        ><template #tools
          ><el-button
            :icon="Refresh"
            text
            circle
            :loading="supplyDemandLoading"
            @click="loadSupplyDemand" /></template></TableToolbar
      ><el-table
        v-loading="supplyDemandLoading"
        :data="supplyDemandItems"
        class="data-table supply-demand-table"
        empty-text="暂无活动物料需求"
        @row-click="openDemandTrace"
        ><el-table-column
          label="物料"
          min-width="220"
          ><template #default="{ row }"
            ><strong class="trace-link">{{ row.itemName }}</strong>
            <div class="secondary">{{ row.itemCode }}</div></template
          ></el-table-column
        ><el-table-column
          label="版本口径"
          min-width="180"
          ><template #default>基础物料合计（批次含精确版本）</template></el-table-column
        ><el-table-column
          label="可用库存"
          min-width="140"
          align="right"
          ><template #default="{ row }"
            >{{ formatQuantity(row.availableInventoryQuantity) }} {{ row.unit }}</template
          ></el-table-column
        ><el-table-column
          label="其他状态库存"
          min-width="140"
          align="right"
          ><template #default="{ row }"
            >{{ formatQuantity(row.unavailableInventoryQuantity) }} {{ row.unit }}</template
          ></el-table-column
        ><el-table-column
          label="未完成需求"
          min-width="140"
          align="right"
          ><template #default="{ row }"
            >{{ formatQuantity(row.openDemandQuantity) }} {{ row.unit }}</template
          ></el-table-column
        ><el-table-column
          label="库存缺口"
          min-width="130"
          align="right"
          ><template #default="{ row }"
            ><strong :class="row.isShortage ? 'shortage' : 'zero'">{{
              formatQuantity(row.shortageQuantity)
            }}</strong>
            {{ row.unit }}</template
          ></el-table-column
        ></el-table
      >
      <PaginationFooter
        :total="supplyDemandTotal"
        :current-page="supplyDemandCurrentPage"
        :page-size="supplyDemandPageSize"
        @update:page-size="changeSupplyDemandPageSize"
        @page-change="changeSupplyDemandPage"
      />
    </section>
    <el-dialog
      v-model="demandTraceVisible"
      :title="`${demandTraceSelectedItem?.itemName ?? '物料'} · 未完成需求来源`"
      :width="DialogWidth.xl"
    >
      <div
        v-loading="demandTraceLoading"
        class="detail-body"
      >
        <el-table
          :data="demandTraceItems"
          empty-text="暂无未完成需求"
        >
          <el-table-column
            label="需求来源"
            min-width="160"
          >
            <template #default="{ row }">
              <strong>{{ demandTypeLabel(row.demandType) }}</strong>
              <div class="secondary">需求 #{{ row.demandId }}</div>
            </template>
          </el-table-column>
          <el-table-column
            label="工单 / 生产任务"
            min-width="210"
          >
            <template #default="{ row }">
              <div>{{ row.workOrderNo }}</div>
              <div class="secondary">{{ row.batchNo }}</div>
            </template>
          </el-table-column>
          <el-table-column
            label="来源单据"
            min-width="220"
          >
            <template #default="{ row }">{{ demandSourceText(row) }}</template>
          </el-table-column>
          <el-table-column
            label="物料版本"
            min-width="190"
          >
            <template #default="{ row }">{{ variantCode(row) }}</template>
          </el-table-column>
          <el-table-column
            label="需求数量"
            width="130"
            align="right"
          >
            <template #default="{ row }">
              {{ formatQuantity(row.demandQuantity) }} {{ row.unit }}
            </template>
          </el-table-column>
          <el-table-column
            label="未完成数量"
            width="140"
            align="right"
          >
            <template #default="{ row }">
              <strong class="shortage">{{ formatQuantity(row.remainingDemandQuantity) }}</strong>
              {{ row.unit }}
            </template>
          </el-table-column>
          <el-table-column
            label="产生时间"
            width="170"
          >
            <template #default="{ row }">{{ formatDateTimeForDisplay(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
      </div>
      <PaginationFooter
        :total="demandTraceTotal"
        :current-page="demandTraceCurrentPage"
        :page-size="demandTracePageSize"
        @update:page-size="changeDemandTracePageSize"
        @page-change="changeDemandTracePage"
      />
    </el-dialog>
    <section
      v-if="viewMode === 'inventory-batches'"
      class="query-panel"
    >
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
        ><el-form-item label="物料"
          ><el-input
            v-model="query.keyword"
            clearable
            placeholder="编码或名称" /></el-form-item
        ><el-form-item label="库存批次"
          ><el-input
            v-model="query.batchCode"
            clearable
            placeholder="批次号" /></el-form-item
        ><el-form-item label="批次状态"
          ><el-select
            v-model="query.batchStatus"
            clearable
            placeholder="全部"
            ><el-option
              v-for="(label, value) in inventoryBatchStatusLabels"
              :key="value"
              :label="label"
              :value="value" /></el-select></el-form-item
        ><el-form-item class="query-actions"
          ><el-button
            type="primary"
            :loading="loading"
            @click="search"
            >查询</el-button
          ><el-button @click="reset">重置</el-button></el-form-item
        ></el-form
      >
    </section>
    <section
      v-if="viewMode === 'inventory-batches'"
      class="table-panel"
    >
      <TableToolbar :total="total"
        ><template #tools
          ><el-button
            :icon="Refresh"
            text
            circle
            :loading="loading"
            @click="load" /></template></TableToolbar
      ><el-table
        v-loading="loading"
        :data="rows"
        class="data-table"
        empty-text="暂无库存批次"
        ><el-table-column
          label="物料"
          min-width="210"
          ><template #default="{ row }"
            ><strong>{{ row.itemName }}</strong>
            <div class="secondary">{{ row.itemCode }}</div>
            <div class="variant-text">版本 {{ variantCode(row) }}</div></template
          ></el-table-column
        ><el-table-column
          prop="batchCode"
          label="库存批次"
          min-width="160"
        /><el-table-column
          label="来源"
          width="110"
          ><template #default="{ row }">{{
            inventorySourceTypeLabel(row.sourceType)
          }}</template></el-table-column
        ><el-table-column
          prop="provider"
          label="供应方"
          min-width="140"
          ><template #default="{ row }">{{ row.provider || '-' }}</template></el-table-column
        ><el-table-column
          label="账面可用量"
          width="130"
          align="right"
          ><template #default="{ row }"
            >{{ formatQuantity(row.onHandAvailableQuantity) }} {{ row.unit }}</template
          ></el-table-column
        ><el-table-column
          label="有效预留量"
          width="130"
          align="right"
          ><template #default="{ row }"
            >{{ formatQuantity(row.reservedQuantity) }} {{ row.unit }}</template
          ></el-table-column
        ><el-table-column
          label="可分配量"
          width="130"
          align="right"
          ><template #default="{ row }"
            ><strong :class="{ zero: Number(row.availableToAllocateQuantity) <= 0 }">{{
              formatQuantity(row.availableToAllocateQuantity)
            }}</strong>
            {{ row.unit }}</template
          ></el-table-column
        ><el-table-column
          label="批次状态"
          width="110"
          ><template #default="{ row }"
            ><el-tag
              :type="
                row.batchStatus === 'available' && Number(row.availableToAllocateQuantity) > 0
                  ? 'success'
                  : row.batchStatus === 'frozen'
                    ? 'warning'
                    : 'info'
              "
              >{{
                row.batchStatus === 'available' && Number(row.availableToAllocateQuantity) <= 0
                  ? '无可用库存'
                  : inventoryBatchStatusLabel(row.batchStatus)
              }}</el-tag
            ></template
          ></el-table-column
        ><el-table-column
          label="操作"
          width="80"
          fixed="right"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click="openDetail(row.itemBatchId)"
              >查看</el-button
            ></template
          ></el-table-column
        ></el-table
      >
      <PaginationFooter
        :total="total"
        :current-page="query.page ?? 1"
        :page-size="query.pageSize ?? 20"
        @update:page-size="pageSizeChanged"
        @page-change="handlePageChange"
      />
    </section>
    <el-dialog
      v-model="detailVisible"
      title="物料库存批次详情"
      :width="DialogWidth.xl"
      ><div
        v-loading="detailLoading"
        class="detail-body"
      >
        <template v-if="detail"
          ><el-descriptions
            :column="2"
            border
            ><el-descriptions-item label="物料"
              >{{ detail.itemCode }} · {{ detail.itemName }}</el-descriptions-item
            ><el-descriptions-item label="物料版本">{{ variantCode(detail) }}</el-descriptions-item
            ><el-descriptions-item label="库存批次">{{ detail.batchCode }}</el-descriptions-item
            ><el-descriptions-item label="来源">{{
              inventorySourceTypeLabel(detail.sourceType)
            }}</el-descriptions-item
            ><el-descriptions-item label="供应方">{{ detail.provider || '-' }}</el-descriptions-item
            ><el-descriptions-item label="批次状态">{{
              inventoryBatchStatusLabel(detail.batchStatus)
            }}</el-descriptions-item
            ><el-descriptions-item label="账面可用量"
              >{{ formatQuantity(detail.onHandAvailableQuantity) }}
              {{ detail.unit }}</el-descriptions-item
            ><el-descriptions-item label="有效预留量"
              >{{ formatQuantity(detail.reservedQuantity) }} {{ detail.unit }}</el-descriptions-item
            ><el-descriptions-item label="可分配量"
              >{{ formatQuantity(detail.availableToAllocateQuantity) }}
              {{ detail.unit }}</el-descriptions-item
            ><el-descriptions-item label="说明"
              >数量仅由库存流水聚合，页面不可编辑</el-descriptions-item
            ></el-descriptions
          >
          <h3>已确认入库来源</h3>
          <el-table
            :data="detail.inboundSources"
            empty-text="期初来源：该批次没有 inbound_detail 对应的已确认入库单"
            ><el-table-column
              prop="inboundNo"
              label="入库单号"
            /><el-table-column
              prop="provider"
              label="供应方"
              ><template #default="{ row }">{{ row.provider || '-' }}</template></el-table-column
            ><el-table-column
              label="确认时间"
              width="180"
              ><template #default="{ row }">{{
                formatDateTimeForDisplay(row.inboundAt)
              }}</template></el-table-column
            ><el-table-column
              label="入库数量"
              width="120"
              align="right"
              ><template #default="{ row }">{{
                formatQuantity(row.inboundQuantity)
              }}</template></el-table-column
            ><el-table-column
              label="库存流水"
              width="120"
              ><template #default="{ row }"
                >#{{ row.inventoryTransactionId }}</template
              ></el-table-column
            ></el-table
          >
          <h3>库存流水（全部正负记录）</h3>
          <el-table
            :data="detail.inventoryTransactions"
            empty-text="该库存批次暂无库存流水"
            ><el-table-column
              label="流水 ID"
              width="100"
              ><template #default="{ row }"
                >#{{ row.inventoryTransactionId }}</template
              ></el-table-column
            ><el-table-column
              label="发生时间"
              width="180"
              ><template #default="{ row }">{{
                formatDateTimeForDisplay(row.transactionAt)
              }}</template></el-table-column
            ><el-table-column
              label="流水类型"
              min-width="150"
              ><template #default="{ row }">{{
                inventoryTransactionTypeLabel(row.transactionType)
              }}</template></el-table-column
            ><el-table-column
              label="变动数量"
              width="130"
              align="right"
              ><template #default="{ row }"
                ><span
                  :class="Number(row.quantity) > 0 ? 'quantity-increase' : 'quantity-decrease'"
                >
                  {{ Number(row.quantity) > 0 ? '+' : '' }}{{ formatQuantity(row.quantity) }}
                  {{ row.unit }}
                </span></template
              ></el-table-column
            ><el-table-column
              label="库存状态"
              width="100"
              ><template #default="{ row }">{{
                stockStatusLabel(row.stockStatus)
              }}</template></el-table-column
            ><el-table-column
              label="业务来源"
              min-width="150"
              ><template #default="{ row }">
                {{ inventoryReferenceTypeLabel(row.referenceType) }} #{{ row.referenceDetailId }}
              </template></el-table-column
            ><el-table-column
              label="关联信息"
              min-width="150"
              ><template #default="{ row }">
                {{ inventoryTransactionAssociationText(row) }}
              </template></el-table-column
            ><el-table-column
              label="备注"
              min-width="140"
              ><template #default="{ row }">{{ row.remark || '-' }}</template></el-table-column
            ></el-table
          ></template
        >
      </div></el-dialog
    >
  </div>
</template>
<script setup lang="ts">
import { onActivated, onMounted, reactive, ref, watch } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import { DEMAND_GENERATION_GROUP_TYPE_LABELS } from '@company/constants';
import type {
  DemandType,
  InventoryBatchDetailItem,
  InventoryBatchItem,
  InventoryBatchQuery,
  InventoryMaterialDemandTraceItem,
} from '@company/contracts';
import { productionApi } from '../../api/production';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import {
  inventoryBatchStatusLabel,
  inventoryBatchStatusLabels,
  inventoryReferenceTypeLabel,
  inventorySourceTypeLabel,
  inventoryTransactionTypeLabel,
  stockStatusLabel,
} from '../../constants/business-status';
import { DialogWidth } from '../../utils/dialog';
import { formatDateTimeForDisplay } from '../../utils/date';
import { EMessage } from '../../utils/message';
import { formatQuantity } from '../production/production-status';
import { useInventoryMaterialSupplyDemandList } from './composables/useInventoryMaterialSupplyDemandList';
import { useInventoryMaterialDemandTrace } from './composables/useInventoryMaterialDemandTrace';
import { inventoryTransactionAssociationText } from './warehouse-inventory-presentation';
defineOptions({ name: 'WarehouseInventoryPage' });
const viewMode = ref<'supply-demand' | 'inventory-batches'>('supply-demand');
const {
  items: supplyDemandItems,
  loading: supplyDemandLoading,
  total: supplyDemandTotal,
  currentPage: supplyDemandCurrentPage,
  pageSize: supplyDemandPageSize,
  query: supplyDemandQuery,
  loadSupplyDemand,
  searchSupplyDemand,
  resetSupplyDemandQuery,
  changeSupplyDemandPageSize,
  changeSupplyDemandPage,
} = useInventoryMaterialSupplyDemandList();
const {
  visible: demandTraceVisible,
  loading: demandTraceLoading,
  selectedItem: demandTraceSelectedItem,
  items: demandTraceItems,
  total: demandTraceTotal,
  currentPage: demandTraceCurrentPage,
  pageSize: demandTracePageSize,
  open: openDemandTrace,
  changePageSize: changeDemandTracePageSize,
  changePage: changeDemandTracePage,
} = useInventoryMaterialDemandTrace();
const query = reactive<InventoryBatchQuery>({ page: 1, pageSize: 20 });
const rows = ref<InventoryBatchItem[]>([]),
  total = ref(0),
  loading = ref(false),
  detail = ref<InventoryBatchDetailItem | null>(null),
  detailLoading = ref(false),
  detailVisible = ref(false);
let token = 0;
let detailToken = 0;
const load = async () => {
  const current = ++token;
  loading.value = true;
  try {
    const r = await productionApi.listInventoryBatches({
      ...query,
      keyword: query.keyword?.trim() || undefined,
      batchCode: query.batchCode?.trim() || undefined,
    });
    if (current === token) {
      rows.value = r.items;
      total.value = r.total;
    }
  } catch (e) {
    EMessage.error(e, '库存批次加载失败');
  } finally {
    if (current === token) loading.value = false;
  }
};
const search = () => {
  query.page = 1;
  return load();
};
const reset = () => {
  query.keyword = undefined;
  query.batchCode = undefined;
  query.batchStatus = undefined;
  query.page = 1;
  return load();
};
const pageSizeChanged = (value: number) => {
  query.pageSize = value;
  query.page = 1;
  return load();
};
const handlePageChange = (value: number) => {
  query.page = value;
  return load();
};
const openDetail = async (id: string) => {
  const current = ++detailToken;
  detailVisible.value = true;
  detail.value = null;
  detailLoading.value = true;
  try {
    const result = await productionApi.getInventoryBatch(id);
    if (current === detailToken) detail.value = result;
  } catch (e) {
    if (current === detailToken) EMessage.error(e, '库存批次详情加载失败');
  } finally {
    if (current === detailToken) detailLoading.value = false;
  }
};
const demandTypeLabel = (type: DemandType): string => DEMAND_GENERATION_GROUP_TYPE_LABELS[type];
const variantCode = (row: { materialVariantCode?: string | null }): string =>
  row.materialVariantCode || '未记录版本';
const demandSourceText = (row: InventoryMaterialDemandTraceItem) => {
  if (row.demandType === 'scrap_supplement')
    return (
      [
        row.supplementNo ? `补料单 ${row.supplementNo}` : null,
        row.abnormalDispositionNo ? `异常处置 ${row.abnormalDispositionNo}` : null,
      ]
        .filter(Boolean)
        .join(' · ') || '-'
    );
  if (row.demandType === 'material_loss_supplement')
    return (
      [
        row.supplementNo ? `补料单 ${row.supplementNo}` : null,
        row.materialLossScrapNo ? `报废单 ${row.materialLossScrapNo}` : null,
      ]
        .filter(Boolean)
        .join(' · ') || '-'
    );
  if (row.demandType === 'manual_additional')
    return row.parentDemandId ? `源需求 #${row.parentDemandId}` : '人工追加';
  return row.batchNo;
};
const refreshCurrentView = () => {
  if (viewMode.value === 'inventory-batches') return load();
  return loadSupplyDemand();
};
onMounted(refreshCurrentView);
onActivated(refreshCurrentView);
watch(viewMode, (mode) => {
  if (mode === 'inventory-batches') void load();
  else void loadSupplyDemand();
});
</script>
<style scoped>
.inventory-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.shortage {
  color: #ef4444;
}
.quantity-increase {
  color: var(--el-color-success);
  font-weight: 600;
}
.quantity-decrease {
  color: var(--el-color-danger);
  font-weight: 600;
}
.supply-demand-table :deep(.el-table__row) {
  cursor: pointer;
}
.trace-link {
  color: var(--el-color-primary);
}
.query-panel,
.table-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
.query-panel {
  padding: 20px 20px 4px;
}
.query-form {
  display: flex;
  align-items: flex-start;
  gap: 10px 22px;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 16px;
}
.query-form :deep(.el-input),
.query-form :deep(.el-select) {
  width: 180px;
}
.query-actions {
  margin-left: auto;
}
.table-panel {
  overflow: hidden;
}
.table-panel :deep(.table-toolbar) {
  min-height: 56px;
  align-items: center;
  border-bottom: 1px solid #e5e7eb;
}
.data-table :deep(th.el-table__cell) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
}
.secondary {
  color: #6b7280;
  font-size: 12px;
}
.variant-text {
  color: var(--el-color-primary);
  font-size: 12px;
}
.zero {
  color: #9ca3af;
}
.table-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  min-height: 56px;
  padding: 0 16px;
  color: #6b7280;
}
.page-size-select {
  width: 78px;
}
.detail-body {
  min-height: 160px;
  max-height: 70vh;
  overflow: auto;
}
.detail-body h3 {
  margin: 18px 0 10px;
  font-size: 16px;
}
@media (max-width: 1000px) {
  .query-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(220px, 1fr));
  }
  .query-actions {
    margin-left: 0;
  }
}
</style>
