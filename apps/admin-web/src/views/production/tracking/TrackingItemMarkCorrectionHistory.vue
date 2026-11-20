<template>
  <section class="correction-history">
    <div class="history-heading">
      <strong>刻码更正记录 · 当前实际刻码 {{ item.markCode }}</strong>
      <el-button
        :loading="loading"
        @click="load"
        >刷新记录</el-button
      >
    </div>
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
      border
      empty-text="暂无刻码更正记录"
    >
      <el-table-column
        prop="previousMarkCode"
        label="更正前"
        min-width="120"
      />
      <el-table-column
        prop="correctedMarkCode"
        label="更正后"
        min-width="120"
      />
      <el-table-column
        prop="reason"
        label="更正原因"
        min-width="220"
      />
      <el-table-column
        label="更正时间"
        min-width="175"
      >
        <template #default="{ row }">{{ formatDateTimeForDisplay(row.createdAt) }}</template>
      </el-table-column>
    </el-table>
    <PaginationFooter
      :total="total"
      :current-page="page"
      :page-size="10"
      :show-page-size="false"
      :disabled="loading || !enabled"
      compact
      @page-change="changePage"
    />
  </section>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import type {
  ProductionTrackingItemMark,
  ProductionTrackingItemMarkCorrection,
} from '@company/contracts';
import { productionTrackingApi } from '../../../api/production/tracking';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { formatDateTimeForDisplay } from '../../../utils/date';

const props = defineProps<{ item: ProductionTrackingItemMark; enabled: boolean }>();
const items = ref<ProductionTrackingItemMarkCorrection[]>([]),
  total = ref(0),
  page = ref(1),
  loading = ref(false),
  error = ref('');
const reads = useLatestReadRequest(() => {
  loading.value = false;
});
async function load(): Promise<void> {
  if (!props.enabled || !reads.isActive()) return;
  const item = props.item;
  const read = reads.begin(() => props.enabled && props.item.id === item.id);
  loading.value = true;
  error.value = '';
  try {
    const result = await productionTrackingApi.itemMarkCorrections(
      item.trackingCardId,
      item.id,
      { page: page.value, pageSize: 10 },
      { signal: read.signal, skipErrorHandling: true },
    );
    if (!read.isCurrent()) return;
    items.value = result.items;
    total.value = result.total;
  } catch (failure) {
    if (read.isCurrent())
      error.value = failure instanceof Error ? failure.message : '刻码更正记录加载失败，请刷新重试';
  } finally {
    if (read.isCurrent()) loading.value = false;
  }
}
async function changePage(value: number): Promise<void> {
  page.value = value;
  await load();
}
watch(
  () => [props.item.id, props.item.correctionCount, props.enabled] as const,
  (value, previous) => {
    reads.invalidate();
    if (!previous || value[0] !== previous[0]) {
      items.value = [];
      total.value = 0;
      page.value = 1;
      error.value = '';
    }
    if (props.enabled) void load();
  },
  { immediate: true },
);
</script>
<style scoped>
.correction-history {
  display: grid;
  gap: 12px;
  padding: 12px 20px;
}
.history-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
