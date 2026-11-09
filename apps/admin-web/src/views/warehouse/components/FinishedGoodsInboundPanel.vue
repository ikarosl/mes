<template>
  <section class="finished-history">
    <InlineHint
      >终检确认正数产出时同时完成入库。这里按成品库存批次查询入库记录，库存补差不会改写原始终检产出。</InlineHint
    >
    <el-form
      :inline="true"
      class="query-form"
      @submit.prevent="search"
      ><el-form-item label="关键字"
        ><el-input
          v-model="keyword"
          clearable
          placeholder="成品编码 / 名称 / 批次"
          @keyup.enter="search" /></el-form-item
      ><el-form-item
        ><el-button
          type="primary"
          :loading="loading"
          @click="search"
          >查询</el-button
        ><el-button @click="reset">重置</el-button></el-form-item
      ></el-form
    >
    <div class="table-panel">
      <TableToolbar
        ><template #actions><span>成品入库记录</span></template
        ><template #tools
          ><el-button
            :icon="Refresh"
            text
            :loading="loading"
            @click="load"
            >刷新</el-button
          ></template
        ></TableToolbar
      ><el-alert
        v-if="error"
        :title="error"
        type="error"
        show-icon
        :closable="false"
      />
      <el-table
        v-loading="loading"
        :data="items"
        row-key="itemBatchId"
        ><el-table-column
          prop="batchCode"
          label="成品库存批次"
          min-width="190"
        /><el-table-column
          label="成品"
          min-width="210"
          ><template #default="{ row }"
            ><strong>{{ row.itemName }}</strong>
            <div class="secondary">{{ row.itemCode }}</div></template
          ></el-table-column
        ><el-table-column
          prop="sourceProductionBatchNo"
          label="来源任务"
          min-width="170"
        /><el-table-column
          label="入库累计"
          width="130"
          align="right"
          ><template #default="{ row }"
            >{{ formatQuantity(inboundQuantity(row)) }} {{ row.unit }}</template
          ></el-table-column
        ><el-table-column
          label="当前可用库存"
          width="150"
          align="right"
          ><template #default="{ row }"
            >{{ formatQuantity(row.onHandAvailableQuantity) }} {{ row.unit }}</template
          ></el-table-column
        ><el-table-column
          label="操作"
          width="120"
          fixed="right"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click="openDetail(row.itemBatchId)"
              >入库记录</el-button
            ></template
          ></el-table-column
        ></el-table
      >
      <PaginationFooter
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        @page-change="changePage"
        @update:page-size="changePageSize"
      />
    </div>
    <el-dialog
      v-model="detailVisible"
      title="成品批次入库记录"
      :width="DialogWidth.xl"
      ><el-alert
        v-if="detailError"
        :title="detailError"
        type="error"
        show-icon
        :closable="false"
      />
      <div v-loading="detailLoading">
        <template v-if="detail"
          ><el-descriptions
            :column="2"
            border
            ><el-descriptions-item label="库存批次">{{ detail.batchCode }}</el-descriptions-item
            ><el-descriptions-item label="成品"
              >{{ detail.itemCode }} / {{ detail.itemName }}</el-descriptions-item
            ><el-descriptions-item label="来源任务">{{
              detail.sourceProductionBatchNo || '—'
            }}</el-descriptions-item
            ><el-descriptions-item label="当前可用库存"
              >{{ formatQuantity(detail.onHandAvailableQuantity) }}
              {{ detail.unit }}</el-descriptions-item
            ></el-descriptions
          ><el-table
            :data="detail.inboundSources"
            row-key="inboundDetailId"
            ><el-table-column
              prop="inboundNo"
              label="入库单号"
              min-width="190"
            /><el-table-column
              label="终检确认来源"
              min-width="160"
              ><template #default="{ row }">{{
                row.productionOutputId ? '产出确认 #' + row.productionOutputId : '—'
              }}</template></el-table-column
            ><el-table-column
              label="入库时间"
              min-width="180"
              ><template #default="{ row }">{{
                formatDateTimeForDisplay(row.inboundAt)
              }}</template></el-table-column
            ><el-table-column
              label="入库数量"
              width="135"
              align="right"
              ><template #default="{ row }"
                >{{ formatQuantity(row.inboundQuantity) }} {{ detail.unit }}</template
              ></el-table-column
            ></el-table
          ><el-button
            v-if="detail.sourceProductionBatchId && canAccessRoute({ name: 'production-tracking' })"
            class="tracking-link"
            type="primary"
            plain
            @click="openTracking"
            >查看任务工序追踪</el-button
          ></template
        >
      </div>
      <template #footer
        ><el-button @click="detailVisible = false">关闭</el-button></template
      ></el-dialog
    >
  </section>
