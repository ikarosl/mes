<template>
  <div class="purchase-inbounds">
    <el-radio-group
      v-model="view"
      @change="refresh"
    >
      <el-radio-button value="releases">待入库</el-radio-button>
      <el-radio-button value="history">已入库记录</el-radio-button>
    </el-radio-group>
    <template v-if="view === 'releases'">
      <InlineHint class="inbound-hint">
        按<strong>当前有效余量</strong>分次、分批入库；复检、更正或拒收后，<strong>旧授权不可继续使用</strong>。
      </InlineHint>
      <section class="query-panel">
        <el-form
          inline
          :model="releases.query"
          @submit.prevent="releases.search"
        >
          <el-form-item label="关键词"
            ><el-input
              v-model="releases.query.keyword"
              clearable
              placeholder="采购单、到货单、供应商或物料"
          /></el-form-item>
          <el-form-item
            ><el-button
              type="primary"
              :loading="releases.loading.value"
              @click="releases.search"
              >查询</el-button
            ><el-button @click="releases.reset">重置</el-button></el-form-item
          >
          <el-form-item v-if="releases.query.receiptLineId"
            ><el-tag
              closable
              @close="releases.reset"
              >已定位到货明细</el-tag
            ></el-form-item
          >
        </el-form>
      </section>
      <el-alert
        v-if="releases.loadError.value"
        :title="releases.loadError.value"
        type="error"
        :closable="false"
      />
      <section class="table-panel">
        <TableToolbar>
          <template #actions>
            <el-button
              type="primary"
              :disabled="!releases.selected.value.length"
              @click="releases.open"
              >核对入库（{{ releases.selected.value.length }}）</el-button
            >
            <el-button
              :disabled="!releases.selected.value.length || releases.locked.value"
              @click="releases.clear"
              >清空已选</el-button
            >
            <span class="muted">跨页保留已选范围</span>
          </template>
          <template #tools
            ><el-button
              :icon="Refresh"
              :loading="releases.loading.value"
              text
              circle
              aria-label="刷新放行清单"
              @click="releases.load"
          /></template>
        </TableToolbar>
        <PurchaseInboundReleaseGroups
          :releases="releases"
          :go-source="goSource"
        />
        <PaginationFooter
          :total="releases.total.value"
          :current-page="releases.page.value"
          :page-size="releases.pageSize.value"
          total-suffix="条可入明细"
          @page-change="releasePage"
          @update:page-size="releaseSize"
        />
      </section>
    </template>
    <template v-else>
      <section class="query-panel">
        <el-form
          inline
          @submit.prevent="searchHistory"
          ><el-form-item label="关键词"
            ><el-input
              v-model="historyKeyword"
              clearable
              placeholder="入库单号或供应商" /></el-form-item
          ><el-form-item
            ><el-button
              type="primary"
              :loading="history.loading.value"
              @click="searchHistory"
              >查询</el-button
            ><el-button @click="resetHistory">重置</el-button></el-form-item
          ></el-form
        >
      </section>
      <section class="table-panel">
        <TableToolbar
          ><template #tools
            ><el-button
              :icon="Refresh"
              text
              circle
              aria-label="刷新入库历史"
              :loading="history.loading.value"
              @click="loadHistory(true)" /></template
        ></TableToolbar>
        <section
          v-if="currentInboundId && !locatedOnPage"
          class="current-location"
        >
          <div
            v-if="detachedOrder"
            class="current-location-note"
          >
            此定位单不计入当前筛选页
          </div>
          <div
            v-else
            class="current-location-heading"
          >
            <strong>当前定位</strong>
            <span>入库单 ID {{ currentInboundId }} · 不计入当前筛选页</span>
            <el-button
              link
              @click="clearHistoryLocation"
              >取消定位</el-button
            >
          </div>
          <div
            v-loading="history.detailLoading.value"
            class="current-location-body"
          >
            <div
              v-if="!detachedOrder && !history.detailError.value"
              class="location-status"
            >
              {{ history.loading.value ? '正在核对当前页…' : '正在读取定位单…' }}
            </div>
            <el-alert
              v-if="history.detailError.value"
              :title="history.detailError.value"
              type="error"
              :closable="false"
            />
            <el-button
              v-if="history.detailError.value"
              type="primary"
              link
              @click="retryHistoryLocation"
              >重试读取定位单</el-button
            >
            <PurchaseInboundHistoryGroups
              v-if="detachedOrder"
              :rows="[detachedOrder]"
              :loading="false"
              :located-inbound-id="currentInboundId"
              :go-source="goSource"
              @clear-location="clearHistoryLocation"
            />
          </div>
        </section>
        <PurchaseInboundHistoryGroups
          :rows="history.rows.value"
          :loading="history.loading.value"
          :located-inbound-id="currentInboundId"
          :go-source="goSource"
          @clear-location="clearHistoryLocation"
        />
        <PaginationFooter
          :total="history.total.value"
          :current-page="historyPage"
          :page-size="historySize"
          @page-change="changeHistoryPage"
          @update:page-size="changeHistorySize"
        />
      </section>
    </template>
    <el-dialog
      :model-value="active && releases.visible.value"
      title="核对外购物料入库"
      :width="DialogWidth.workbench"
      workbench
      :close-on-click-modal="false"
      :before-close="closeConfirmation"
      @update:model-value="closeConfirmation"
    >
      <el-alert
        title="核对每份授权的本次数量和目标批次；确认后将新增实际库存记录。"
        type="info"
        show-icon
        :closable="false"
      />
      <div class="dialog-toolbar">
        <el-button
          :loading="releases.checking.value"
          :disabled="releases.command.locked.value"
          @click="releases.recheck(true)"
          >重新核对已选</el-button
        >
      </div>
      <el-alert
        v-if="releases.checkError.value"
        :title="releases.checkError.value"
        type="error"
        :closable="false"
      />
      <InlineHint
        v-if="selectedReceiptGroups.length > 1 || selectedSupplierCount > 1"
        class="multi-receipt-hint"
        >本次涉及 <strong>{{ selectedReceiptGroups.length }}</strong> 张到货单、<strong>{{
          selectedSupplierCount
        }}</strong>
        家供应商，将生成一张外购入库单。</InlineHint
      >
      <div class="review-groups">
        <section
          v-for="group in selectedReceiptGroups"
          :key="group.receiptId"
          class="review-group"
        >
          <div class="review-heading">
            <strong>到货 {{ group.receiptNo }}</strong>
            <span>登记采购 {{ group.receiptPurchaseNo }}</span>
          </div>
          <el-table
            :data="group.items"
            row-key="detailKey"
          >
            <el-table-column
              label="到货行 / 实际归属采购"
              min-width="180"
              ><template #default="{ row }"
                ><div>第 {{ row.source.receiptLineNo }} 行</div>
                <div class="muted">
                  {{ row.source.purchaseNo
                  }}<span v-if="row.source.purchaseNo !== row.source.receiptPurchaseNo">
                    · 补单承接</span
                  >
                </div></template
              ></el-table-column
            >
            <el-table-column
              label="物料 / 精确版本"
              min-width="200"
              ><template #default="{ row }"
                ><div>{{ row.source.itemCode }} · {{ row.source.itemName }}</div>
                <div class="muted">{{ row.source.materialVariantCode }}</div></template
              ></el-table-column
            >
            <el-table-column
              label="供应商"
              min-width="140"
              ><template #default="{ row }">{{
                row.source.supplierName
              }}</template></el-table-column
            >
            <el-table-column
              label="供应商批号"
              min-width="150"
              ><template #default="{ row }">{{
                row.source.supplierBatchCode || '未提供'
              }}</template></el-table-column
            >
            <el-table-column
              label="目标库存批次"
              min-width="270"
            >
              <template #default="{ row }">
                <InboundBatchTargetPicker
                  v-model="row.target"
                  item-kind="material"
                  :material-variant-id="row.source.materialVariantId"
                  :unit="row.source.unit"
                  :identity="`${row.source.itemCode} / ${row.source.materialVariantCode} / ${row.source.unit}`"
                  :disabled="releases.locked.value"
                />
              </template>
            </el-table-column>
            <el-table-column
              label="本次入库"
              min-width="270"
              ><template #default="{ row }"
                ><el-input
                  v-model="row.quantity"
                  inputmode="numeric"
                  :disabled="releases.locked.value"
                  :aria-label="`本次入库数量 ${row.source.itemCode}`"
                />
                <div
                  v-if="quantitySummaries[row.detailKey]"
                  class="quantity-summary"
                  :class="{
                    'is-invalid':
                      !quantitySummaries[row.detailKey].valid ||
                      quantitySummaries[row.detailKey].after < 0,
                  }"
                >
                  <span v-if="quantitySummaries[row.detailKey].count > 1">
                    {{ quantitySummaries[row.detailKey].count }} 条目标合计
                    <strong>{{
                      quantitySummaries[row.detailKey].valid
                        ? `${formatQuantity(quantitySummaries[row.detailKey].total)} ${row.source.unit}`
                        : '待修正'
                    }}</strong>
                    ·
                  </span>
                  <span
                    >可入
                    <strong
                      >{{ formatQuantity(quantitySummaries[row.detailKey].allowance) }}
                      {{ row.source.unit }}</strong
                    ></span
                  >
                  <span
                    >· 入库后剩余
                    <strong>{{
                      quantitySummaries[row.detailKey].valid &&
                      quantitySummaries[row.detailKey].after >= 0
                        ? `${formatQuantity(quantitySummaries[row.detailKey].after)} ${row.source.unit}`
                        : '待修正'
                    }}</strong></span
                  >
                </div>
                <div
                  v-if="row.error || releases.quantityErrors.value.get(row.detailKey)"
                  class="error"
                >
                  {{ row.error || releases.quantityErrors.value.get(row.detailKey) }}
                </div></template
              ></el-table-column
            >
            <el-table-column width="110">
              <template #default="{ row }">
                <InboundSplitControl
                  :quantity="row.quantity"
                  :disabled="releases.locked.value || releases.selected.value.length >= 100"
                  @split="(quantity) => releases.split(row.detailKey, quantity)"
                />
                <el-button
                  type="danger"
                  link
                  :disabled="releases.locked.value"
                  @click="releases.remove(row.detailKey)"
                  >移除此目标</el-button
                >
              </template>
            </el-table-column>
          </el-table>
        </section>
      </div>
      <el-form
        label-width="80px"
        class="remark-form"
        ><el-form-item label="入库备注"
          ><el-input
            v-model="releases.remark.value"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            :disabled="releases.locked.value" /></el-form-item
      ></el-form>
      <el-alert
        v-if="releases.command.status.value !== 'idle'"
        title="上次确认结果尚未确定，已保留原数量和依据。请核对入库历史后按原操作重试，勿重复发起新入库。"
        type="warning"
        show-icon
        :closable="false"
      />
      <template #footer>
        <el-button
          :disabled="releases.command.busy.value || releases.checking.value"
          @click="releases.close"
          >{{ releases.command.status.value === 'idle' ? '收起并保留' : '核对后关闭' }}</el-button
        >
        <el-button
          v-if="releases.command.status.value === 'pending'"
          type="primary"
          :loading="releases.command.busy.value"
          @click="releases.command.retry"
          >按原操作重试</el-button
        >
        <el-button
          v-else
          type="primary"
          :loading="releases.command.busy.value"
          :disabled="releases.locked.value || !releases.canSubmit.value"
          @click="releases.submit"
          >确认实际入库</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import { useTabsStore } from '../../../stores/tabs';
