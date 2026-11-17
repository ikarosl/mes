<template>
  <div class="document-orders">
    <section class="query-panel">
      <el-form
        :model="query"
        inline
        class="query-form"
        @submit.prevent="search"
      >
        <el-form-item label="关键字"
          ><el-input
            v-model="query.keyword"
            clearable
            placeholder="单号、物料、成品或来源"
        /></el-form-item>
        <el-form-item label="业务类型"
          ><el-select
            v-model="query.sourceType"
            clearable
            placeholder="全部类型"
            ><el-option
              v-for="scenario in scenarios"
              :key="scenario.sourceType"
              :label="scenario.label"
              :value="scenario.sourceType" /></el-select
        ></el-form-item>
        <el-form-item label="状态"
          ><el-select
            v-model="query.status"
            clearable
            placeholder="全部状态"
            ><el-option
              v-for="status in statuses"
              :key="status"
              :label="STOCK_DOCUMENT_STATUS_LABELS[status]"
              :value="status" /></el-select
        ></el-form-item>
        <el-form-item class="query-actions"
          ><el-button
            type="primary"
            :loading="loading"
            native-type="submit"
            >查询</el-button
          ><el-button @click="reset">重置</el-button></el-form-item
        >
      </el-form>
    </section>
    <section class="table-panel">
      <TableToolbar>
        <template #actions>
          <el-dropdown
            v-if="scenarios.length > 1"
            trigger="click"
            @command="create"
          >
            <el-button
              type="primary"
              :icon="Plus"
              >新建{{ STOCK_DOCUMENT_DIRECTION_LABELS[direction] }}单<el-icon class="dropdown-icon"
                ><ArrowDown /></el-icon
            ></el-button>
            <template #dropdown
              ><el-dropdown-menu
                ><el-dropdown-item
                  v-for="scenario in scenarios"
                  :key="scenario.sourceType"
                  :command="scenario.sourceType"
                  >{{ scenario.label }}</el-dropdown-item
                ></el-dropdown-menu
              ></template
            >
          </el-dropdown>
          <el-button
            v-else-if="scenarios[0]"
            type="primary"
            :icon="Plus"
            @click="create(scenarios[0].sourceType)"
            >新建{{ scenarios[0].label }}单</el-button
          >
        </template>
        <template #tools
          ><el-button
            :icon="Refresh"
            text
            circle
            aria-label="刷新单据"
            :loading="loading"
            @click="load"
        /></template>
      </TableToolbar>
      <el-alert
        v-if="listError"
        :title="listError"
        type="error"
        :closable="false"
      />
      <el-table
        v-loading="loading"
        :data="rows"
        row-key="id"
        class="data-table"
        empty-text="当前筛选下暂无单据"
      >
        <el-table-column
          label="单号"
          min-width="200"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click="openDetail(row.id)"
              ><strong>{{ row.orderNo }}</strong></el-button
            ></template
          ></el-table-column
        >
        <el-table-column
          label="业务类型"
          min-width="115"
          ><template #default="{ row }">{{
            scenarioLabel(row.sourceType)
          }}</template></el-table-column
        >
        <el-table-column
          label="物料 / 成品"
          min-width="230"
          show-overflow-tooltip
          ><template #default="{ row }">{{
            stockDocumentObjectSummary(row)
          }}</template></el-table-column
        >
        <el-table-column
          label="状态"
          min-width="100"
          ><template #default="{ row }"
            ><el-tag :type="stockDocumentStatusTag(row.status)">{{
              STOCK_DOCUMENT_STATUS_LABELS[row.status as StockDocumentStatus]
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column
          label="明细"
          width="80"
          align="center"
          ><template #default="{ row }">{{ row.detailCount }} 条</template></el-table-column
        >
        <el-table-column
          label="本单数量"
          min-width="150"
          ><template #default="{ row }"
            ><strong>{{ stockDocumentQuantitySummary(row) }}</strong></template
          ></el-table-column
        >
        <el-table-column
          label="来源 / 办理原因"
          min-width="210"
          show-overflow-tooltip
          ><template #default="{ row }">{{
            stockDocumentSourceSummary(row)
          }}</template></el-table-column
        >
        <el-table-column
          label="制单人 / 时间"
          min-width="185"
          ><template #default="{ row }"
            ><div>{{ row.createdByName || '—' }}</div>
            <div class="secondary">{{ formatDateTimeForDisplay(row.createdAt) }}</div></template
          ></el-table-column
        >
        <el-table-column
          label="确认人 / 时间"
          min-width="185"
          ><template #default="{ row }"
            ><div>{{ row.operatorName || '—' }}</div>
            <div class="secondary">
              {{ row.confirmedAt ? formatDateTimeForDisplay(row.confirmedAt) : '—' }}
            </div></template
          ></el-table-column
        >
        <el-table-column
          label="操作"
          width="190"
          fixed="right"
          ><template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="openDetail(row.id)"
              >详情</el-button
            ><el-button
              link
              type="primary"
              @click="print(row)"
              >打印</el-button
            >
            <el-dropdown
              v-if="isPending(row)"
              trigger="click"
              @command="act($event, row)"
              ><el-button
                link
                type="primary"
                >更多<el-icon><ArrowDown /></el-icon></el-button
              ><template #dropdown
                ><el-dropdown-menu
                  ><el-dropdown-item
                    v-if="row.sourceType === 'other'"
                    command="edit"
                    >编辑草稿</el-dropdown-item
                  ><el-dropdown-item command="confirm"
                    >确认{{ STOCK_DOCUMENT_DIRECTION_LABELS[direction] }}</el-dropdown-item
                  ><el-dropdown-item command="cancel">取消</el-dropdown-item></el-dropdown-menu
                ></template
              ></el-dropdown
            >
          </template></el-table-column
        >
      </el-table>
      <PaginationFooter
        :total="total"
        :current-page="query.page ?? 1"
        :page-size="query.pageSize ?? 10"
        @page-change="changePage"
        @update:page-size="changePageSize"
      />
    </section>
    <StockDocumentDetailDialog
      v-model:visible="detailVisible"
      :direction="direction"
      :order="detail"
      :loading="detailLoading"
      :error="detailError"
      :detail-id="selectedDetailId"
      @refresh="refreshDetail"
    />
    <OtherInventoryOrderDialog
      v-if="canUse('other')"
      :direction="direction"
      :editor="otherEditor"
    />
    <PurchaseInboundCreateDialog
      v-if="canUse('purchased')"
      ref="purchaseCreate"
      :tab-name="tabName"
      @changed="afterWrite"
    />
    <FinishedGoodsInboundCreateDialog
      v-if="canUse('finished_product')"
      ref="finishedCreate"
      :tab-name="tabName"
      @changed="afterWrite"
    />
    <ProductionOutboundActions
      v-if="canUse('production_material')"
      ref="outboundActions"
      :tab-name="tabName"
      @changed="afterWrite"
    />
    <ProductionReturnActions
      v-if="canUse('return_inbound')"
      ref="returnActions"
      :tab-name="tabName"
      @changed="afterWrite"
    />
    <el-dialog
      v-model="legacyBatchVisible"
      title="选择要查看的入库单"
      :width="DialogWidth.lg"
    >
      <el-alert
        v-if="legacyError"
        :title="legacyError"
        type="error"
        :closable="false"
      />
      <el-table
        v-loading="legacyLoading"
        :data="legacySources"
        row-key="inboundDetailId"
        ><el-table-column
          label="入库单号"
          min-width="190"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click="openLegacyDocument(row.inboundId, row.inboundDetailId)"
              >{{ row.inboundNo }}</el-button
            ></template
          ></el-table-column
        ><el-table-column
          label="入库数量"
          min-width="120"
          ><template #default="{ row }"
            >{{ row.inboundQuantity }} {{ legacyUnit }}</template
          ></el-table-column
        ></el-table
      >
      <template #footer><el-button @click="legacyBatchVisible = false">关闭</el-button></template>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onActivated, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowDown, Plus, Refresh } from '@element-plus/icons-vue';