</template>
<script setup lang="ts">
import { onActivated, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import type { InventoryBatchDetailItem, InventoryBatchItem } from '@company/contracts';
import { productionInventoryApi } from '../../../api/production/inventory';
import InlineHint from '../../../components/InlineHint.vue';
import TableToolbar from '../../../components/TableToolbar.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { usePageInitialLoad } from '../../../composables/requests/usePageInitialLoad';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../../utils/quantity';
defineOptions({ name: 'FinishedGoodsInboundPanel' });
const props = defineProps<{ active: boolean; requestedInventoryBatchId?: string | null }>();
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
const items = ref<InventoryBatchItem[]>([]),
  total = ref(0),
  page = ref(1),
  pageSize = ref(10),
  keyword = ref(''),
  loading = ref(false),
  error = ref('');
const reads = useLatestReadRequest(() => {
  loading.value = false;
});
async function load(): Promise<void> {
  if (!props.active || !reads.isActive()) return;
  const read = reads.begin(() => props.active);
  loading.value = true;
  error.value = '';
  try {
    const result = await productionInventoryApi.listInventoryBatches(
      {
        itemKind: 'finished_product',
        sourceType: 'finished_product',
        page: page.value,
        pageSize: pageSize.value,
        keyword: keyword.value.trim() || undefined,
      },
      read.signal,
    );
    if (read.isCurrent()) {
      items.value = result.items;
      total.value = result.total;
    }
  } catch (failure) {
    if (read.isCurrent())
      error.value = failure instanceof Error ? failure.message : '成品入库记录加载失败';
  } finally {
    if (read.isCurrent()) loading.value = false;
  }
}
async function search(): Promise<void> {
  page.value = 1;
  await load();
}
async function reset(): Promise<void> {
  keyword.value = '';
  await search();
}
async function changePage(value: number): Promise<void> {
  page.value = value;
  await load();
}
async function changePageSize(value: number): Promise<void> {
  pageSize.value = value;
  await search();
}
const inboundQuantity = (item: InventoryBatchItem): number =>
  item.inboundSources.reduce((sum, source) => sum + Number(source.inboundQuantity), 0);
const detail = ref<InventoryBatchDetailItem | null>(null),
  detailVisible = ref(false),
  detailLoading = ref(false),
  detailError = ref('');
const detailReads = useLatestReadRequest(() => {
  detailLoading.value = false;
});
let selectedId = '';
async function openDetail(id: string): Promise<void> {
  if (!props.active || !detailReads.isActive()) return;
  selectedId = id;
  detailVisible.value = true;
  detail.value = null;
  detailError.value = '';
  const read = detailReads.begin(() => detailVisible.value && selectedId === id);
  detailLoading.value = true;
  try {
    const value = await productionInventoryApi.getInventoryBatch(id, read.signal);
    if (read.isCurrent()) detail.value = value;
  } catch (failure) {
    if (read.isCurrent())
      detailError.value = failure instanceof Error ? failure.message : '入库记录详情加载失败';
  } finally {
    if (read.isCurrent()) detailLoading.value = false;
  }
}
watch(detailVisible, (visible) => {
  if (!visible) detailReads.invalidate();
});
let consumedLocation = '';
function locate(): void {
  const id = props.requestedInventoryBatchId;
  if (!id || !props.active || !detailReads.isActive() || id === consumedLocation) return;
  consumedLocation = id;
  void openDetail(id);
}
watch(() => [props.active, props.requestedInventoryBatchId], locate);
onActivated(locate);
async function openTracking(): Promise<void> {
  const id = detail.value?.sourceProductionBatchId;
  if (id) await router.push({ name: 'production-tracking', query: { batchId: id } });
}
usePageInitialLoad(async () => {
  await load();
  locate();
});
</script>
<style scoped>
.finished-history {
  display: grid;
  gap: 16px;
}
.query-form {
  padding: 16px 20px 0;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.table-panel {
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.table-panel :deep(.el-table__header th) {
  background: var(--el-fill-color-light);
}
.secondary {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
.tracking-link {
  margin-top: 16px;
}
</style>