import TableToolbar from '../../../components/TableToolbar.vue';
import InlineHint from '../../../components/InlineHint.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { formatQuantity } from '../../production/production-status';
import { usePurchaseInbounds } from '../../production/composables/usePurchaseInbounds';
import { usePurchaseInboundReleases } from '../composables/usePurchaseInboundReleases';
import PurchaseInboundHistoryGroups from './PurchaseInboundHistoryGroups.vue';
import PurchaseInboundReleaseGroups from './PurchaseInboundReleaseGroups.vue';
import InboundBatchTargetPicker from './InboundBatchTargetPicker.vue';
import InboundSplitControl from './InboundSplitControl.vue';

defineOptions({ name: 'PurchaseInboundPanel' });
const props = withDefaults(
  defineProps<{
    active?: boolean;
    requestedInboundId?: string | null;
    requestedReceiptLineId?: string | null;
  }>(),
  { active: true, requestedInboundId: null, requestedReceiptLineId: null },
);
const route = useRoute(),
  router = useRouter();
const goSource = async (name: string, query: Record<string, string>): Promise<void> => {
  if (releases.command.locked.value || releases.checking.value) {
    EMessage.warning('请先完成当前入库操作的核对或原操作重试');
    return;
  }
  await router.push({ name, query });
};
const view = ref('releases'),
  history = usePurchaseInbounds();