import type {
  InventoryBatchItem,
  StockDocumentDirection,
  StockDocumentItemKind,
  StockDocumentOrder,
  StockDocumentQuery,
  StockDocumentSourceType,
  StockDocumentStatus,
} from '@company/contracts';
import {
  STOCK_DOCUMENT_DIRECTION_LABELS,
  STOCK_DOCUMENT_SCENARIOS,
  STOCK_DOCUMENT_STATUS_LABELS,
} from '@company/constants';
import { stockDocumentsApi } from '../../api/stock-documents';
import { productionInventoryApi } from '../../api/production/inventory';
import { useAuthStore } from '../../stores/auth';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { useLatestReadRequest } from '../../composables/requests/useLatestReadRequest';
import { usePageInitialLoad } from '../../composables/requests/usePageInitialLoad';
import { formatDateTimeForDisplay } from '../../utils/date';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';
import { useOtherInventoryOrderEditor } from './composables/useOtherInventoryOrderEditor';
import { stockDocumentRoute, stockDocumentTabName } from './stock-document-navigation';
import {
  printStockDocument,
  stockDocumentObjectSummary,
  stockDocumentQuantitySummary,
  stockDocumentSourceSummary,
  stockDocumentStatusTag,
} from './stock-document-presentation';
import StockDocumentDetailDialog from './components/StockDocumentDetailDialog.vue';
import OtherInventoryOrderDialog from './components/OtherInventoryOrderDialog.vue';
import PurchaseInboundCreateDialog from './components/PurchaseInboundCreateDialog.vue';
import FinishedGoodsInboundCreateDialog from './components/FinishedGoodsInboundCreateDialog.vue';
import ProductionOutboundActions from './components/ProductionOutboundActions.vue';
import ProductionReturnActions from './components/ProductionReturnActions.vue';
defineOptions({ name: 'StockDocumentOrdersPanel' });
const props = defineProps<{ itemKind: StockDocumentItemKind; direction: StockDocumentDirection }>();
const route = useRoute(),
  router = useRouter(),
  auth = useAuthStore();
