<template>
  <div class="inventory-page">
    <section class="query-panel">
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
    <section class="table-panel">
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
            <div class="secondary">{{ row.itemCode }}</div></template
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
      <div class="table-footer">
        <span>共 {{ total }} 条</span
        ><el-select
          v-model="query.pageSize"
          class="page-size-select"
          @change="pageSizeChanged"
          ><el-option
            label="10条/页"
            :value="10" /><el-option
            label="20条/页"
            :value="20" /><el-option
            label="50条/页"
            :value="50" /></el-select
        ><el-pagination
          v-model:current-page="query.page"
          :page-size="query.pageSize"
          :total="total"
          layout="prev,pager,next,jumper"
          @current-change="load"
        />
      </div>
    </section>
    <el-dialog
      v-model="detailVisible"
      title="物料库存批次详情"
      :width="DialogWidth.lg"
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
            ><el-descriptions-item label="库存批次">{{ detail.batchCode }}</el-descriptions-item
            ><el-descriptions-item label="来源">{{
              inventorySourceTypeLabel(detail.sourceType)
            }}</el-descriptions-item
            ><el-descriptions-item label="供应方">{{ detail.provider || '-' }}</el-descriptions-item
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
              label="正库存流水"
              width="120"
              ><template #default="{ row }"
                >#{{ row.inventoryTransactionId }}</template
              ></el-table-column
            ></el-table
          ></template
        >
      </div></el-dialog
    >
  </div>
</template>
<script setup lang="ts">
import { onActivated, onMounted, reactive, ref } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import type { InventoryBatchItem, InventoryBatchQuery } from '@company/contracts';
import { productionApi } from '../../api/production';
import TableToolbar from '../../components/TableToolbar.vue';
import {
  inventoryBatchStatusLabel,
  inventoryBatchStatusLabels,
  inventorySourceTypeLabel,
} from '../../constants/business-status';
import { DialogWidth } from '../../utils/dialog';
import { formatDateTimeForDisplay } from '../../utils/date';
import { EMessage } from '../../utils/message';
import { formatQuantity } from '../production/production-status';
defineOptions({ name: 'WarehouseInventoryPage' });
const query = reactive<InventoryBatchQuery>({ page: 1, pageSize: 20 });
const rows = ref<InventoryBatchItem[]>([]),
  total = ref(0),
  loading = ref(false),
  detail = ref<InventoryBatchItem | null>(null),
  detailLoading = ref(false),
  detailVisible = ref(false);
let token = 0;
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
const pageSizeChanged = () => {
  query.page = 1;
  return load();
};
const openDetail = async (id: string) => {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    detail.value = await productionApi.getInventoryBatch(id);
  } catch (e) {
    EMessage.error(e, '库存批次详情加载失败');
  } finally {
    detailLoading.value = false;
  }
};
onMounted(load);
onActivated(load);
</script>
<style scoped>
.inventory-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
