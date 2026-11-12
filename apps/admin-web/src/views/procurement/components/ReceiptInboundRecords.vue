<template>
  <section>
    <el-alert
      v-if="readError"
      title="入库记录读取失败，已显示内容为上次结果。请刷新后核对。"
      type="error"
      :closable="false"
      class="records-notice"
    />
    <el-table
      v-loading="loading"
      :data="rows"
      row-key="inboundDetailId"
    >
      <template #empty>{{ emptyText }}</template>
      <el-table-column
        prop="inboundNo"
        label="入库单号"
        min-width="180"
      />
      <el-table-column
        prop="batchCode"
        label="库存批次"
        min-width="160"
      />
      <el-table-column
        label="入库数量"
        width="130"
        align="right"
      >
        <template #default="{ row }">{{ formatQuantity(row.quantity) }} {{ unit }}</template>
      </el-table-column>
      <el-table-column
        label="入库时间"
        width="180"
      >
        <template #default="{ row }">{{ formatDateTimeForDisplay(row.confirmedAt) }}</template>
      </el-table-column>
    </el-table>
    <PaginationFooter
      :total="total"
      :current-page="page"
      :page-size="pageSize"
      :disabled="loading"
      total-suffix="条入库明细"
      @page-change="changePage"
      @update:page-size="changePageSize"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ReceiptInboundHistoryItem } from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import { formatQuantity } from '../../../utils/quantity';

const props = defineProps<{ receiptLineId: string; unit: string; active: boolean }>();
const rows = ref<ReceiptInboundHistoryItem[]>([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const loading = ref(false);
const readError = ref(false);
let attempted = false;
const loaded = ref(false);
const read = useLatestReadRequest(() => {
  loading.value = false;
});
const emptyText = computed(() => {
  if (loading.value) return '正在读取入库记录';
  if (readError.value) return '入库记录读取失败';
  if (!loaded.value) return '尚未读取入库记录，请刷新';
  return '暂无入库记录';
});

async function refresh(): Promise<void> {
  if (!props.active || !props.receiptLineId || !read.isActive()) return;
  const target = props.receiptLineId;
  const requestedPage = page.value;
  const requestedSize = pageSize.value;
  const current = read.begin(
    () =>
      props.active &&
      props.receiptLineId === target &&
      page.value === requestedPage &&
      pageSize.value === requestedSize,
  );
  attempted = true;
  loading.value = true;
  try {
    const result = await procurementApi.receiptInbounds(
      target,
      { page: requestedPage, pageSize: requestedSize },
      current.signal,
    );
    if (!current.isCurrent()) return;
    rows.value = result.items;
    total.value = result.total;
    loaded.value = true;
    readError.value = false;
  } catch (error) {
    if (current.isCurrent()) {
      readError.value = true;
      EMessage.error(error, '入库记录读取失败');
    }
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
}
async function changePage(value: number): Promise<void> {
  if (value === page.value) return;
  rows.value = [];
  loaded.value = false;
  readError.value = false;
  page.value = value;
  await refresh();
}
async function changePageSize(value: number): Promise<void> {
  if (value === pageSize.value) return;
  rows.value = [];
  loaded.value = false;
  readError.value = false;
  pageSize.value = value;
  page.value = 1;
  await refresh();
}
watch(
  () => ({ id: props.receiptLineId, active: props.active }),
  (current, previous) => {
    if (current.id !== previous?.id) {
      read.invalidate();
      page.value = 1;
      total.value = 0;
      rows.value = [];
      readError.value = false;
      loaded.value = false;
      attempted = false;
    }
    if (!current.active) read.invalidate();
    else if (current.id && !attempted) void refresh();
  },
  { immediate: true },
);
defineExpose({ refresh });
</script>

<style scoped>
.records-notice {
  margin-bottom: 12px;
}
</style>
