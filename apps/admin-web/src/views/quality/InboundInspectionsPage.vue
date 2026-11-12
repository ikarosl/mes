<template>
  <section>
    <div class="query-panel">
      <el-form
        inline
        @submit.prevent="search"
      >
        <el-form-item label="到货 / 采购 / 供应商 / 物料">
          <el-input
            v-model="keyword"
            clearable
            maxlength="100"
            placeholder="搜索单号、供应商、物料或版本"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            native-type="submit"
            :loading="loading"
            >查询</el-button
          >
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>
    <div class="table-panel">
      <TableToolbar>
        <template #actions><InlineHint>展开到货即可填写或查看检验报告。</InlineHint></template>
        <template #tools>
          <el-button
            text
            :disabled="loading"
            @click="expandPage"
            >展开当前页到货单</el-button
          >
          <el-button
            text
            @click="collapsePage"
            >收起当前页到货单</el-button
          >
          <el-button
            :icon="Refresh"
            text
            circle
            :loading="loading"
            aria-label="刷新到货目录"
            @click="load"
          />
        </template>
      </TableToolbar>
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        show-icon
        class="list-notice"
      />
      <div
        v-if="focusedLineId || locationError || locationLoading"
        class="location-bar"
      >
        <span v-if="locationLoading">正在定位到货…</span>
        <span v-else-if="locationError">{{ locationError }}</span>
        <span v-else
          >当前定位：<strong class="identity-value">{{ focusedReceipt?.receipt.receiptNo }}</strong>
          · 到货行 ID：<strong class="identity-value">{{ focusedLineId }}</strong></span
        >
        <el-button
          v-if="locationError"
          link
          type="primary"
          @click="list.revealLine(detail?.openedLineId ?? focusedLineId)"
          >重试列表定位</el-button
        >
        <el-button
          link
          type="primary"
          @click="clearLocation"
          >清除列表定位</el-button
        >
      </div>
      <section
        v-if="focusedReceipt && !focusedIsInPage"
        class="located-block"
      >
        <p class="located-note">此到货不在当前筛选页，不计入分页总数</p>
        <IncomingInspectionReceipt
          :receipt="focusedReceipt.receipt"
          :state="focusedReceipt"
          :expanded="focusedExpanded"
          :highlighted-line-id="focusedLineId"
          @toggle="toggleFocused"
          @retry="list.revealLine(focusedLineId)"
          @open="openLine"
        />
      </section>
      <div
        v-loading="loading"
        class="receipt-list"
      >
        <el-empty
          v-if="!rows.length && !loading && !error"
          description="当前筛选下暂无到货，可调整查询"
          :image-size="72"
        />
        <IncomingInspectionReceipt
          v-for="receipt in rows"
          :key="receipt.receiptId"
          :receipt="receipt"
          :state="states[receipt.receiptId]"
          :expanded="expandedReceipts.has(receipt.receiptId)"
          :highlighted-line-id="focusedLineId"
          @toggle="toggleReceipt(receipt)"
          @retry="loadLines(receipt)"
          @open="openLine"
        />
      </div>
      <PaginationFooter
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        :disabled="loading"
        total-suffix="张到货单"
        @page-change="changePage"
        @update:page-size="changePageSize"
      />
    </div>
    <InboundInspectionDetailDialog
      ref="detail"
      @changed="load"
      @record-focus-cleared="clearRecordLocation"
    />
  </section>
