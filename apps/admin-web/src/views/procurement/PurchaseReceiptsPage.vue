<template>
  <section ref="pageRoot">
    <div class="query-panel">
      <el-form
        inline
        class="query-form"
        @submit.prevent="search"
      >
        <el-form-item label="到货 / 采购 / 供应商 / 物料"
          ><el-input
            v-model="keyword"
            clearable
            maxlength="100"
            placeholder="搜索单号、供应商、物料或版本"
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
      <TableToolbar>
        <template #actions
          ><el-button
            type="primary"
            :icon="Plus"
            :disabled="blocked"
            @click="create()"
            >记录到货</el-button
          ><el-button
            v-if="hasExplicitLocation() || focusedReceipt"
            :disabled="blocked"
            @click="retryLocation"
            >重新读取定位</el-button
          ></template
        >
        <template #tools
          ><el-button
            text
            :disabled="loading"
            @click="expandPage"
            >展开当前页到货单</el-button
          ><el-button
            text
            @click="collapsePage"
            >收起当前页到货单</el-button
          ><el-button
            :icon="Refresh"
            text
            circle
            :loading="loading"
            aria-label="刷新到货目录"
            @click="load"
        /></template>
      </TableToolbar>
      <div class="list-hint">
        <InlineHint>按到货单分页；展开后显示该到货单的全部物料。</InlineHint>
      </div>
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        show-icon
        class="list-notice"
      />
      <div
        v-if="focusedReceipt || locationLoading || locationError"
        class="location-bar"
      >
        <span v-if="locationLoading">正在定位到货…</span
        ><span v-else-if="locationError">{{ locationError }}</span
        ><span v-else
          >当前定位：<strong class="identity-value">{{ focusedReceipt?.receipt.receiptNo }}</strong
          ><template v-if="focusedLineId">
            · 到货行 ID：<strong class="identity-value">{{ focusedLineId }}</strong></template
          ></span
        ><el-button
          v-if="locationError"
          link
          type="primary"
          :disabled="blocked"
          @click="retryLocation"
          >重试列表定位</el-button
        ><el-button
          link
          type="primary"
          @click="clearListLocation"
          >清除列表定位</el-button
        >
      </div>
      <section
        v-if="focusedReceipt && !focusedIsInPage"
        class="located-block"
      >
        <p class="located-note">此到货不在当前筛选页，不计入分页总数</p>
        <ReceiptLinesTable
          :receipt="focusedReceipt.receipt"
          :state="locationError ? undefined : focusedReceipt"
          :expanded="focusedExpanded"
          :highlighted-line-id="focusedLineId"
          focused
          @toggle="toggleFocused"
          @retry="refreshLocation"
          @detail="navigate"
          @quality="goQuality"
          @inbound="goInbound"
        />
      </section>
      <div
        v-loading="loading"
        class="receipt-list"
      >
        <el-empty
          v-if="!rows.length && !loading && !error"
          description="当前筛选下暂无到货，可登记实际到货或调整查询"
          :image-size="72"
        />
        <ReceiptLinesTable
          v-for="receipt in rows"
          :key="receipt.id"
          :receipt="receipt"
          :state="states[receipt.id]"
          :expanded="expandedReceipts.has(receipt.id)"
          :highlighted-line-id="focusedLineId"
          :focused="focusedReceipt?.receipt.id === receipt.id"
          @toggle="toggleReceipt(receipt)"
          @retry="loadLines(receipt)"
          @detail="navigate"
          @quality="goQuality"
          @inbound="goInbound"
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
    <ReceiptCreateDialog
      ref="editor"
      @saved="saved"
    />
    <ReceiptDetailDialog
      ref="detail"
      @changed="load"
    />
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onActivated, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { procurementApi } from '../../api/procurement';
import PaginationFooter from '../../components/PaginationFooter.vue';
import TableToolbar from '../../components/TableToolbar.vue';
import InlineHint from '../../components/InlineHint.vue';
import { EMessage } from '../../utils/message';
import { useTabsStore } from '../../stores/tabs';
import { useLatestReadRequest } from '../../composables/requests/useLatestReadRequest';
import { usePurchaseReceipts } from './composables/usePurchaseReceipts';
import type { ReceiptDetailIntent } from './receipt-presentation';
import ReceiptCreateDialog from './components/ReceiptCreateDialog.vue';
import ReceiptDetailDialog from './components/ReceiptDetailDialog.vue';
import ReceiptLinesTable from './components/ReceiptLinesTable.vue';

