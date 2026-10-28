<template>
  <section>
    <div class="query-panel">
      <el-form
        inline
        class="query-form"
        @submit.prevent="searchAndExpand"
        ><el-form-item label="到货 / 采购 / 供应商 / 物料"
          ><el-input
            v-model="keyword"
            clearable
            maxlength="100"
            placeholder="搜索单号、供应商、物料或版本" /></el-form-item
        ><el-form-item
          ><el-checkbox v-model="awaitingAcceptance">仅待核对清单</el-checkbox></el-form-item
        ><el-form-item
          ><el-button
            type="primary"
            native-type="submit"
            :loading="loading"
            >查询</el-button
          ><el-button @click="resetAndExpand">重置</el-button></el-form-item
        ></el-form
      >
    </div>
    <div class="table-panel">
      <ReceiptLinesTable
        ref="worklist"
        :rows="rows"
        :loading="loading"
        :awaiting-acceptance="awaitingAcceptance"
        @detail="navigate"
        @quality="goQuality"
        @inbound="goInbound"
        @refresh="load"
      >
        <template #actions
          ><el-button
            type="primary"
            :icon="Plus"
            @click="create()"
            >记录到货</el-button
          ><el-button
            v-if="route.query.receiptId || route.query.receiptLineId || route.query.purchaseOrderId"
            @click="retryLocation"
            >重新读取定位</el-button
          ></template
        >
      </ReceiptLinesTable>
      <PaginationFooter
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        total-suffix="条到货明细"
        @page-change="changePage"
        @update:page-size="changePageSize"
      />
    </div>
    <ReceiptCreateDialog
      ref="editor"
      @saved="saved"
    /><ReceiptDetailDialog
      ref="detail"
      @changed="load"
    />
  </section>
</template>
<script setup lang="ts">
import { nextTick, onActivated, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus } from '@element-plus/icons-vue';
import { procurementApi } from '../../api/procurement';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { EMessage } from '../../utils/message';
import { useTabsStore } from '../../stores/tabs';
import { useLatestReadRequest } from '../../composables/requests/useLatestReadRequest';
import { useReceiptsList } from './composables/useReceiptsList';
import type { ReceiptDetailIntent } from './receipt-round-presentation';
import ReceiptCreateDialog from './components/ReceiptCreateDialog.vue';
import ReceiptDetailDialog from './components/ReceiptDetailDialog.vue';
import ReceiptLinesTable from './components/ReceiptLinesTable.vue';
import type { ReceiptWorklistHandle } from './receipt-worklist';
defineOptions({ name: 'PurchaseReceiptsPage' });
const route = useRoute(),
  router = useRouter();
const {
  awaitingAcceptance,
  keyword,
  rows,
  page,
  pageSize,
  total,
  loading,
  load,
  search,
  reset,
  changePage,
  changePageSize,
} = useReceiptsList();
const worklist = ref<Pick<ReceiptWorklistHandle, 'expandPage'>>();
async function searchAndExpand(): Promise<void> {
  await search();
  worklist.value?.expandPage();
}
async function resetAndExpand(): Promise<void> {
  await reset();
  worklist.value?.expandPage();
}
const editor = ref<InstanceType<typeof ReceiptCreateDialog>>(),
  detail = ref<InstanceType<typeof ReceiptDetailDialog>>();
