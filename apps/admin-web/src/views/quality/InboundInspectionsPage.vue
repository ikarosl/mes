<template>
  <section>
    <div class="query-panel">
      <el-form
        inline
        @submit.prevent="search"
      >
        <el-form-item label="质检 / 到货 / 采购 / 物料">
          <el-input
            v-model="keyword"
            clearable
            maxlength="100"
            placeholder="单号、供应商、名称或版本"
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
        <template #actions
          ><el-button
            type="primary"
            @click="createOrder"
            >新建质检主单</el-button
          ></template
        >
        <template #tools>
          <el-button
            text
            @click="expandPage"
            >展开当前页主单</el-button
          >
          <el-button
            text
            @click="collapsePage"
            >收起当前页主单</el-button
          >
          <el-button
            :icon="Refresh"
            text
            circle
            :loading="loading"
            aria-label="刷新质检主单"
            @click="load"
          />
        </template>
      </TableToolbar>
      <div class="list-hint"></div>
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
        <span v-if="locationLoading">正在定位当前到货归属…</span>
        <span v-else-if="locationError">{{ locationError }}</span>
        <span v-else
          >当前定位：到货行 ID：<strong class="identity-value">{{ focusedLineId }}</strong></span
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
        class="document-block located-block"
      >
        <div class="document-heading">
          <div class="order-identity located-identity">
            <span class="order-title">
              <template v-if="focusedOrder"
                >质检单 <span class="order-number">{{ focusedOrder.inspectionNo }}</span></template
              >
              <template v-else>未关联质检主单</template>
            </span>
            <el-tag
              size="small"
              effect="plain"
              >当前定位</el-tag
            >
            <p
              v-if="focusedOrder?.remark"
              class="order-remark"
            >
              <span class="remark-label">主单备注</span>{{ focusedOrder.remark }}
            </p>
          </div>
          <span class="document-meta">此到货不在当前目录页，不计入分页总数</span>
        </div>
        <div class="receipt-directory located-directory">
          <div class="receipt-tree">
            <IncomingInspectionReceipt
              :receipt="focusedReceipt.receipt"
              :state="focusedReceipt"
              :expanded="focusedExpanded"
              :highlighted-line-id="focusedLineId"
              @toggle="focusedExpanded = !focusedExpanded"
              @retry="list.revealLine(focusedLineId)"
              @associate="changeAssociation"
              @open="openLine"
            />
          </div>
        </div>
      </section>
      <div
        v-loading="loading"
        class="order-list"
      >
        <el-empty
          v-if="!groups.length && !loading && !error"
          description="当前筛选下暂无质检主单，可新建并选择未关联到货"
          :image-size="72"
        />
        <section
          v-for="group in groups"
          :key="group.order.id"
          class="document-block"
        >
          <div class="document-heading">
            <div class="order-identity">
              <button
                class="order-disclosure"
                type="button"
                :aria-expanded="expandedOrders.has(group.order.id)"
                @click="toggleOrder(group)"
              >
                <span class="order-fold-icon">
                  <el-icon
                    :class="{ 'is-expanded': expandedOrders.has(group.order.id) }"
                    aria-hidden="true"
                    ><ArrowRight
                  /></el-icon>
                </span>
                <span class="order-title"
                  >质检单 <span class="order-number">{{ group.order.inspectionNo }}</span></span
                >
              </button>
              <p
                v-if="group.order.remark"
                class="order-remark"
              >
                <span class="remark-label">主单备注</span>{{ group.order.remark }}
              </p>
              <span class="document-meta"
                >创建于 {{ formatDateTimeForDisplay(group.order.createdAt) }}</span
              >
            </div>
            <div class="order-actions">
              <el-button
                link
                type="primary"
                @click="manageOrder(group.order)"
                >调整关联</el-button
              >
              <el-button
                link
                type="primary"
                @click="editRemark(group.order)"
                >编辑备注</el-button
              >
            </div>
          </div>
          <div
            v-if="expandedOrders.has(group.order.id)"
            v-loading="group.loading"
            class="receipt-directory"
          >
            <div
              v-if="group.error"
              class="directory-error"
            >
              <InlineHint tone="danger">{{ group.error }}</InlineHint
              ><el-button
                link
                type="primary"
                @click="loadReceipts(group)"
                >重新读取到货目录</el-button
              >
            </div>
            <template v-else>
              <el-empty
                v-if="group.loaded && !group.receipts.length"
                description="本页没有关联到货；空主单与编号继续保留"
                :image-size="56"
              />
              <div
                v-if="group.receipts.length"
                class="receipt-tree"
              >
                <IncomingInspectionReceipt
                  v-for="receipt in group.receipts"
                  :key="receipt.receiptId"
                  :receipt="receipt"
                  :state="group.lines[receipt.receiptId]"
                  :expanded="group.expandedReceipts.has(receipt.receiptId)"
                  :highlighted-line-id="focusedLineId"
                  @toggle="toggleReceipt(group, receipt)"
                  @retry="loadLines(group, receipt)"
                  @associate="changeAssociation"
                  @open="openLine"
                />
              </div>
            </template>
            <PaginationFooter
              class="receipt-pagination"
              :total="group.total"
              :current-page="group.page"
              :page-size="10"
              :show-page-size="false"
              :disabled="group.loading"
              total-suffix="张关联到货"
              @page-change="changeReceiptPage(group, $event)"
            />
          </div>
        </section>
      </div>
      <PaginationFooter
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        total-suffix="张质检主单"
        :disabled="loading"
        @page-change="changePage"
        @update:page-size="changePageSize"
      />
    </div>
    <InboundInspectionDetailDialog
      ref="detail"
      allow-association
      @changed="load"
      @record-focus-cleared="clearRecordLocation"
      @change-association="changeAssociationById"
    />
    <IncomingInspectionOrderAssociationDialog
      ref="association"
      @changed="load"
    />
  </section>
