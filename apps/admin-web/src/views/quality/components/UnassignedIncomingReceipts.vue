<template>
  <div>
    <div class="query-panel">
      <el-form
        inline
        @submit.prevent="search"
      >
        <el-form-item label="到货 / 采购 / 供应商 / 物料"
          ><el-input
            v-model="keyword"
            clearable
            maxlength="100"
            placeholder="查找未分组到货"
        /></el-form-item>
        <el-form-item
          ><el-button
            type="primary"
            native-type="submit"
            :loading="loading"
            >查询</el-button
          ><el-button @click="reset">重置</el-button></el-form-item
        >
      </el-form>
    </div>
    <div class="table-panel">
      <TableToolbar
        ><template #actions
          ><InlineHint>展开到货即可填写检验报告；质检分组用于整理记录。</InlineHint></template
        ><template #tools
          ><el-button
            :icon="Refresh"
            text
            circle
            :loading="loading"
            aria-label="刷新未分组到货"
            @click="load" /></template
      ></TableToolbar>
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        class="list-notice"
      />
      <div
        v-loading="loading"
        class="receipt-list"
      >
        <el-empty
          v-if="!rows.length && !loading && !error"
          description="当前条件下暂无未分组到货，可切换质检分组查看已关联记录"
          :image-size="72"
        />
        <IncomingInspectionReceipt
          v-for="receipt in rows"
          :key="receipt.receiptId"
          :receipt="receipt"
          :state="states[receipt.receiptId]"
          :expanded="expanded.has(receipt.receiptId)"
          @toggle="toggle(receipt)"
          @retry="loadLines(receipt)"
          @open="(id, reportId) => emit('open', id, reportId)"
          @associate="emit('associate', receipt)"
        />
      </div>
      <PaginationFooter
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        :disabled="loading"
        total-suffix="张未分组到货"
        @page-change="changePage"
        @update:page-size="changePageSize"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
import { onDeactivated, onScopeDispose, ref, watch } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import type { QualityIncomingInspectionReceiptItem } from '@company/contracts';
import { incomingInspectionOrdersApi } from '../../../api/incoming-inspection-orders';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { usePageInitialLoad } from '../../../composables/requests/usePageInitialLoad';
import { EMessage } from '../../../utils/message';
import InlineHint from '../../../components/InlineHint.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import TableToolbar from '../../../components/TableToolbar.vue';
import type { IncomingInspectionReceiptState } from '../composables/useIncomingInspectionOrders';
import IncomingInspectionReceipt from './IncomingInspectionReceipt.vue';

const props = defineProps<{ active: boolean }>();
const emit = defineEmits<{
  open: [receiptLineId: string, reportId?: string];
  associate: [receipt: QualityIncomingInspectionReceiptItem];
}>();
const keyword = ref(''),
  page = ref(1),
  pageSize = ref(10),
  total = ref(0),
  loading = ref(false),
  error = ref('');
const rows = ref<QualityIncomingInspectionReceiptItem[]>([]),
  states = ref<Record<string, IncomingInspectionReceiptState>>({});
const expanded = ref(new Set<string>());
const read = useLatestReadRequest(() => {
  loading.value = false;
});
const children = new Map<string, AbortController>();
function cancelChildren(): void {
  for (const controller of children.values()) controller.abort();
  children.clear();
  for (const state of Object.values(states.value)) state.loading = false;
}
async function loadLines(receipt: QualityIncomingInspectionReceiptItem): Promise<void> {
  if (!props.active || !read.isActive() || !expanded.value.has(receipt.receiptId)) return;
  const id = receipt.receiptId;
  children.get(id)?.abort();
  const controller = new AbortController();
  children.set(id, controller);
  if (!states.value[id])
    states.value[id] = { receipt, items: [], loading: false, loaded: false, error: '' };
  const state = states.value[id];
  state.loading = true;
  const isCurrent = (): boolean =>
    props.active &&
    read.isActive() &&
    children.get(id) === controller &&
    states.value[id] === state &&
    expanded.value.has(id);
  try {
    const result = await incomingInspectionOrdersApi.lines(id, controller.signal);
    if (!isCurrent()) return;
    if (
      result.receipt.receiptId !== id ||
      result.items.length !== result.receipt.lineCount ||
      new Set(result.items.map((line) => line.receiptLineId)).size !== result.items.length
    )
      throw new Error('到货物料范围不完整，请重新读取');
    state.receipt = result.receipt;
    state.items = result.items;
    state.loaded = true;
    state.error = '';
  } catch (cause) {
    if (isCurrent()) {
      state.error = '物料读取失败，请重试；已显示内容为上次结果。';
      EMessage.error(cause, '未分组到货物料读取失败');
    }
  } finally {
    if (isCurrent()) {
      state.loading = false;
      children.delete(id);
    }
  }
}
async function load(): Promise<void> {
  if (!props.active || !read.isActive()) return;
  const current = read.begin(() => props.active);
  cancelChildren();
  loading.value = true;
  try {
    const result = await incomingInspectionOrdersApi.candidates(
      {
        association: 'unassigned',
        keyword: keyword.value.trim() || undefined,
        page: page.value,
        pageSize: pageSize.value,
      },
      current.signal,
    );
    if (!current.isCurrent()) return;
    rows.value = result.items;
    total.value = result.total;
    error.value = '';
    const ids = new Set(result.items.map((receipt) => receipt.receiptId));
    expanded.value = new Set([...expanded.value].filter((id) => ids.has(id)));
    states.value = Object.fromEntries(Object.entries(states.value).filter(([id]) => ids.has(id)));
    await Promise.all(
      result.items.filter((receipt) => expanded.value.has(receipt.receiptId)).map(loadLines),
    );
  } catch (cause) {
    if (current.isCurrent()) {
      error.value = '未分组到货读取失败，请刷新重试。';
      EMessage.error(cause, '未分组到货读取失败');
    }
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
}
async function toggle(receipt: QualityIncomingInspectionReceiptItem): Promise<void> {
  const next = new Set(expanded.value);
  if (next.has(receipt.receiptId)) {
    next.delete(receipt.receiptId);
    children.get(receipt.receiptId)?.abort();
    children.delete(receipt.receiptId);
    if (states.value[receipt.receiptId]) states.value[receipt.receiptId].loading = false;
  } else next.add(receipt.receiptId);
  expanded.value = next;
  if (next.has(receipt.receiptId)) await loadLines(receipt);
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
watch(
  () => props.active,
  (active) => {
    if (!active) {
      read.invalidate();
      cancelChildren();
    }
  },
);
onDeactivated(cancelChildren);
onScopeDispose(cancelChildren);
usePageInitialLoad(load);
defineExpose({ refresh: load });
</script>
<style scoped>
.query-panel {
  padding: 20px 20px 4px;
  margin-bottom: 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.query-panel :deep(.el-input) {
  width: 315px;
}
.table-panel {
  overflow: hidden;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.receipt-list {
  padding: 0 16px;
  min-height: 120px;
}
.list-notice {
  margin: 0 16px 12px;
  width: auto;
}
</style>