const historyKeyword = ref(''),
  historyPage = ref(1),
  historySize = ref(10);
const currentInboundId = ref<string | null>(null);
const locationOrigin = ref<'route' | 'confirmed' | null>(null);
const releases = usePurchaseInboundReleases(async (result) => {
  if (route.name === 'warehouse-inbound' && (route.query.inboundId || route.query.receiptLineId))
    await router.replace({
      query: { ...route.query, inboundId: undefined, receiptLineId: undefined },
    });
  await showInbound(result.inboundId, 'confirmed');
});
const locatedOnPage = computed(
  () =>
    !!currentInboundId.value &&
    history.rows.value.some((row) => row.inboundId === currentInboundId.value),
);
const detachedOrder = computed(() =>
  !locatedOnPage.value && history.detail.value?.inboundId === currentInboundId.value
    ? history.detail.value
    : null,
);
const selectedReceiptGroups = computed(() => {
  const byReceipt = new Map<
    string,
    {
      receiptId: string;
      receiptNo: string;
      receiptPurchaseNo: string;
      items: typeof releases.selected.value;
    }
  >();
  for (const row of releases.selected.value) {
    const source = row.source;
    let group = byReceipt.get(source.receiptId);
    if (!group) {
      group = {
        receiptId: source.receiptId,
        receiptNo: source.receiptNo,
        receiptPurchaseNo: source.receiptPurchaseNo,
        items: [],
      };
      byReceipt.set(source.receiptId, group);
    }
    group.items.push(row);
  }
  return [...byReceipt.values()];
});
const selectedSupplierCount = computed(
  () => new Set(releases.selected.value.map((row) => row.source.supplierId)).size,
);
const quantitySummaries = computed(() => {
  const firstDetails = new Map<string, string>();
  for (const row of releases.selected.value) {
    if (!firstDetails.has(row.source.allocationId))
      firstDetails.set(row.source.allocationId, row.detailKey);
  }
  return Object.fromEntries(
    releases.groupSummaries.value.map((group) => [
      firstDetails.get(group.source.allocationId)!,
      group,
    ]),
  );
});
let historyLoadSequence = 0;
const syncHistoryLocation = async (refreshDetached = false): Promise<void> => {
  if (!props.active || view.value !== 'history') return;
  const id = currentInboundId.value;
  if (!id) return;
  if (locatedOnPage.value) {
    history.closeDetail();
    return;
  }
  if (refreshDetached || history.detail.value?.inboundId !== id) await history.loadDetail(id);
};
const loadHistory = async (refreshDetached = false): Promise<void> => {
  const sequence = ++historyLoadSequence;
  await history.load({
    page: historyPage.value,
    pageSize: historySize.value,
    keyword: historyKeyword.value.trim() || undefined,
    status: 'completed',
  });
  if (sequence === historyLoadSequence && props.active && view.value === 'history')
    await syncHistoryLocation(refreshDetached);
};
const searchHistory = () => {
  historyPage.value = 1;
  return loadHistory();
};
const resetHistory = () => {
  historyKeyword.value = '';
  return searchHistory();
};
const changeHistoryPage = (page: number) => {
  historyPage.value = page;
  return loadHistory();
};
const changeHistorySize = (size: number) => {
  historySize.value = size;
  return searchHistory();
};
const releasePage = (page: number) => {
  releases.page.value = page;
  return releases.load();
};
const releaseSize = (size: number) => {
  releases.pageSize.value = size;
  return releases.search();
};
const refresh = () => (view.value === 'releases' ? releases.load() : loadHistory());
const refreshActive = async (): Promise<void> => {
  if (view.value === 'history') await loadHistory(true);
  else await releases.load();
  if (releases.visible.value && !releases.command.locked.value) await releases.recheck(false);
};
const closeConfirmation = () => {
  void releases.close();
};
async function showInbound(id: string, origin: 'route' | 'confirmed'): Promise<void> {
  view.value = 'history';
  currentInboundId.value = id;
  locationOrigin.value = origin;
  history.closeDetail();
  await loadHistory();
}
function clearHistoryLocation(): void {
  const oldId = currentInboundId.value;
  currentInboundId.value = null;
  locationOrigin.value = null;
  history.closeDetail();
  if (oldId && route.name === 'warehouse-inbound' && route.query.inboundId === oldId)
    void router.replace({ query: { ...route.query, inboundId: undefined } });
}
function retryHistoryLocation(): void {
  const id = currentInboundId.value;
  if (id && !locatedOnPage.value) void history.loadDetail(id);
}
let navigating = false;
let pendingLocation: readonly [string | null | undefined, string | null | undefined] | null = null;
async function locate(
  inboundId: string | null | undefined,
  receiptLineId: string | null | undefined,
): Promise<void> {
  if (!inboundId && !receiptLineId) {
    pendingLocation = null;
    if (locationOrigin.value === 'route') {
      historyLoadSequence += 1;
      history.cancelList();
      history.closeDetail();
      currentInboundId.value = null;
      locationOrigin.value = null;
    }
    return;
  }
  if (navigating) {
    pendingLocation = [inboundId, receiptLineId];
    historyLoadSequence += 1;
    history.cancelList();
    history.closeDetail();
    return;
  }
  if (
    (inboundId && inboundId === currentInboundId.value && view.value === 'history') ||
    (!inboundId && receiptLineId === releases.query.receiptLineId && view.value === 'releases')
  )
    return;
  const restore = async () => {
    if (route.name !== 'warehouse-inbound') return;
    if (route.query.inboundId !== inboundId && route.query.receiptLineId !== receiptLineId) return;
    await router.replace({
      query: {
        ...route.query,
        sourceType: 'purchased',
        inboundId: currentInboundId.value || undefined,
        receiptLineId: releases.query.receiptLineId || undefined,
      },
    });
  };
  navigating = true;
  try {
    if (releases.command.locked.value || releases.checking.value) {
      EMessage.warning('请先完成当前入库操作的核对或原操作重试');
      await restore();
      return;
    }
    if (releases.selected.value.length && !(await releases.clear())) {
      await restore();
      return;
    }
    if (inboundId !== props.requestedInboundId || receiptLineId !== props.requestedReceiptLineId)
      return;
    if (inboundId) {
      await showInbound(inboundId, 'route');
    } else if (receiptLineId) {
      clearHistoryLocation();
      view.value = 'releases';
      releases.query.receiptLineId = receiptLineId;
      await releases.search();
    }
  } finally {
    navigating = false;
    const next = pendingLocation;
    pendingLocation = null;
    if (next && next[0] === props.requestedInboundId && next[1] === props.requestedReceiptLineId)
      void locate(next[0], next[1]);
  }
}
watch(
  () => [props.requestedInboundId, props.requestedReceiptLineId] as const,
  ([id, receiptLineId]) => {
    void locate(id, receiptLineId);
  },
  { immediate: true },
);
watch(view, (value) => {
  if (value !== 'history') {
    historyLoadSequence += 1;
    history.cancelList();
    history.closeDetail();
  }
});
onMounted(() => {
  if (props.active) void refreshActive();
});
watch(
  () => props.active,
  (active) => {
    if (active) void refreshActive();
    else {
      historyLoadSequence += 1;
      history.cancelList();
      history.closeDetail();
    }
  },
);
let activated = false;
onActivated(() => {
  if (activated && props.active) void refreshActive();
  activated = true;
});
onScopeDispose(useTabsStore().registerCloseGuard('warehouse-inbound', releases.clear));
</script>