const locator = useLatestReadRequest(() => {});
let navigating = false;
let pendingLocate = false;
const finishNavigation = (): void => {
  navigating = false;
  if (pendingLocate) {
    pendingLocate = false;
    void locate();
  }
};
const release = async (): Promise<boolean> => {
  if (editor.value?.locked || detail.value?.locked) {
    EMessage.warning('请先确认当前操作结果再切换到货记录');
    return false;
  }
  if (editor.value?.visible && !(await editor.value.close())) return false;
  if (detail.value?.visible && !(await detail.value.close())) return false;
  return true;
};
onScopeDispose(useTabsStore().registerCloseGuard('procurement-receipts', release));
const navigate = async (
  id: string,
  lineId?: string,
  intent?: ReceiptDetailIntent,
): Promise<boolean> => {
  if (navigating) return false;
  navigating = true;
  try {
    if (!(await release())) return false;
    return (await detail.value?.open(id, lineId, intent)) ?? false;
  } finally {
    finishNavigation();
  }
};
const goQuality = async (lineId: string): Promise<void> => {
  if (navigating) return;
  navigating = true;
  try {
    if (await release())
      await router.push({ name: 'quality-inbound-inspections', query: { receiptLineId: lineId } });
  } finally {
    finishNavigation();
  }
};
const goInbound = async (lineId: string): Promise<void> => {
  if (navigating) return;
  navigating = true;
  try {
    if (await release())
      await router.push({
        name: 'warehouse-inbound',
        query: { sourceType: 'purchased', receiptLineId: lineId },
      });
  } finally {
    finishNavigation();
  }
};
const create = async (orderId?: string): Promise<boolean> => {
  if (navigating) return false;
  navigating = true;
  try {
    if (!(await release())) return false;
    await editor.value?.open(orderId);
    return true;
  } finally {
    finishNavigation();
  }
};
const saved = async (id: string): Promise<void> => {
  await load();
  await detail.value?.open(id);
};
let consumed = '',
  accepted: Record<string, string> = {};
let routeRevision = 0;
const retryLocation = (): void => {
  consumed = '';
  void locate();
};
const locate = async (): Promise<void> => {
  const revision = routeRevision;
  if (route.name !== 'procurement-receipts') return;
  await nextTick();
  if (revision !== routeRevision || route.name !== 'procurement-receipts') return;
  const receiptId = typeof route.query.receiptId === 'string' ? route.query.receiptId : '';
  const lineId = typeof route.query.receiptLineId === 'string' ? route.query.receiptLineId : '';
  const orderId =
    typeof route.query.purchaseOrderId === 'string' ? route.query.purchaseOrderId : '';
  const token = JSON.stringify([receiptId, lineId, orderId]);
  if (!receiptId && !lineId && !orderId) {
    consumed = token;
    return;
  }
  if (token === consumed) return;
  if (navigating) {
    pendingLocate = true;
    return;
  }
  consumed = token;
  const current = locator.begin(
    () =>
      revision === routeRevision &&
      route.name === 'procurement-receipts' &&
      JSON.stringify([
        typeof route.query.receiptId === 'string' ? route.query.receiptId : '',
        typeof route.query.receiptLineId === 'string' ? route.query.receiptLineId : '',
        typeof route.query.purchaseOrderId === 'string' ? route.query.purchaseOrderId : '',
      ]) === token,
  );
  let succeeded = false;
  try {
    if (receiptId) succeeded = await navigate(receiptId, lineId || undefined);
    else if (lineId) {
      const line = await procurementApi.getReceiptLine(lineId, current.signal);
      if (!current.isCurrent()) return;
      succeeded = await navigate(line.receiptId, lineId);
    } else succeeded = await create(orderId);
  } catch (error) {
    if (current.isCurrent()) EMessage.error(error, '到货定位失败');
  }
  if (!current.isCurrent()) return;
  if (succeeded)
    accepted = {
      ...(receiptId ? { receiptId } : {}),
      ...(lineId ? { receiptLineId: lineId } : {}),
      ...(orderId ? { purchaseOrderId: orderId } : {}),
    };
  else {
    const query = { ...route.query };
    delete query.receiptId;
    delete query.receiptLineId;
    delete query.purchaseOrderId;
    consumed = JSON.stringify([
      accepted.receiptId ?? '',
      accepted.receiptLineId ?? '',
      accepted.purchaseOrderId ?? '',
    ]);
    await router.replace({ query: { ...query, ...accepted } });
  }
};
watch(
  () => [route.name, route.query.receiptId, route.query.receiptLineId, route.query.purchaseOrderId],
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
.query-form :deep(.el-input) {
  width: 315px;
}
.table-panel {
  overflow: hidden;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
</style>
