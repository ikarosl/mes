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
      <section
        v-if="(focusedReceipt && !focusedIsInPage) || locationError || locationLoading"
        class="located-block"
        aria-label="跳转目标"
      >
        <div class="located-heading">
          <strong>跳转目标</strong>
          <el-button
            :icon="Close"
            text
            circle
            aria-label="关闭跳转目标"
            @click="clearLocation"
          />
        </div>
        <div
          v-if="locationLoading || locationError"
          class="location-feedback"
        >
          <InlineHint :tone="locationError ? 'danger' : 'info'">{{
            locationError || '正在定位到货…'
          }}</InlineHint>
          <el-button
            v-if="locationError"
            link
            type="primary"
            @click="retryLocation"
            >重试列表定位</el-button
          >
        </div>
        <p
          v-if="focusedReceipt && !focusedIsInPage"
          class="located-note"
        >
          此到货不在当前筛选页，不计入分页总数。
        </p>
        <IncomingInspectionReceipt
          v-if="focusedReceipt && !focusedIsInPage"
          :receipt="focusedReceipt.receipt"
          :state="focusedReceipt"
          :expanded="focusedExpanded"
          :highlighted-line-id="focusedLineId"
          @toggle="toggleFocused"
          @retry="retryLocation"
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
    />
  </section>
</template>
<script setup lang="ts">
import { nextTick, onActivated, onDeactivated, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Close, Refresh } from '@element-plus/icons-vue';
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
  search: searchReceipts,
  reset: resetReceipts,
  changePage: changeReceiptsPage,
  changePageSize: changeReceiptsPageSize,
  toggleReceipt,
  toggleFocused,
  loadLines,
  expandPage,
  collapsePage,
} = list;
const detail = ref<InstanceType<typeof InboundInspectionDetailDialog>>();
let locationTarget = '';
let active = true;
let navigationRevision = 0;
async function clearLocation(): Promise<void> {
  navigationRevision += 1;
  pendingLocate = false;
  list.clearLocation();
  locationTarget = '';
  accepted = {};
  consumed = JSON.stringify(['', '']);
  if (route.name !== 'quality-inbound-inspections') return;
  const query = { ...route.query };
  delete query.receiptLineId;
  delete query.reportId;
  await router.replace({ query });
}
async function search(): Promise<void> {
  await clearLocation();
  await searchReceipts();
}
async function reset(): Promise<void> {
  await clearLocation();
  await resetReceipts();
}
async function changePage(value: number): Promise<void> {
  await clearLocation();
  await changeReceiptsPage(value);
}
async function changePageSize(value: number): Promise<void> {
  await clearLocation();
  await changeReceiptsPageSize(value);
}
async function retryLocation(): Promise<void> {
  if (locationTarget) await list.revealLine(locationTarget);
}
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
  if (navigating || !active || route.name !== 'quality-inbound-inspections') return false;
  if (detail.value?.locked) {
    EMessage.warning('请先确认当前检验操作结果再切换');
    return false;
  }
  const operation = ++navigationRevision;
  const revision = routeRevision;
  const current = (): boolean =>
    active &&
    route.name === 'quality-inbound-inspections' &&
    revision === routeRevision &&
    operation === navigationRevision &&
    matches();
  navigating = true;
  try {
    if (detail.value?.visible && !(await detail.value.close())) return false;
    if (!current()) return false;
    const succeeded = (await detail.value?.open(id, reportId)) ?? false;
    return succeeded && current();
  } finally {
    navigating = false;
    if (pendingLocate && active && route.name === 'quality-inbound-inspections') {
      pendingLocate = false;
      void locate();
    }
  }
}
async function openLine(id: string, reportId = '') {
  await navigate(id, reportId);
}
async function locate(): Promise<void> {
  const revision = routeRevision;
  if (!active || route.name !== 'quality-inbound-inspections') return;
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
  if (succeeded && detail.value?.openedLineId) {
    const openedLineId = detail.value.openedLineId;
    locationTarget = openedLineId;
    await list.revealLine(openedLineId);
    if (revision !== routeRevision || route.name !== 'quality-inbound-inspections') return;
    accepted = { receiptLineId: openedLineId, ...(reportId ? { reportId } : {}) };
    consumed = JSON.stringify([openedLineId, reportId]);
    const query = { ...route.query, ...accepted };
    if (!reportId) delete query.reportId;
    await router.replace({ query });
  } else {
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
  active = true;
  void locate();
});
const deactivate = (): void => {
  active = false;
  routeRevision += 1;
  pendingLocate = false;
};
onDeactivated(deactivate);
onScopeDispose(deactivate);
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
.located-heading,
.location-feedback {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.located-heading {
  justify-content: space-between;
}
.location-feedback {
  margin-bottom: 12px;
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