<style scoped>
.purchase-inbounds {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.query-panel,
.table-panel {
  border: 1px solid var(--el-border-color);
  background: #fff;
  border-radius: 6px;
}
.query-panel {
  padding: 16px 16px 0;
}
.query-panel :deep(.el-input) {
  width: 280px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
.error {
  color: var(--el-color-danger);
  font-size: 12px;
  margin-top: 4px;
}
.dialog-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin: 16px 0;
}
.multi-receipt-hint {
  margin-bottom: 12px;
}
.review-groups {
  max-height: 430px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
}
.review-group + .review-group {
  margin-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.review-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 20px;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 22px;
}
.review-heading strong {
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 700;
}
.remark-form {
  margin-top: 16px;
}
.inbound-hint {
  margin: 0;
}
.current-location {
  margin: 0 16px 12px;
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: var(--el-border-radius-base);
  overflow: hidden;
}
.current-location-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 10px 16px;
  background: var(--el-color-primary-light-9);
  font-size: 13px;
}
.current-location-note {
  padding: 8px 16px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.current-location-heading span {
  flex: 1 1 auto;
  overflow-wrap: anywhere;
  color: var(--el-text-color-regular);
}
.current-location-body {
  min-height: 48px;
}
.location-status {
  padding: 12px 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.current-location-body > :deep(.el-alert),
.current-location-body > :deep(.el-button) {
  margin: 8px 16px;
}
.quantity-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0 6px;
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
.quantity-summary strong {
  color: var(--el-text-color-primary);
}
.quantity-summary.is-invalid strong {
  color: var(--el-color-danger);
}
</style>
