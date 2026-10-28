<template>
  <div class="inventory-page">
    <el-tabs v-model="viewMode">
      <el-tab-pane
        label="物料库存"
        name="supply-demand"
      />
      <el-tab-pane
        label="物料批次"
        name="material-batches"
      />
      <el-tab-pane
        label="成品批次"
        name="finished-product-batches"
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
            placeholder="物料编码、名称或版本编码" /></el-form-item
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
        row-key="materialVariantId"
        class="data-table supply-demand-table"
        empty-text="暂无物料库存或活动需求"
        @row-click="openDemandTrace"
        ><el-table-column
          label="物料"
          min-width="220"
          ><template #default="{ row }"
            ><strong class="trace-link">{{ row.itemName }}</strong>
            <div class="secondary">{{ row.itemCode }}</div></template
          ></el-table-column
        ><el-table-column
          label="物料版本"
          min-width="180"
          ><template #default="{ row }">{{ row.materialVariantCode }}</template></el-table-column
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
            ><strong
              class="shortage-link"
              :class="row.isShortage ? 'shortage' : 'zero'"
              >{{ formatQuantity(row.shortageQuantity) }}</strong
            >
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
      :title="`${demandTraceSelectedItem?.itemName ?? '物料'} · ${demandTraceSelectedItem?.materialVariantCode ?? ''} · 未完成需求来源`"
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
              <div class="secondary">
                需求 #{{ row.demandId
                }}<span v-if="row.replacesDemandId"> · 替代 #{{ row.replacesDemandId }}</span>
              </div>
              <el-tag
                v-if="row.pendingCorrectionId"
                type="warning"
                size="small"
                >{{ MATERIAL_DEMAND_PROGRESS_LABELS.correction_pending }}</el-tag
              >
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
      v-if="viewMode !== 'supply-demand'"
      class="query-panel"
    >
      <el-form
        class="query-form"
        :inline="true"
        :model="batchList.query"
        @submit.prevent="batchList.search"
        ><el-form-item :label="batchItemLabel"
          ><el-input
            v-model="batchList.query.keyword"
            clearable
            :placeholder="
              isMaterialBatches ? '物料名称、版本编码或基础编码' : '成品名称、编码或来源工单'
            "
        /></el-form-item>
        <el-form-item label="业务来源"
          ><el-select
            v-model="batchList.query.sourceType"
            clearable
            placeholder="全部"
            ><el-option
              v-for="(label, value) in INVENTORY_SOURCE_TYPE_LABELS"
              :key="value"
              :value="value"
              :label="label" /></el-select
        ></el-form-item>
        <el-form-item label="库存批次"
          ><el-input
            v-model="batchList.query.batchCode"
            clearable
            placeholder="批次号" /></el-form-item
        ><el-form-item label="批次状态"
          ><el-select
            v-model="batchList.query.batchStatus"
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
            :loading="batchList.loading.value"
            @click="batchList.search"
            >查询</el-button
          ><el-button @click="batchList.reset">重置</el-button></el-form-item
        ></el-form
      >
    </section>
    <section
      v-if="viewMode !== 'supply-demand'"
      class="table-panel"
    >
      <TableToolbar :total="batchList.total.value"
        ><template #tools
          ><el-button
            :icon="Refresh"
            text
            circle
            :loading="batchList.loading.value"
            @click="batchList.load" /></template
      ></TableToolbar>
      <el-alert
        v-if="batchList.error.value"
        type="error"
        :closable="false"
        title="列表读取失败；已显示的数据是上次成功结果，请刷新后核对。"
      />
      <el-table
        :key="viewMode"
        v-loading="batchList.loading.value"
        :data="batchList.items.value"
        row-key="itemBatchId"
        class="data-table"
        :empty-text="`暂无${batchItemLabel}批次`"
        ><el-table-column
          :label="batchItemLabel"
          min-width="210"
          ><template #default="{ row }"
            ><strong>{{ row.itemName }}</strong>
            <div
              v-if="isMaterialBatches"
              class="variant-text"
            >
              {{ variantCode(row) }}
            </div>
            <div
              v-else
              class="secondary"
            >
              {{ row.itemCode }}
            </div></template
          ></el-table-column
        ><el-table-column
          prop="batchCode"
          label="库存批次"
          min-width="160"
        /><el-table-column
          label="来源"
          width="110"
          ><template #default="{ row }">{{ sourceSummary(row) }}</template></el-table-column
        ><el-table-column
          :label="isMaterialBatches ? '供应方' : '来源工单 / 任务'"
          min-width="180"
          ><template #default="{ row }"
            ><template v-if="!isMaterialBatches"
              >{{ inventoryBatchWorkOrderText(row) }}
              <div class="secondary">
                {{ inventoryBatchProductionBatchText(row) }}
              </div></template
            ><span v-else>{{ inventoryBatchProviderText(row) }}</span></template
          ></el-table-column
        ><el-table-column
          label="账面可用量"
          width="130"
          align="right"
          ><template #default="{ row }"
            >{{ formatQuantity(row.onHandAvailableQuantity) }} {{ row.unit }}</template
          ></el-table-column
        ><el-table-column
          v-if="isMaterialBatches"
          label="有效预留量"
          width="130"
          align="right"
          ><template #default="{ row }"
            >{{ formatQuantity(row.reservedQuantity) }} {{ row.unit }}</template
          ></el-table-column
        ><el-table-column
          v-if="isMaterialBatches"
          label="可分配量"
          width="130"
          align="right"
          ><template #default="{ row }"
            ><strong :class="{ zero: inventoryAvailable(row) <= 0 }">{{
              formatQuantity(row.availableToAllocateQuantity)
            }}</strong>
            {{ row.unit }}</template
          ></el-table-column
        ><el-table-column
          label="批次状态"
          width="110"
          ><template #default="{ row }"
            ><el-tag :type="batchStatusTag(row)">{{
              row.batchStatus === 'available' && inventoryAvailable(row) <= 0
                ? '无可用库存'
                : inventoryBatchStatusLabel(row.batchStatus)
            }}</el-tag></template
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
        :total="batchList.total.value"
        :current-page="batchList.query.page ?? 1"
        :page-size="batchList.query.pageSize ?? 10"
        @update:page-size="batchList.changePageSize"
        @page-change="batchList.changePage"
      />
    </section>
    <el-dialog
      v-model="detailVisible"
      title="库存批次详情"
      :width="DialogWidth.workbench"
      ><div
        v-loading="detailLoading"
        class="detail-body"
      >
        <template v-if="detail"
          ><el-descriptions
            :column="2"
            border
            ><el-descriptions-item :label="INVENTORY_ITEM_KIND_LABELS[detail.itemKind]"
              >{{ detail.itemName
              }}<template v-if="detail.itemKind === 'finished_product'">
                · {{ detail.itemCode }}</template
              ></el-descriptions-item
            ><el-descriptions-item
              v-if="detail.itemKind === 'material'"
              label="物料版本"
              >{{ variantCode(detail) }}</el-descriptions-item
            ><el-descriptions-item label="库存批次">{{ detail.batchCode }}</el-descriptions-item
            ><el-descriptions-item label="来源">{{ sourceSummary(detail) }}</el-descriptions-item
            ><el-descriptions-item
              v-if="detail.itemKind === 'material'"
              label="供应方"
              >{{ inventoryBatchProviderText(detail) }}</el-descriptions-item
            ><el-descriptions-item
              v-else
              label="来源工单 / 任务"
              >{{ inventoryBatchWorkOrderText(detail) }} /
              {{ inventoryBatchProductionBatchText(detail) }}</el-descriptions-item
            ><el-descriptions-item label="批次状态">{{
              inventoryBatchStatusLabel(detail.batchStatus)
            }}</el-descriptions-item
            ><el-descriptions-item label="账面可用量"
              >{{ formatQuantity(detail.onHandAvailableQuantity) }}
              {{ detail.unit }}</el-descriptions-item
            ><el-descriptions-item
              v-if="detail.itemKind === 'material'"
              label="有效预留量"
              >{{ formatQuantity(detail.reservedQuantity) }} {{ detail.unit }}</el-descriptions-item
            ><el-descriptions-item
              v-if="detail.itemKind === 'material'"
              label="可分配量"
              >{{ formatQuantity(detail.availableToAllocateQuantity) }}
              {{ detail.unit }}</el-descriptions-item
            ><el-descriptions-item label="说明"
              >库存数量根据出入库记录自动计算，不能直接修改。<template
                v-if="detail.itemKind === 'finished_product'"
                >成品不参与物料分配和物料盘点。</template
              ></el-descriptions-item
            ></el-descriptions
          >
          <h3>已确认入库来源</h3>
          <el-table
            :data="detail.inboundSources"
            empty-text="该批次没有已确认入库单来源"
            ><el-table-column label="入库单号"
              ><template #default="{ row }"
                ><el-button
                  v-if="canOpenInbound(row.sourceType)"
                  link
                  type="primary"
                  @click="openInbound(row.inboundId, row.sourceType)"
                  >{{ row.inboundNo }}</el-button
                ><span v-else>{{ row.inboundNo }}</span></template
              ></el-table-column
            ><el-table-column
              label="来源类别"
              min-width="110"
            >
              <template #default="{ row }">{{
                inventorySourceTypeLabel(row.sourceType)
              }}</template> </el-table-column
            ><el-table-column
              label="来源授权"
              min-width="170"
            >
              <template #default="{ row }">
                <template v-if="row.productionOutputAllocationId"
                  >成品授权 #{{ row.productionOutputAllocationId }}<br />任务 #{{
                    row.productionBatchId
                  }}</template
                >
                <template v-else-if="row.procurementAllocationId"
                  >到货分配 ID：{{ row.procurementAllocationId }}<br />到货明细 #{{
                    row.procurementReceiptLineId
                  }}</template
                >
                <span v-else>入库明细 #{{ row.inboundDetailId }}</span>
              </template> </el-table-column
            ><el-table-column
              prop="provider"
              label="供应方"
              ><template #default="{ row }">{{ row.provider || '-' }}</template></el-table-column
            ><el-table-column
              label="批准清单"
              min-width="140"
              ><template #default="{ row }">{{
                row.outputRevisionNo
                  ? `第 ${row.outputRevisionNo} 版（#${row.outputRevisionId}）`
                  : '—'
              }}</template></el-table-column
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
      </div>
      <template #footer>
        <el-button
          :loading="detailLoading"
          :disabled="!selectedBatchId"
          @click="selectedBatchId && openDetail(selectedBatchId, detailOpenedFromRoute)"
          >刷新</el-button
        >
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import {
  DEMAND_GENERATION_GROUP_TYPE_LABELS,
  INVENTORY_ITEM_KIND_LABELS,
  INVENTORY_SOURCE_TYPE_LABELS,
  MATERIAL_DEMAND_PROGRESS_LABELS,
} from '@company/constants';
import type {
  DemandType,
  InventoryBatchDetailItem,
  InventoryBatchItem,
  InventoryMaterialDemandTraceItem,
  InventorySourceType,
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
import { useRouteAccess } from '../../composables/useRouteAccess';
import { useLatestReadRequest } from '../../composables/requests/useLatestReadRequest';
import { formatDateTimeForDisplay } from '../../utils/date';
import { EMessage } from '../../utils/message';
import { formatQuantity } from '../production/production-status';
import { useInventoryMaterialSupplyDemandList } from './composables/useInventoryMaterialSupplyDemandList';
import { useInventoryMaterialDemandTrace } from './composables/useInventoryMaterialDemandTrace';
import { useInventoryBatchList } from './composables/useInventoryBatchList';
import {
  inventoryBatchProductionBatchText,
  inventoryBatchProviderText,
  inventoryBatchWorkOrderText,
  inventoryInboundRouteName,
  inventoryTransactionAssociationText,
} from './warehouse-inventory-presentation';
defineOptions({ name: 'WarehouseInventoryPage' });
const route = useRoute(),
  router = useRouter();
const { canAccessRoute } = useRouteAccess();
const sourceSummary = (row: InventoryBatchItem) => {
  const kinds = [...new Set(row.inboundSources.map((source) => source.sourceType))];
  return kinds.length > 1 ? '多来源' : inventorySourceTypeLabel(kinds[0] ?? row.sourceType);
};
const inventoryAvailable = (row: InventoryBatchItem) =>
  Number(
    row.itemKind === 'finished_product'
      ? row.onHandAvailableQuantity
      : row.availableToAllocateQuantity,
  );
const batchStatusTag = (row: InventoryBatchItem) => {
  if (row.batchStatus === 'available' && inventoryAvailable(row) > 0) return 'success';
  if (row.batchStatus === 'frozen') return 'warning';
  return 'info';
};
const canOpenInbound = (sourceType: InventorySourceType): boolean => {
  const name = inventoryInboundRouteName(sourceType);
  return name !== null && canAccessRoute({ name });
};
const openInbound = (inboundId: string, sourceType: InventorySourceType) => {
  const name = inventoryInboundRouteName(sourceType);
  if (!name || !canOpenInbound(sourceType)) return;
  return router.push({ name, query: { inboundId, sourceType } });
};
const viewMode = ref<'supply-demand' | 'material-batches' | 'finished-product-batches'>(
  'supply-demand',
);
const isMaterialBatches = computed(() => viewMode.value === 'material-batches');
const materialBatches = useInventoryBatchList('material', () => isMaterialBatches.value);
const finishedProductBatches = useInventoryBatchList(
  'finished_product',
  () => viewMode.value === 'finished-product-batches',
);
const batchList = computed(() =>
  isMaterialBatches.value ? materialBatches : finishedProductBatches,
);
const batchItemLabel = computed(
  () => INVENTORY_ITEM_KIND_LABELS[isMaterialBatches.value ? 'material' : 'finished_product'],
);
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
const detail = ref<InventoryBatchDetailItem | null>(null),
  detailLoading = ref(false),
  detailVisible = ref(false);
const selectedBatchId = ref<string | null>(null);
const detailReads = useLatestReadRequest(() => {
  detailLoading.value = false;
});
const requestedBatchId = computed(() =>
  route.name === 'warehouse-inventory' && typeof route.query.itemBatchId === 'string'
    ? route.query.itemBatchId || null
    : null,
);
let detailOpenedFromRoute = false;
let consumedBatchId: string | null = null;
const openDetail = async (id: string, selectBatchTab = false): Promise<void> => {
  if (!detailReads.isActive()) return;
  selectedBatchId.value = id;
  detailOpenedFromRoute = selectBatchTab;
  detailVisible.value = true;
  detail.value = null;
  const request = detailReads.begin(
    () =>
      detailVisible.value &&
      selectedBatchId.value === id &&
      (!selectBatchTab || requestedBatchId.value === id),
  );
  detailLoading.value = true;
  try {
    const result = await productionApi.getInventoryBatch(id, request.signal);
    if (!request.isCurrent()) return;
    detail.value = result;
    if (selectBatchTab) {
      viewMode.value =
        result.itemKind === 'material' ? 'material-batches' : 'finished-product-batches';
    }
  } catch (e) {
    if (request.isCurrent()) EMessage.error(e, '库存批次详情加载失败');
  } finally {
    if (request.isCurrent()) detailLoading.value = false;
  }
};
watch(
  () => detailVisible.value,
  (visible) => {
    if (!visible) {
      selectedBatchId.value = null;
      detailReads.invalidate();
    }
  },
);
const locateBatch = (id: string | null): void => {
  if (route.name !== 'warehouse-inventory') return;
  if (!id) {
    consumedBatchId = null;
    if (detailOpenedFromRoute && detailLoading.value) detailReads.invalidate();
    return;
  }
  if (id === consumedBatchId || !detailReads.isActive()) return;
  consumedBatchId = id;
  void openDetail(id, true);
};
watch(requestedBatchId, locateBatch, { immediate: true });
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
  if (row.demandType === 'manual_additional')
    return row.parentDemandId ? `源需求 #${row.parentDemandId}` : '人工追加';
  return row.batchNo;
};
const refreshCurrentView = () => {
  if (viewMode.value === 'supply-demand') return loadSupplyDemand();
  return batchList.value.load();
};
onMounted(refreshCurrentView);
onActivated(() => {
  locateBatch(requestedBatchId.value);
});
watch(viewMode, refreshCurrentView);
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
.shortage-link {
  text-decoration: underline;
  text-underline-offset: 3px;
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
  flex-wrap: wrap;
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
.detail-body {
  min-height: 160px;
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