defineOptions({ name: 'PurchaseReceiptsPage' });
const route = useRoute(),
  router = useRouter();
const hasExplicitLocation = (): boolean =>
  route.name === 'procurement-receipts' &&
  [route.query.receiptId, route.query.receiptLineId, route.query.purchaseOrderId].some(
    (value) => typeof value === 'string' && value.length > 0,
  );
const navigating = ref(false);
const backgroundTarget = ref<{ receiptId: string; lineId?: string } | null>(null);
const list = usePurchaseReceipts(
  () => hasExplicitLocation() || navigating.value || Boolean(backgroundTarget.value),
);
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
  expandPage,
  collapsePage,
  toggleReceipt,
  loadLines,
  refreshLocation,
  toggleFocused,
} = list;
const editor = ref<InstanceType<typeof ReceiptCreateDialog>>(),
  detail = ref<InstanceType<typeof ReceiptDetailDialog>>();
const locator = useLatestReadRequest(() => {});
const pageRoot = ref<HTMLElement>();
const blocked = computed(
  () => navigating.value || Boolean(editor.value?.locked || detail.value?.locked),
);
let pendingLocate = false;
const finishNavigation = (): void => {
  navigating.value = false;
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
  matches: () => boolean = () => route.name === 'procurement-receipts',
  synchronizeRoute = true,
): Promise<boolean> => {
  if (navigating.value) return false;
  const revision = routeRevision;
  const isCurrent = (): boolean => matches() && revision === routeRevision;
  navigating.value = true;
  list.prioritizeLocation();
  try {
    if (!(await release()) || !isCurrent()) return false;
    const opened = (await detail.value?.open(id, lineId, intent)) ?? false;
    if (!opened || !isCurrent()) return false;
    backgroundTarget.value = { receiptId: id, lineId };
    await list.revealReceipt(id, lineId, isCurrent);
    if (!isCurrent()) return false;
    if (synchronizeRoute) {
      if (!(await recordLocation(id, lineId, isCurrent))) return false;
      await scrollLocation(id, lineId);
      return true;
    }
    await scrollLocation(id, lineId, isCurrent);
    return isCurrent();
  } finally {
    finishNavigation();
  }
};
const goQuality = async (lineId: string): Promise<void> => {
  if (navigating.value) return;
  navigating.value = true;
  try {
    if (await release())
      await router.push({ name: 'quality-inbound-inspections', query: { receiptLineId: lineId } });
  } finally {
    finishNavigation();
  }
};
const goInbound = async (lineId: string): Promise<void> => {
  if (navigating.value) return;
  navigating.value = true;
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
const create = async (
  orderId?: string,
  matches: () => boolean = () => route.name === 'procurement-receipts',
): Promise<boolean> => {
  if (navigating.value) return false;
  navigating.value = true;
  list.prioritizeLocation();
  try {
    if (!(await release()) || !matches()) return false;
    await editor.value?.open(orderId);
    return matches();
  } finally {
    finishNavigation();
  }
};
const saved = async (id: string): Promise<void> => {
  list.prioritizeLocation();
  backgroundTarget.value = { receiptId: id };
  await load();
  if (route.name !== 'procurement-receipts') return;
  await detail.value?.open(id);
  await list.revealReceipt(id);
  if (route.name === 'procurement-receipts') {
    await recordLocation(id);
    await scrollLocation(id);
  }
};
let consumed = '',
  accepted: Record<string, string> = {};
let routeRevision = 0;
const readLocation = (): [string, string, string] => [
  typeof route.query.receiptId === 'string' ? route.query.receiptId : '',
  typeof route.query.receiptLineId === 'string' ? route.query.receiptLineId : '',
  typeof route.query.purchaseOrderId === 'string' ? route.query.purchaseOrderId : '',
];
const recordLocation = async (
  receiptId: string,
  lineId?: string,
  matches: () => boolean = () => route.name === 'procurement-receipts',
): Promise<boolean> => {
  if (!matches()) return false;
  accepted = { receiptId, ...(lineId ? { receiptLineId: lineId } : {}) };
  const token = JSON.stringify([receiptId, lineId ?? '', '']);
  consumed = token;
  const query = { ...route.query };
  delete query.receiptId;
  delete query.receiptLineId;
  delete query.purchaseOrderId;
  await router.replace({ query: { ...query, ...accepted } });
  return route.name === 'procurement-receipts' && JSON.stringify(readLocation()) === token;
};
const scrollLocation = async (
  receiptId: string,
  lineId?: string,
  matches: () => boolean = () => route.name === 'procurement-receipts',
): Promise<void> => {
  await nextTick();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  if (!matches()) return;
  const receipt = [
    ...(pageRoot.value?.querySelectorAll<HTMLElement>('[data-receipt-id]') ?? []),
  ].find((element) => element.dataset.receiptId === receiptId);
  const line = lineId
    ? [...(receipt?.querySelectorAll<HTMLElement>('[data-receipt-line-id]') ?? [])].find(
        (element) => element.dataset.receiptLineId === lineId,
      )
    : undefined;
  (line ?? receipt)?.scrollIntoView({ block: lineId ? 'center' : 'nearest', inline: 'nearest' });
};
const clearListLocation = async (): Promise<void> => {
  list.clearLocation();
  backgroundTarget.value = null;
  locator.invalidate();
  accepted = {};
  consumed = JSON.stringify(['', '', '']);
  const query = { ...route.query };
  delete query.receiptId;
  delete query.receiptLineId;
  delete query.purchaseOrderId;
  await router.replace({ query });
};
const retryLocation = (): void => {
  if (locationError.value && backgroundTarget.value) {
    void list.revealReceipt(backgroundTarget.value.receiptId, backgroundTarget.value.lineId);
  } else if (hasExplicitLocation()) {
    consumed = '';
    void locate();
  } else void refreshLocation();
};
const locate = async (): Promise<void> => {
  const revision = routeRevision;
  if (route.name !== 'procurement-receipts') return;
  await nextTick();
  if (revision !== routeRevision || route.name !== 'procurement-receipts') return;
  const [receiptId, lineId, orderId] = readLocation();
  const token = JSON.stringify([receiptId, lineId, orderId]);
  if (!receiptId && !lineId && !orderId) {
    consumed = token;
    return;
  }
  if (token === consumed) return;
  if (navigating.value) {
    pendingLocate = true;
    return;
  }
  consumed = token;
  const current = locator.begin(
    () =>
      revision === routeRevision &&
      route.name === 'procurement-receipts' &&
      JSON.stringify(readLocation()) === token,
  );
  let succeeded = false;
  try {
    if (receiptId)
      succeeded = await navigate(
        receiptId,
        lineId || undefined,
        undefined,
        current.isCurrent,
        false,
      );
    else if (lineId) {
      const location = await procurementApi.locateReceiptLine(lineId, current.signal);
      if (!current.isCurrent()) return;
      if (location.receiptLineId !== lineId) throw new Error('到货明细定位不匹配');
      succeeded = await navigate(location.receiptId, lineId, undefined, current.isCurrent, false);
    } else succeeded = await create(orderId, current.isCurrent);
  } catch (cause) {
    if (current.isCurrent()) EMessage.error(cause, '到货定位失败');
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
    if (hasExplicitLocation()) list.prioritizeLocation();
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
.identity-value {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
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
.list-hint {
  padding: 2px 16px 12px;
}
.list-notice {
  margin: 0 16px 12px;
  width: auto;
}
.receipt-list {
  min-width: 0;
  min-height: 160px;
  padding: 0 16px 16px;
}
.location-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 0 16px 12px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.located-block {
  margin: 0 16px 16px;
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