</template>
<script setup lang="ts">
import { nextTick, onActivated, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowRight, Refresh } from '@element-plus/icons-vue';
import type {
  QualityIncomingInspectionOrderItem,
  QualityIncomingInspectionReceiptItem,
} from '@company/contracts';
import PaginationFooter from '../../components/PaginationFooter.vue';
import TableToolbar from '../../components/TableToolbar.vue';
import InlineHint from '../../components/InlineHint.vue';
import { EMessage } from '../../utils/message';
import { formatDateTimeForDisplay } from '../../utils/date';
import { useTabsStore } from '../../stores/tabs';
import { useIncomingInspectionOrders } from './composables/useIncomingInspectionOrders';
import IncomingInspectionReceipt from './components/IncomingInspectionReceipt.vue';
import IncomingInspectionOrderAssociationDialog from './components/IncomingInspectionOrderAssociationDialog.vue';
import InboundInspectionDetailDialog from '../procurement/components/InboundInspectionDetailDialog.vue';

defineOptions({ name: 'InboundInspectionsPage' });
const route = useRoute(),
  router = useRouter();
const list = useIncomingInspectionOrders();
const {
  keyword,
  groups,
  expandedOrders,
  page,
  pageSize,
  total,
  loading,
  error,
  focusedReceipt,
  focusedOrder,
  focusedLineId,
  focusedIsInPage,
  locationLoading,
  locationError,
  load,
  search,
  reset,
  changePage,
  changePageSize,
  toggleOrder,
  toggleReceipt,
  loadReceipts,
  loadLines,
  changeReceiptPage,
  expandPage,
  collapsePage,
} = list;
const detail = ref<InstanceType<typeof InboundInspectionDetailDialog>>();
const association = ref<InstanceType<typeof IncomingInspectionOrderAssociationDialog>>();
const focusedExpanded = ref(true);
async function createOrder(): Promise<void> {
  await association.value?.open('create');
}
async function manageOrder(order: QualityIncomingInspectionOrderItem): Promise<void> {
  await association.value?.open('manage', order);
}
async function editRemark(order: QualityIncomingInspectionOrderItem): Promise<void> {
  await association.value?.open('remark', order);
}
async function changeAssociation(receipt: QualityIncomingInspectionReceiptItem): Promise<void> {
  await association.value?.open('move', undefined, receipt);
}
async function changeAssociationById(receiptId: string): Promise<void> {
  const findReceipt = () => {
    if (focusedReceipt.value?.receipt.receiptId === receiptId) return focusedReceipt.value.receipt;
    return groups.value
      .flatMap((group) => group.receipts)
      .find((receipt) => receipt.receiptId === receiptId);
  };
  let receipt = findReceipt();
  if (!receipt && detail.value?.openedLineId) {
    await list.revealLine(detail.value.openedLineId);
    receipt = findReceipt();
  }
  if (!receipt) {
    EMessage.warning('到货归属尚未定位，请重试列表定位后再调整关联。');
    return;
  }
  await association.value?.open('move', undefined, receipt);
}
async function clearLocation(): Promise<void> {
  list.clearLocation();
  accepted = {};
  consumed = JSON.stringify(['', '']);
  const query = { ...route.query };
  delete query.receiptLineId;
  delete query.caseId;
  await router.replace({ query });
}
watch(
  () => detail.value?.openedLineId,
  (id) => {
    if (id && route.name === 'quality-inbound-inspections') {
      focusedExpanded.value = true;
      void list.revealLine(id);
    }
  },
);
onScopeDispose(
  useTabsStore().registerCloseGuard(
    'quality-inbound-inspections',
    async () => !detail.value?.visible || (await detail.value.close()),
  ),
);
let navigating = false;
let pendingLocate = false;
let consumed = '';
let accepted: Record<string, string> = {};
let routeRevision = 0;
async function navigate(id: string, caseId = '', matches = () => true): Promise<boolean> {
  if (navigating) return false;
  if (detail.value?.locked) {
    EMessage.warning('请先确认当前检验操作结果再切换');
    return false;
  }
  navigating = true;
  try {
    if (detail.value?.visible && !(await detail.value.close())) return false;
    if (!matches()) return false;
    return (await detail.value?.open(id, caseId)) ?? false;
  } finally {
    navigating = false;
    if (pendingLocate) {
      pendingLocate = false;
      void locate();
    }
  }
}
async function openLine(id: string, caseId = '') {
  if (!(await navigate(id, caseId))) return;
  accepted = { receiptLineId: id, ...(caseId ? { caseId } : {}) };
  consumed = JSON.stringify([id, caseId]);
  const query = { ...route.query };
  query.receiptLineId = id;
  if (caseId) query.caseId = caseId;
  else delete query.caseId;
  await router.replace({ name: 'quality-inbound-inspections', query });
}
async function clearRecordLocation() {
  const id = detail.value?.openedLineId;
  if (!id) return;
  accepted = { receiptLineId: id };
  consumed = JSON.stringify([id, '']);
  const query = { ...route.query };
  query.receiptLineId = id;
  delete query.caseId;
  await router.replace({ name: 'quality-inbound-inspections', query });
}
async function locate(): Promise<void> {
  const revision = routeRevision;
  if (route.name !== 'quality-inbound-inspections') return;
  await nextTick();
  if (revision !== routeRevision || route.name !== 'quality-inbound-inspections') return;
  const lineId = typeof route.query.receiptLineId === 'string' ? route.query.receiptLineId : '';
  const caseId = typeof route.query.caseId === 'string' ? route.query.caseId : '';
  const token = JSON.stringify([lineId, caseId]);
  if (!lineId && !caseId) {
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
    caseId,
    () => revision === routeRevision && route.name === 'quality-inbound-inspections',
  );
  if (revision !== routeRevision || route.name !== 'quality-inbound-inspections') return;
  if (succeeded)
    accepted = { ...(lineId ? { receiptLineId: lineId } : {}), ...(caseId ? { caseId } : {}) };
  else {
    const query = { ...route.query };
    delete query.receiptLineId;
    delete query.caseId;
    consumed = JSON.stringify([accepted.receiptLineId ?? '', accepted.caseId ?? '']);
    await router.replace({ query: { ...query, ...accepted } });
  }
}
watch(
  () => [route.name, route.query.receiptLineId, route.query.caseId],
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
.order-list {
  min-width: 0;
  min-height: 160px;
}
.document-block {
  min-width: 0;
  margin: 0 16px 18px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}
.document-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 8px 20px;
  padding: 12px 16px;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.document-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.order-identity {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 20px;
  min-width: 0;
}
.order-title {
  font-size: 14px;
  font-weight: 400;
  overflow-wrap: anywhere;
}
.order-number {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.order-disclosure {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  max-width: 100%;
  min-height: 32px;
  margin-left: -4px;
  padding: 3px 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.order-disclosure:hover {
  background: var(--el-fill-color);
}
.order-disclosure:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.order-fold-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  flex: 0 0 14px;
  height: 14px;
  color: var(--el-text-color-regular);
}
.order-fold-icon .el-icon {
  font-size: 14px;
}
.order-fold-icon .is-expanded {
  transform: rotate(90deg);
}
.order-actions {
  display: flex;
  align-items: baseline;
  gap: 16px;
  margin-left: auto;
}
.order-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.order-remark {
  flex: 1 1 160px;
  min-width: 0;
  margin: 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.remark-label {
  margin-right: 10px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.receipt-directory {
  min-width: 0;
  min-height: 56px;
  padding: 16px 16px 0 24px;
}
.receipt-tree {
  min-width: 0;
  padding-left: 16px;
  border-left: 1px solid var(--el-border-color);
}
.receipt-pagination {
  justify-content: space-between;
  margin-top: 12px;
  margin-left: 17px;
  padding-right: 0;
  padding-left: 0;
  border-top: 1px solid var(--el-border-color-lighter);
}
.receipt-pagination :deep(.total-text) {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.directory-error {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 0 4px 17px;
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
  border-color: var(--el-color-primary-light-5);
}
.located-directory {
  padding-bottom: 16px;
}
</style>