const routeName = String(route.name);
const tabName = stockDocumentTabName(props.itemKind);
const query = reactive<StockDocumentQuery>({
  direction: props.direction,
  itemKind: props.itemKind,
  page: 1,
  pageSize: 10,
});
const rows = ref<StockDocumentOrder[]>([]),
  total = ref(0),
  loading = ref(false),
  listError = ref('');
const scenarios = computed(() =>
  STOCK_DOCUMENT_SCENARIOS.filter(
    (scenario) =>
      scenario.direction === props.direction &&
      scenario.itemKind === props.itemKind &&
      auth.can(scenario.viewPermission),
  ),
);
const canUse = (sourceType: StockDocumentSourceType): boolean =>
  scenarios.value.some((scenario) => scenario.sourceType === sourceType);
const statuses: StockDocumentStatus[] = [
  props.direction === 'inbound' ? 'pending' : 'pending_picking',
  'completed',
  'cancelled',
];
const scenarioLabel = (sourceType: StockDocumentSourceType): string =>
  scenarios.value.find((scenario) => scenario.sourceType === sourceType)?.label ?? '—';
const listRead = useLatestReadRequest(() => {
  loading.value = false;
});
const detailRead = useLatestReadRequest(() => {
  detailLoading.value = false;
});
const printRead = useLatestReadRequest(() => undefined);
const detail = ref<StockDocumentOrder | null>(null),
  detailVisible = ref(false),
  detailLoading = ref(false),
  detailError = ref('');
const selectedId = ref(''),
  selectedDetailId = ref('');
