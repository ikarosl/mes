<template>
  <section class="pending-outputs">
    <InlineHint
      >选择任务后核对待入库产出，可将多盘产出合并至同一批次。终检确认不增加库存，成品入库确认后才计入库存。</InlineHint
    >
    <el-form
      :inline="true"
      class="query-form"
      @submit.prevent="search"
    >
      <el-form-item label="关键字"
        ><el-input
          v-model="keyword"
          clearable
          placeholder="任务号 / 工单号 / 成品"
          @keyup.enter="search"
      /></el-form-item>
      <el-form-item
        ><el-button
          type="primary"
          :loading="loading"
          @click="search"
          >查询</el-button
        ><el-button @click="reset">重置</el-button></el-form-item
      >
    </el-form>
    <section class="table-panel">
      <TableToolbar
        ><template #actions><span>待入库产出</span></template
        ><template #tools
          ><el-button
            :icon="Refresh"
            text
            :loading="loading"
            @click="load"
            >刷新</el-button
          ></template
        ></TableToolbar
      >
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        show-icon
      />
      <el-table
        v-loading="loading"
        :data="items"
        row-key="id"
        empty-text="暂无待入库成品产出"
      >
        <el-table-column
          label="任务 / 工单"
          min-width="185"
          ><template #default="{ row }"
            ><strong>{{ row.batchNo }}</strong>
            <div class="secondary">{{ row.workOrderNo }}</div></template
          ></el-table-column
        >
        <el-table-column
          label="成品"
          min-width="195"
          ><template #default="{ row }"
            ><strong>{{ row.productName }}</strong>
            <div class="secondary">{{ row.productCode }}</div></template
          ></el-table-column
        >
        <el-table-column
          label="产出来源"
          min-width="165"
          ><template #default="{ row }"
            >{{ row.cardNo || '研发产出' }}
            <div class="secondary">产出记录 #{{ row.id }}</div></template
          ></el-table-column
        >
        <el-table-column
          label="待入库数量"
          width="130"
          align="right"
          ><template #default="{ row }"
            >{{ formatQuantity(row.quantity) }} {{ row.unit }}</template
          ></el-table-column
        >
        <el-table-column
          label="终检登记人 / 时间"
          min-width="180"
          ><template #default="{ row }"
            >{{ row.personnelName }}
            <div class="secondary">{{ formatDateTimeForDisplay(row.confirmedAt) }}</div></template
          ></el-table-column
        >
        <el-table-column
          label="操作"
          width="130"
          fixed="right"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click="openInbound(row)"
              >核对任务入库</el-button
            ></template
          ></el-table-column
        >
      </el-table>
      <PaginationFooter
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        @page-change="changePage"
        @update:page-size="changePageSize"
      />
    </section>
    <TaskOutputDialog
      v-model:visible="inboundVisible"
      :batch="inboundBatch"
      route-name="warehouse-inbound"
      @changed="handleChanged"
    />
  </section>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import type { ProductionOutputItem } from '@company/contracts';
import { productionOutputsApi } from '../../../api/production/outputs';
import InlineHint from '../../../components/InlineHint.vue';
import TableToolbar from '../../../components/TableToolbar.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { usePageInitialLoad } from '../../../composables/requests/usePageInitialLoad';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../../utils/quantity';
import { TaskOutputDialog } from '../../production/public';

defineOptions({ name: 'FinishedGoodsOutputPanel' });
const emit = defineEmits<{ changed: [] }>();
const items = ref<ProductionOutputItem[]>([]),
  total = ref(0),
  page = ref(1),
  pageSize = ref(10),
  keyword = ref(''),
  loading = ref(false),
  error = ref('');
const inboundVisible = ref(false),
  inboundBatch = ref<{ id: string } | null>(null);
const reads = useLatestReadRequest(() => {
  loading.value = false;
});
async function load(): Promise<void> {
  if (!reads.isActive()) return;
  const read = reads.begin();
  loading.value = true;
  error.value = '';
  try {
    const result = await productionOutputsApi.list(
      {
        status: 'pending_inbound',
        keyword: keyword.value.trim() || undefined,
        page: page.value,
        pageSize: pageSize.value,
      },
      { signal: read.signal, skipErrorHandling: true },
    );
    if (read.isCurrent()) {
      items.value = result.items;
      total.value = result.total;
    }
  } catch (failure) {
    if (read.isCurrent())
      error.value = failure instanceof Error ? failure.message : '待入库产出读取失败，请重试';
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
function openInbound(item: ProductionOutputItem): void {
  if (inboundVisible.value) return;
  inboundBatch.value = { id: item.productionBatchId };
  inboundVisible.value = true;
}
async function handleChanged(): Promise<void> {
  emit('changed');
  await load();
}
usePageInitialLoad(load);
</script>
<style scoped>
.pending-outputs {
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
  margin-top: 4px;
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.6;
}
</style>