</template>
<script setup lang="ts">
import { nextTick, onActivated, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import TableToolbar from '../../components/TableToolbar.vue';
import InlineHint from '../../components/InlineHint.vue';
import { EMessage } from '../../utils/message';
import { useTabsStore } from '../../stores/tabs';
import { useIncomingInspectionReceipts } from './composables/useIncomingInspectionReceipts';
import IncomingInspectionReceipt from './components/IncomingInspectionReceipt.vue';
import InboundInspectionDetailDialog from '../procurement/components/InboundInspectionDetailDialog.vue';

defineOptions({ name: 'InboundInspectionsPage' });
const route = useRoute(),
  router = useRouter();
let navigating = false;
const hasExplicitEntry = (): boolean =>
  navigating ||
  (route.name === 'quality-inbound-inspections' &&
    [route.query.receiptLineId, route.query.reportId].some(
      (value) => typeof value === 'string' && value.length > 0,
    ));
const list = useIncomingInspectionReceipts(hasExplicitEntry);
const {
  keyword,
  rows,
  states,
  expandedReceipts,
  page,
  pageSize,
  total,
  loading,
  error,
  focusedReceipt,
  focusedLineId,
  focusedExpanded,
  focusedIsInPage,
  locationLoading,
  locationError,
  load,
  search,
  reset,
  changePage,
  changePageSize,
  toggleReceipt,
  toggleFocused,
  loadLines,
  expandPage,
  collapsePage,
} = list;
const detail = ref<InstanceType<typeof InboundInspectionDetailDialog>>();
let revealedLineId = '';
function revealOpenedLine(id: string): void {
  if (id === revealedLineId) return;
  revealedLineId = id;
  void list.revealLine(id);
}
async function clearLocation(): Promise<void> {
  list.clearLocation();
  revealedLineId = '';
  accepted = {};
  consumed = JSON.stringify(['', '']);
  const query = { ...route.query };
  delete query.receiptLineId;
  delete query.reportId;
  await router.replace({ query });
}
watch(
  () => detail.value?.openedLineId,
  (id) => {
    if (id && route.name === 'quality-inbound-inspections') revealOpenedLine(id);
  },
);
onScopeDispose(
  useTabsStore().registerCloseGuard(
    'quality-inbound-inspections',
    async () => !detail.value?.visible || (await detail.value.close()),
  ),
);
let pendingLocate = false;
let consumed = '';
let accepted: Record<string, string> = {};
let routeRevision = 0;
async function navigate(id: string, reportId = '', matches = () => true): Promise<boolean> {
  if (navigating) return false;
  if (detail.value?.locked) {
    EMessage.warning('请先确认当前检验操作结果再切换');
    return false;
  }
  navigating = true;
  try {
    if (detail.value?.visible && !(await detail.value.close())) return false;
    if (!matches()) return false;
    revealedLineId = '';
    const succeeded = (await detail.value?.open(id, reportId)) ?? false;
    const openedLineId = detail.value?.openedLineId;
    if (succeeded && openedLineId && matches()) revealOpenedLine(openedLineId);
    return succeeded;
  } finally {
    navigating = false;
    if (pendingLocate) {
      pendingLocate = false;
      void locate();
    }
  }
}
async function openLine(id: string, reportId = '') {
  if (!(await navigate(id, reportId))) return;
  accepted = { receiptLineId: id, ...(reportId ? { reportId } : {}) };
  consumed = JSON.stringify([id, reportId]);
  const query = { ...route.query };
  query.receiptLineId = id;
  if (reportId) query.reportId = reportId;
  else delete query.reportId;
  await router.replace({ name: 'quality-inbound-inspections', query });
}
async function clearRecordLocation() {
  const id = detail.value?.openedLineId;
  if (!id) return;
  accepted = { receiptLineId: id };
  consumed = JSON.stringify([id, '']);
  const query = { ...route.query };
  query.receiptLineId = id;
  delete query.reportId;
  await router.replace({ name: 'quality-inbound-inspections', query });
}
async function locate(): Promise<void> {
  const revision = routeRevision;
  if (route.name !== 'quality-inbound-inspections') return;
  await nextTick();
  if (revision !== routeRevision || route.name !== 'quality-inbound-inspections') return;
  const lineId = typeof route.query.receiptLineId === 'string' ? route.query.receiptLineId : '';
  const reportId = typeof route.query.reportId === 'string' ? route.query.reportId : '';
  const token = JSON.stringify([lineId, reportId]);
  if (!lineId && !reportId) {
    consumed = token;
    return;
  }
  if (token === consumed) return;
  if (navigating) {
    pendingLocate = true;
    return;
  }
  consumed = token;
  const succeeded = await navigate(
    lineId,
    reportId,
    () => revision === routeRevision && route.name === 'quality-inbound-inspections',
  );
  if (revision !== routeRevision || route.name !== 'quality-inbound-inspections') return;
  if (succeeded)
    accepted = { ...(lineId ? { receiptLineId: lineId } : {}), ...(reportId ? { reportId } : {}) };
  else {
    const query = { ...route.query };
    delete query.receiptLineId;
    delete query.reportId;
    consumed = JSON.stringify([accepted.receiptLineId ?? '', accepted.reportId ?? '']);
    await router.replace({ query: { ...query, ...accepted } });
  }
}
watch(
  () => [route.name, route.query.receiptLineId, route.query.reportId],
  () => {
    routeRevision += 1;
    void locate();
  },
  { immediate: true, flush: 'sync' },
);
onActivated(() => {
  void locate();
});
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
.identity-value {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.location-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 0 16px 12px;
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.located-block {
  margin: 0 16px 18px;
  padding: 12px;
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: 8px;
}
.located-note {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