const purchaseCreate = ref<InstanceType<typeof PurchaseInboundCreateDialog> | null>(null);
const finishedCreate = ref<InstanceType<typeof FinishedGoodsInboundCreateDialog> | null>(null);
const outboundActions = ref<InstanceType<typeof ProductionOutboundActions> | null>(null);
const returnActions = ref<InstanceType<typeof ProductionReturnActions> | null>(null);
const otherEditor = useOtherInventoryOrderEditor(
  props.direction,
  tabName,
  afterWrite,
  props.itemKind,
);
async function load(): Promise<void> {
  if (!listRead.isActive()) return;
  const current = listRead.begin();
  loading.value = true;
  try {
    const result = await stockDocumentsApi.list(
      { ...query, keyword: query.keyword?.trim() || undefined },
      current.signal,
    );
    if (!current.isCurrent()) return;
    rows.value = result.items;
    total.value = result.total;
    listError.value = '';
  } catch (error) {
    if (current.isCurrent()) {
      listError.value = '单据列表读取失败；已显示内容为上次结果，请刷新核对。';
      EMessage.error(error, '单据列表读取失败');
    }
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
}
async function search(): Promise<void> {
  query.page = 1;
  await load();
}
async function reset(): Promise<void> {
  query.keyword = undefined;
  query.sourceType = undefined;
  query.status = undefined;
  await search();
}
async function changePage(value: number): Promise<void> {
  query.page = value;
  await load();
}
async function changePageSize(value: number): Promise<void> {
  query.pageSize = value;
  await search();
}
const isPending = (order: StockDocumentOrder): boolean =>
  order.status === 'pending' || order.status === 'pending_picking';
async function afterWrite(): Promise<void> {
  if (!listRead.isActive()) return;
  await load();
  if (detailVisible.value) await refreshDetail();
}
async function create(sourceType: StockDocumentSourceType): Promise<void> {
  if (!canUse(sourceType)) return;
  await nextTick();
  if (sourceType === 'other') await otherEditor.open('create');
  else if (sourceType === 'purchased') await purchaseCreate.value?.open();
  else if (sourceType === 'finished_product') await finishedCreate.value?.open();
  else if (sourceType === 'production_material') await outboundActions.value?.open();
  else if (sourceType === 'return_inbound') await returnActions.value?.open();
}
async function act(action: string, order: StockDocumentOrder): Promise<void> {
  if (!canUse(order.sourceType) || !isPending(order)) return;
  if (
    order.sourceType === 'other' &&
    (action === 'edit' || action === 'confirm' || action === 'cancel')
  )
    await otherEditor.open(action, order.id);
  else if (order.sourceType === 'production_material') {
    if (action === 'confirm') await outboundActions.value?.confirm(order.id);
    else if (action === 'cancel') await outboundActions.value?.cancel(order.id);
  } else if (order.sourceType === 'return_inbound') {
    if (action === 'confirm') await returnActions.value?.confirm(order.id);
    else if (action === 'cancel') await returnActions.value?.cancel(order.id);
  }
}
let consumedLocation = '';
async function openDetail(id: string, detailId = '', syncLocation = true): Promise<void> {
  if (!detailRead.isActive()) return;
  selectedId.value = id;
  selectedDetailId.value = detailId;
  detailVisible.value = true;
  detail.value = null;
  detailError.value = '';
  const current = detailRead.begin(() => detailVisible.value && selectedId.value === id);
  detailLoading.value = true;
  try {
    const result = await stockDocumentsApi.get(props.direction, id, current.signal);
    if (!current.isCurrent()) return;
    if (result.direction !== props.direction) throw new Error('单据出入库方向与定位不符');
    if (result.itemKind !== props.itemKind) {
      detailVisible.value = false;
      await router.replace(
        stockDocumentRoute(
          result.itemKind,
          result.direction,
          id,
          result.sourceType,
          detailId || undefined,
        ),
      );
      return;
    }
    if (!canUse(result.sourceType)) throw new Error('无该业务场景的查看权限');
    detail.value = result;
    if (syncLocation && route.name === routeName) {
      consumedLocation = JSON.stringify([id, detailId]);
      await router.replace({
        name: routeName,
        query: { documentId: id, sourceType: result.sourceType, detailId: detailId || undefined },
      });
    }
  } catch (error) {
    if (current.isCurrent()) {
      detailError.value = error instanceof Error ? error.message : '单据详情读取失败';
      EMessage.error(error, '单据详情读取失败');
    }
  } finally {
    if (current.isCurrent()) detailLoading.value = false;
  }
}
async function refreshDetail(): Promise<void> {
  if (selectedId.value) await openDetail(selectedId.value, selectedDetailId.value, false);
}
watch(detailVisible, (visible) => {
  if (!visible) detailRead.invalidate();
});
async function print(order: StockDocumentOrder): Promise<void> {
  if (!printRead.isActive()) return;
  const current = printRead.begin();
  try {
    const result = await stockDocumentsApi.get(order.direction, order.id, current.signal);
    if (current.isCurrent()) printStockDocument(result);
  } catch (error) {
    if (current.isCurrent()) EMessage.error(error, '打印数据读取失败');
  }
}
const legacyBatchVisible = ref(false),
  legacyLoading = ref(false),
  legacyError = ref(''),
  legacyUnit = ref('');
const legacySources = ref<InventoryBatchItem['inboundSources']>([]);
const legacyRead = useLatestReadRequest(() => {
  legacyLoading.value = false;
});
async function showLegacyBatch(id: string): Promise<void> {
  if (!legacyRead.isActive()) return;
  legacyBatchVisible.value = true;
  legacyError.value = '';
  legacySources.value = [];
  const current = legacyRead.begin(() => legacyBatchVisible.value);
  legacyLoading.value = true;
  try {
    const result = await productionInventoryApi.getInventoryBatch(id, current.signal);
    if (current.isCurrent()) {
      legacySources.value = result.inboundSources.filter(
        (source) => source.sourceType === 'finished_product',
      );
      legacyUnit.value = result.unit;
    }
  } catch (error) {
    if (current.isCurrent())
      legacyError.value = error instanceof Error ? error.message : '入库来源读取失败';
  } finally {
    if (current.isCurrent()) legacyLoading.value = false;
  }
}
async function openLegacyDocument(id: string, detailId: string): Promise<void> {
  legacyBatchVisible.value = false;
  await openDetail(id, detailId);
}
watch(legacyBatchVisible, (visible) => {
  if (!visible) legacyRead.invalidate();
});
async function locate(): Promise<void> {
  if (route.name !== routeName || !detailRead.isActive()) return;
  const id = typeof route.query.documentId === 'string' ? route.query.documentId : '';
  const detailId = typeof route.query.detailId === 'string' ? route.query.detailId : '';
  const receiptLineId =
    typeof route.query.receiptLineId === 'string' ? route.query.receiptLineId : '';
  const batchId =
    typeof route.query.inventoryBatchId === 'string' ? route.query.inventoryBatchId : '';
  const token = id ? JSON.stringify([id, detailId]) : JSON.stringify([receiptLineId, batchId]);
  if (token === consumedLocation) return;
  consumedLocation = token;
  if (id) await openDetail(id, detailId, false);
  else if (receiptLineId && canUse('purchased')) {
    await nextTick();
    await purchaseCreate.value?.open(receiptLineId);
  } else if (batchId && canUse('finished_product')) await showLegacyBatch(batchId);
}
watch(
  () => [
    route.name,
    route.query.documentId,
    route.query.detailId,
    route.query.receiptLineId,
    route.query.inventoryBatchId,
  ],
  () => {
    void locate();
  },
);
onActivated(() => {
  void locate();
});
usePageInitialLoad(async () => {
  await load();
  await locate();
});
</script>
<style scoped>
.document-orders {
  display: grid;
  gap: 16px;
}
.query-panel,
.table-panel {
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-bg-color);
}
.query-panel {
  padding: 16px 16px 0;
}
.query-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0 20px;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 16px;
}
.query-form :deep(.el-input) {
  width: 260px;
}
.query-form :deep(.el-select) {
  width: 150px;
}
.query-actions {
  margin-left: auto;
}
.table-panel {
  overflow: hidden;
}
.data-table :deep(th.el-table__cell) {
  height: 48px;
  background: var(--el-fill-color-light);
}
.secondary {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 4px;
}
.dropdown-icon {
  margin-left: 6px;
}
.data-table :deep(.el-dropdown) {
  margin-left: 12px;
  vertical-align: middle;
}
</style>
