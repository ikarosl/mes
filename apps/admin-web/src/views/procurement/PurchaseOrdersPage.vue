<template>
  <section ref="pageRoot">
    <div class="query-panel">
      <el-form
        inline
        :model="query"
        class="query-form"
        @submit.prevent="search"
      >
        <el-form-item label="采购单"
          ><el-input
            v-model="query.keyword"
            clearable
            placeholder="输入采购单号或供应商"
        /></el-form-item>
        <el-form-item label="来源"
          ><el-select
            v-model="query.sourceType"
            clearable
            placeholder="全部"
            style="width: 170px"
            ><el-option
              v-for="type in PURCHASE_ORDER_SOURCE_TYPES"
              :key="type"
              :value="type"
              :label="PURCHASE_ORDER_SOURCE_TYPE_LABELS[type]" /></el-select
        ></el-form-item>
        <el-form-item label="状态"
          ><el-select
            v-model="query.status"
            clearable
            placeholder="全部"
            style="width: 140px"
            ><el-option
              v-for="status in PURCHASE_ORDER_STATUSES"
              :key="status"
              :value="status"
              :label="PURCHASE_ORDER_STATUS_LABELS[status]" /></el-select
        ></el-form-item>
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
    <div
      ref="tablePanel"
      class="table-panel"
    >
      <TableToolbar>
        <template #actions
          ><el-button
            type="primary"
            :icon="Plus"
            @click="create('demand')"
            >按需求采购</el-button
          ><el-button
            :icon="Plus"
            @click="create('stock')"
            >独立备料采购</el-button
          ></template
        >
        <template #tools
          ><el-button
            :icon="Refresh"
            text
            circle
            :loading="loading"
            aria-label="刷新采购列表"
            @click="load()"
        /></template>
      </TableToolbar>
      <section
        v-if="focusedOutsidePage || locationError"
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
          v-if="locationError"
          class="location-feedback"
        >
          <InlineHint tone="danger">{{ locationError }}</InlineHint>
          <el-button
            link
            type="primary"
            :disabled="blocked"
            @click="retryLocation"
            >重试跳转</el-button
          >
        </div>
        <template v-if="focusedOutsidePage && expansion.focused.value">
          <p class="located-note">此采购单不在当前筛选页，不计入分页总数。</p>
          <div class="located-order-heading">
            <DisclosureToggle
              :expanded="expansion.expanded.value.includes(expansion.focusedId.value)"
              :label="`采购单 ${expansion.focused.value.purchaseNo} 的物料`"
              @toggle="toggleLocatedOrder"
            />
            <strong :id="`purchase-order-${expansion.focusedId.value}`">{{
              expansion.focused.value.purchaseNo
            }}</strong>
            <span>{{ expansion.focused.value.supplierName }}</span>
            <el-tag v-bind="purchaseOrderStatusTag(expansion.focused.value.status)">{{
              PURCHASE_ORDER_STATUS_LABELS[expansion.focused.value.status]
            }}</el-tag>
            <div class="located-order-actions">
              <el-button
                link
                type="primary"
                :disabled="blocked"
                @click="viewOrEdit(expansion.focusedId.value)"
                >查看/编辑</el-button
              >
              <el-button
                v-if="expansion.focused.value.status === 'draft'"
                link
                type="primary"
                :disabled="blocked"
                @click="handleAction(expansion.focusedId.value, 'place')"
                >正式下单</el-button
              >
              <el-button
                v-if="['draft', 'ordered'].includes(expansion.focused.value.status)"
                link
                type="danger"
                :disabled="blocked"
                @click="handleAction(expansion.focusedId.value, 'cancel')"
                >取消整单</el-button
              >
              <el-button
                v-if="expansion.focused.value.status === 'ordered'"
                link
                type="primary"
                :disabled="blocked"
                @click="handleAction(expansion.focusedId.value, 'close-order')"
                >结束整单</el-button
              >
            </div>
          </div>
          <PurchaseOrderExpandedRows
            v-if="expansion.expanded.value.includes(expansion.focusedId.value)"
            :detail="expansion.focused.value"
            :focused-line-id="focusedLineId"
            :loading="expansion.entries[expansion.focusedId.value]?.loading ?? false"
            :failed="expansion.entries[expansion.focusedId.value]?.failed ?? false"
            :disabled="blocked"
            :line-count="expansion.focused.value.lineCount"
            @refresh="expansion.read(expansion.focusedId.value, true)"
            @close-line="handleAction(expansion.focusedId.value, 'close', $event)"
            @reopen-line="handleAction(expansion.focusedId.value, 'reopen', $event)"
            @supplements="showSupplements"
            @supplement="openSupplement(expansion.focusedId.value, $event)"
            @supplement-origin="navigateSupplementOrigin"
            @receipt-records="openReceiptRecords(expansion.focusedId.value, $event)"
            @source-receipt="goSourceReceipt"
            @navigate="navigate"
          />
        </template>
      </section>
      <el-table
        ref="orderTable"
        v-loading="loading"
        :data="rows"
        :expand-row-keys="expansion.expanded.value"
        :row-class-name="orderClassName"
        row-key="id"
        class="data-table"
        empty-text="暂无采购单"
        @expand-change="expandChanged"
      >
        <el-table-column
          type="expand"
          width="48"
        >
          <template #default="{ row }">
            <PurchaseOrderExpandedRows
              :detail="expansion.entries[row.id]?.detail ?? null"
              :focused-line-id="expansion.focusedId.value === row.id ? focusedLineId : undefined"
              :loading="expansion.entries[row.id]?.loading ?? false"
              :failed="expansion.entries[row.id]?.failed ?? false"
              :disabled="blocked"
              :line-count="row.lineCount"
              @refresh="expansion.read(row.id, true)"
              @close-line="handleAction(row.id, 'close', $event)"
              @reopen-line="handleAction(row.id, 'reopen', $event)"
              @supplements="showSupplements"
              @supplement="openSupplement(row.id, $event)"
              @supplement-origin="navigateSupplementOrigin"
              @receipt-records="openReceiptRecords(row.id, $event)"
              @source-receipt="goSourceReceipt"
              @navigate="navigate"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="采购单号"
          min-width="170"
        >
          <template #default="{ row }">
            <div class="purchase-order-identity">
              <strong
                :id="`purchase-order-${row.id}`"
                class="purchase-order-number"
                >{{ row.purchaseNo }}</strong
              >
            </div>
          </template>
        </el-table-column>
        <el-table-column
          prop="supplierName"
          label="供应商"
          min-width="160"
        />
        <el-table-column
          prop="workOrderNo"
          label="所属工单"
          min-width="145"
        />
        <el-table-column
          label="采购来源"
          min-width="110"
          ><template #default="{ row }">{{
            PURCHASE_ORDER_SOURCE_TYPE_LABELS[row.sourceType as PurchaseOrderSourceType]
          }}</template></el-table-column
        >
        <el-table-column
          label="补单原因"
          min-width="105"
          ><template #default="{ row }"
            ><el-tag
              v-if="row.supplementReason"
              size="small"
              v-bind="purchaseOrderSupplementReasonTag(row.supplementReason)"
              >{{
                PURCHASE_ORDER_SUPPLEMENT_REASON_LABELS[
                  row.supplementReason as PurchaseOrderSupplementReason
                ]
              }}</el-tag
            ><span v-else>—</span></template
          ></el-table-column
        >
        <el-table-column
          label="状态"
          min-width="95"
          ><template #default="{ row }"
            ><el-tag v-bind="purchaseOrderStatusTag(row.status as PurchaseOrderStatus)">{{
              PURCHASE_ORDER_STATUS_LABELS[row.status as PurchaseOrderStatus]
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column
          prop="lineCount"
          label="物料行"
          width="76"
        />
        <el-table-column
          label="创建时间"
          min-width="175"
          ><template #default="{ row }">{{
            formatDateTimeForDisplay(row.createdAt)
          }}</template></el-table-column
        >
        <el-table-column
          label="主单操作"
          fixed="right"
          :width="actionColumnWidth"
        >
          <template #header><span class="purchase-order-actions-heading">主单操作</span></template>
          <template #default="{ row }">
            <div class="purchase-order-actions">
              <el-button
                link
                type="primary"
                :disabled="blocked"
                @click="viewOrEdit(row.id)"
                >查看/编辑</el-button
              >
              <el-button
                v-if="row.status === 'draft'"
                link
                type="primary"
                :disabled="blocked"
                @click="handleAction(row.id, 'place')"
                >正式下单</el-button
              >
              <el-button
                v-if="row.status === 'draft' || row.status === 'ordered'"
                link
                type="danger"
                :disabled="blocked"
                @click="handleAction(row.id, 'cancel')"
                >取消整单</el-button
              >
              <el-button
                v-if="row.status === 'ordered'"
                link
                type="primary"
                :disabled="blocked"
                @click="handleAction(row.id, 'close-order')"
                >结束整单</el-button
              >
            </div>
          </template>
        </el-table-column>
      </el-table>
      <PaginationFooter
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        @page-change="changePage"
        @update:page-size="changePageSize"
      />
    </div>
    <PurchaseOrderEditorDialog
      ref="editor"
      @saved="actionChanged($event, null)"
    />
    <PurchaseOrderActionDialog
      ref="actions"
      @changed="actionChanged"
    />
    <PurchaseOrderDetailsDialog
      ref="details"
      @changed="actionChanged($event, null)"
    />
    <RelatedSupplementsDialog
      ref="supplements"
      @navigate="navigateRelatedSupplement"
    />
    <PurchaseOrderSupplementDialog
      ref="supplement"
      @saved="(_id, originId) => actionChanged(originId, null)"
      @related-navigate="navigateRelatedSupplement"
      @source-order="
        openSupplement(
          $event.orderId,
          undefined,
          $event.reason ?? 'excess_purchase',
          undefined,
          true,
        )
      "
    />
    <PurchaseOrderLineReceiptRecordsDialog
      ref="receiptRecords"
      @source-receipt="goSourceReceipt"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, onScopeDispose, ref, watch } from 'vue';
import type { TableInstance } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import { Close, Plus, Refresh } from '@element-plus/icons-vue';
import type {
  PurchaseOrderDetail,
  PurchaseOrderItem,
  PurchaseOrderSourceType,
  PurchaseOrderStatus,
  PurchaseOrderSupplementReason,
} from '@company/contracts';
import {
  PURCHASE_ORDER_SOURCE_TYPES,
  PURCHASE_ORDER_SOURCE_TYPE_LABELS,
  PURCHASE_ORDER_STATUSES,
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_ORDER_SUPPLEMENT_REASON_LABELS,
} from '@company/constants';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import DisclosureToggle from '../../components/DisclosureToggle.vue';
import InlineHint from '../../components/InlineHint.vue';
import { formatDateTimeForDisplay } from '../../utils/date';
import { EMessage } from '../../utils/message';
import { usePurchaseOrdersList } from './composables/usePurchaseOrdersList';
import type { PurchaseOrderAction } from './composables/usePurchaseOrderActions';
import {
  purchaseOrderStatusTag,
  purchaseOrderSupplementReasonTag,
} from './purchase-order-presentation';
import type { RelatedSupplementLocation } from './purchase-order-location';
import PurchaseOrderEditorDialog from './components/PurchaseOrderEditorDialog.vue';
import PurchaseOrderActionDialog from './components/PurchaseOrderActionDialog.vue';
import PurchaseOrderDetailsDialog from './components/PurchaseOrderDetailsDialog.vue';
import PurchaseOrderExpandedRows from './components/PurchaseOrderExpandedRows.vue';
import RelatedSupplementsDialog from './components/RelatedSupplementsDialog.vue';
import PurchaseOrderSupplementDialog from './components/PurchaseOrderSupplementDialog.vue';
import PurchaseOrderLineReceiptRecordsDialog from './components/PurchaseOrderLineReceiptRecordsDialog.vue';
import { usePurchaseOrderExpansion } from './composables/usePurchaseOrderExpansion';
import { useRouteAccess } from '../../composables/useRouteAccess';
import { useTableActionColumn } from '../../composables/useTableActionColumn';

defineOptions({ name: 'PurchaseOrdersPage' });
const route = useRoute(),
  router = useRouter();
const { canAccessRoute } = useRouteAccess();
const expansion = usePurchaseOrderExpansion();
const hasExplicitEntry = (): boolean =>
  route.name === 'procurement-orders' &&
  [route.query.purchaseOrderId, route.query.demandId, route.query.supplementLineId].some(
    (value) => typeof value === 'string' && value.length > 0,
  );
let initialListExpansionHandled = false;
let initialEntryIsExplicit = hasExplicitEntry();
const {
  query,
  rows,
  total,
  page,
  pageSize,
  loading,
  load,
  search: searchOrders,
  reset: resetOrders,
  changePage: changeOrdersPage,
  changePageSize: changeOrdersPageSize,
} = usePurchaseOrdersList((listRows, options) => {
  // 定位读取成功后才写入路由，进行中的办理也优先于默认首条。
  const explicitEntry =
    navigating.value ||
    hasExplicitEntry() ||
    (options.expansionMode === 'initial' && initialEntryIsExplicit);
  initialListExpansionHandled = true;
  expansion.sync(listRows, {
    refreshExpanded: options.refreshExpanded,
    initializeExpansion: options.expansionMode !== 'preserve' && !explicitEntry,
  });
});
const focusedOutsidePage = computed(
  () =>
    Boolean(expansion.focused.value) &&
    !rows.value.some((row) => row.id === expansion.focusedId.value),
);
const { tablePanel, actionColumnWidth } = useTableActionColumn(
  rows,
  '.purchase-order-actions, .purchase-order-actions-heading',
);
const editor = ref<InstanceType<typeof PurchaseOrderEditorDialog>>(),
  actions = ref<InstanceType<typeof PurchaseOrderActionDialog>>(),
  details = ref<InstanceType<typeof PurchaseOrderDetailsDialog>>(),
  supplement = ref<InstanceType<typeof PurchaseOrderSupplementDialog>>(),
  supplements = ref<InstanceType<typeof RelatedSupplementsDialog>>(),
  receiptRecords = ref<InstanceType<typeof PurchaseOrderLineReceiptRecordsDialog>>();
const navigating = ref(false);
const focusedLineId = ref('');
const locationError = ref('');
let retryTarget: (() => Promise<boolean>) | undefined;
const pageRoot = ref<HTMLElement>();
const orderTable = ref<TableInstance>();
const orderClassName = ({ row }: { row: PurchaseOrderItem }): string =>
  row.id === expansion.focusedId.value ? 'purchase-order-highlight' : '';
const LOCATE_QUERY_KEYS = [
  'purchaseOrderId',
  'purchaseOrderLineId',
  'demandId',
  'workOrderId',
  'supplementLineId',
  'supplementReason',
  'receiptLineId',
] as const;
type LocateQuery = Partial<Record<(typeof LOCATE_QUERY_KEYS)[number], string>>;
const readLocateQuery = (): LocateQuery => {
  const query: LocateQuery = {};
  for (const key of LOCATE_QUERY_KEYS) {
    const value = route.query[key];
    if (typeof value === 'string' && value) query[key] = value;
  }
  return query;
};
const locateToken = (query: LocateQuery): string =>
  JSON.stringify(LOCATE_QUERY_KEYS.map((key) => query[key] ?? ''));
let active = true;
let routeRevision = 0;
let navigationRevision = 0;
let navigationRouteRevision = -1;
let consumed = '';
let accepted: LocateQuery = {};
let routeWrite: { revision: number; token: string } | undefined;
let pendingLocate = false;
const isCurrent = (revision: number): boolean =>
  active && route.name === 'procurement-orders' && revision === routeRevision;
const rememberLocation = (query: LocateQuery): void => {
  accepted = { ...query };
  consumed = locateToken(query);
};
const writeLocation = async (location: LocateQuery, current: () => boolean): Promise<boolean> => {
  if (!current()) return false;
  const query = { ...route.query };
  for (const key of LOCATE_QUERY_KEYS) delete query[key];
  Object.assign(query, location);
  const writing = { revision: routeRevision, token: locateToken(location) };
  routeWrite = writing;
  try {
    await router.replace({ query });
    return current() && locateToken(readLocateQuery()) === writing.token;
  } finally {
    if (routeWrite === writing) routeWrite = undefined;
  }
};
const scrollLocation = async (
  id: string,
  lineId: string | undefined,
  current: () => boolean,
): Promise<void> => {
  await nextTick();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  if (!current()) return;
  orderTable.value?.setScrollLeft(0);
  const identity = document.getElementById(
    lineId ? `purchase-order-line-${lineId}` : `purchase-order-${id}`,
  );
  if (!identity || !pageRoot.value?.contains(identity)) return;
  const row = identity.closest('tr');
  row?.scrollIntoView({ block: lineId ? 'center' : 'start', inline: 'nearest' });
  identity.scrollIntoView({ block: 'nearest', inline: 'nearest' });
};
const finishNavigation = (): void => {
  navigating.value = false;
  if (pendingLocate && active && route.name === 'procurement-orders') {
    pendingLocate = false;
    void locate();
  }
};
const beginNavigation = (): void => {
  navigationRouteRevision = routeRevision;
  navigating.value = true;
};
const blocked = computed(
  () =>
    navigating.value ||
    Boolean(
      editor.value?.locked ||
      actions.value?.locked ||
      details.value?.locked ||
      supplement.value?.locked,
    ),
);
const releaseDialogs = async (
  current: () => boolean = () => active && route.name === 'procurement-orders',
): Promise<boolean> => {
  if (!current()) return false;
  if (
    editor.value?.locked ||
    actions.value?.locked ||
    details.value?.locked ||
    supplement.value?.locked
  ) {
    EMessage.warning('请先确认当前操作结果，再切换采购记录');
    return false;
  }
  if (editor.value?.visible && !(await editor.value.close())) return false;
  if (!current()) return false;
  if (actions.value?.visible && !(await actions.value.close())) return false;
  if (!current()) return false;
  if (details.value?.visible && !(await details.value.close())) return false;
  if (!current()) return false;
  if (supplement.value?.visible && !(await supplement.value.close())) return false;
  if (!current()) return false;
  if (supplements.value?.visible) supplements.value.close();
  if (receiptRecords.value?.visible) receiptRecords.value.close();
  return true;
};
const focusOrder = async (
  id: string,
  resolveLine: (detail: PurchaseOrderDetail) => string | undefined | false,
): Promise<boolean> => {
  if (navigating.value) return false;
  const revision = routeRevision;
  const operation = ++navigationRevision;
  const current = (): boolean => isCurrent(revision) && operation === navigationRevision;
  beginNavigation();
  try {
    if (!current() || !(await releaseDialogs(current))) return false;
    locationError.value = '';
    retryTarget = () => focusOrder(id, resolveLine);
    let selectedLineId: string | undefined;
    let location: LocateQuery = {};
    const loaded = await expansion.focus(id, async (detail) => {
      if (!current()) return false;
      const lineId = resolveLine(detail);
      if (lineId === false) return false;
      selectedLineId = lineId;
      location = { purchaseOrderId: id, ...(lineId ? { purchaseOrderLineId: lineId } : {}) };
      return writeLocation(location, current);
    });
    if (!loaded || !current()) {
      if (current()) locationError.value = '跳转目标未能读取或定位，请核对来源后重试。';
      return false;
    }
    focusedLineId.value = selectedLineId ?? '';
    rememberLocation(location);
    await scrollLocation(id, selectedLineId, current);
    return current();
  } finally {
    finishNavigation();
  }
};
const navigate = (id: string, lineId?: string): Promise<boolean> =>
  focusOrder(id, (detail) => {
    if (lineId && !detail.items.some((item) => item.id === lineId)) {
      EMessage.warning('指定采购行已不在该采购单中，请重新核对来源');
      return false;
    }
    return lineId;
  });
const navigateRelatedSupplement = (target: RelatedSupplementLocation): Promise<boolean> =>
  focusOrder(target.purchaseOrderId, (detail) => {
    const matches = detail.items.filter(
      (item) =>
        item.originOrderLineId === target.originOrderLineId &&
        (!target.originReceiptLineId || item.originReceiptLineId === target.originReceiptLineId) &&
        (!target.supplementReason || detail.supplementReason === target.supplementReason),
    );
    if (matches.length === 1) return matches[0]?.id;
    EMessage.warning('未能唯一定位关联明细，请核对本单来源');
    return undefined;
  });
const clearLocation = async (): Promise<void> => {
  navigationRevision += 1;
  pendingLocate = false;
  expansion.clearFocus();
  focusedLineId.value = '';
  locationError.value = '';
  retryTarget = undefined;
  rememberLocation({});
  const revision = routeRevision;
  await writeLocation({}, () => isCurrent(revision));
};
const search = async (): Promise<void> => {
  await clearLocation();
  await searchOrders();
};
const reset = async (): Promise<void> => {
  await clearLocation();
  await resetOrders();
};
const changePage = async (value: number): Promise<void> => {
  await clearLocation();
  await changeOrdersPage(value);
};
const changePageSize = async (value: number): Promise<void> => {
  await clearLocation();
  await changeOrdersPageSize(value);
};
const toggleLocatedOrder = (): void => {
  const id = expansion.focusedId.value;
  if (id) expansion.setExpanded(id, !expansion.expanded.value.includes(id));
};
const create = async (
  type: PurchaseOrderSourceType,
  demandIds?: string[],
  workOrderId?: string,
  consumeIntent = false,
): Promise<boolean> => {
  if (navigating.value) return false;
  const revision = routeRevision;
  const operation = ++navigationRevision;
  const current = (): boolean => isCurrent(revision) && operation === navigationRevision;
  beginNavigation();
  try {
    if (!(await releaseDialogs(current))) return false;
    await editor.value?.open(type, undefined, demandIds, workOrderId);
    if (!current()) return false;
    if (!consumeIntent) return true;
    const location: LocateQuery = {};
    if (expansion.focusedId.value) {
      location.purchaseOrderId = expansion.focusedId.value;
      if (focusedLineId.value) location.purchaseOrderLineId = focusedLineId.value;
    }
    if (!(await writeLocation(location, current))) return false;
    rememberLocation(location);
    return true;
  } finally {
    finishNavigation();
  }
};
const viewOrEdit = async (id: string): Promise<void> => {
  if (navigating.value) return;
  const revision = routeRevision;
  const operation = ++navigationRevision;
  const current = (): boolean => isCurrent(revision) && operation === navigationRevision;
  beginNavigation();
  try {
    if (!(await releaseDialogs(current))) return;
    const value = await details.value?.open(id);
    if (!value || !current()) return;
    if (value.status === 'draft') await editor.value?.open(value.sourceType, value);
  } finally {
    finishNavigation();
  }
};
const handleAction = async (id: string, action: PurchaseOrderAction, lineId?: string) => {
  if (navigating.value) return;
  navigationRevision += 1;
  beginNavigation();
  try {
    if (!(await releaseDialogs())) return;
    await actions.value?.open(id, action, lineId);
  } finally {
    finishNavigation();
  }
};
const openSupplement = async (
  orderId: string,
  lineId?: string,
  reason?: PurchaseOrderSupplementReason,
  receiptLineId?: string,
  locateOrder = false,
): Promise<boolean> => {
  if (navigating.value) return false;
  const revision = routeRevision;
  const operation = ++navigationRevision;
  const current = (): boolean => isCurrent(revision) && operation === navigationRevision;
  beginNavigation();
  try {
    if (!(await releaseDialogs(current))) return false;
    if (!locateOrder)
      return (
        Boolean(await supplement.value?.open(orderId, { lineId, reason, receiptLineId })) &&
        current()
      );
    locationError.value = '';
    retryTarget = () => openSupplement(orderId, lineId, reason, receiptLineId, true);
    const location: LocateQuery = {
      purchaseOrderId: orderId,
      ...(lineId ? { purchaseOrderLineId: lineId } : {}),
    };
    const loaded = await expansion.focus(orderId, async (detail) => {
      if (!current()) return false;
      if (lineId && !detail.items.some((item) => item.id === lineId)) {
        EMessage.warning('指定采购行已不在该采购单中，请重新核对来源');
        return false;
      }
      const opened = await supplement.value?.open(orderId, {
        lineId,
        reason,
        receiptLineId,
      });
      return Boolean(opened) && current() && (await writeLocation(location, current));
    });
    if (!loaded || !current()) {
      if (current()) locationError.value = '跳转目标未能读取或定位，请核对来源后重试。';
      return false;
    }
    focusedLineId.value = lineId ?? '';
    rememberLocation(location);
    return true;
  } finally {
    finishNavigation();
  }
};
const navigateSupplementOrigin = (id: string): Promise<boolean> =>
  openSupplement(id, undefined, 'excess_purchase', undefined, true);
const actionChanged = async (id: string, latest: PurchaseOrderDetail | null): Promise<void> => {
  const revision = routeRevision;
  const operation = navigationRevision;
  if (latest) expansion.replace(latest);
  await load({ refreshExpanded: false });
  if (!isCurrent(revision) || operation !== navigationRevision) return;
  if (expansion.expanded.value.includes(id) && (!latest || !expansion.entries[id]?.detail))
    await expansion.read(id, true);
};
const expandChanged = (row: PurchaseOrderItem, expandedRows: PurchaseOrderItem[]) => {
  expansion.setExpanded(
    row.id,
    expandedRows.some((item) => item.id === row.id),
  );
};
const showSupplements = async (id: string) => {
  navigationRevision += 1;
  if (await releaseDialogs()) await supplements.value?.open(id);
};
const openReceiptRecords = async (orderId: string, lineId: string): Promise<void> => {
  if (navigating.value) return;
  navigationRevision += 1;
  beginNavigation();
  try {
    if (!(await releaseDialogs())) return;
    const detail = expansion.entries[orderId]?.detail;
    if (
      !detail ||
      !detail.items.some((line) => line.id === lineId && line.fulfillmentMode === 'new_arrival')
    ) {
      EMessage.warning('该采购行已不在当前明细中，请刷新本单后重试');
      return;
    }
    await receiptRecords.value?.open(detail, lineId);
  } finally {
    finishNavigation();
  }
};
const goSourceReceipt = async (id: string) => {
  if (canAccessRoute({ name: 'procurement-receipts' }) && (await releaseDialogs()))
    await router.push({ name: 'procurement-receipts', query: { receiptLineId: id } });
};
const retryLocation = (): void => {
  if (locationError.value && !blocked.value) void retryTarget?.();
};
const locate = async (): Promise<void> => {
  const revision = routeRevision;
  const current = (): boolean => isCurrent(revision);
  if (!current()) return;
  await nextTick();
  if (!current()) return;
  if (navigating.value) {
    if (revision !== navigationRouteRevision) pendingLocate = true;
    return;
  }
  const query = readLocateQuery();
  const token = locateToken(query);
  const orderId = query.purchaseOrderId;
  const demandId = query.demandId;
  if (!orderId && !demandId) {
    consumed = token;
    return;
  }
  if (token === consumed) return;
  const reason =
    query.supplementReason === 'excess_purchase' || query.supplementReason === 'quality_replacement'
      ? query.supplementReason
      : undefined;
  // 已打开的路由意图在缓存恢复时沿用原草稿；只有成功定位才更新 accepted。
  consumed = token;
  let succeeded = false;
  if (orderId) {
    if (query.supplementLineId) {
      succeeded = await openSupplement(
        orderId,
        query.supplementLineId,
        reason,
        query.receiptLineId,
        true,
      );
    } else {
      succeeded = await navigate(orderId, query.purchaseOrderLineId);
    }
  } else if (demandId) {
    succeeded = await create('demand', [demandId], query.workOrderId, true);
  }
  if (succeeded || !current() || locateToken(readLocateQuery()) !== token) return;
  const previous = { ...accepted };
  if (await writeLocation(previous, current)) rememberLocation(previous);
};
watch(
  () => [
    route.name,
    route.query.purchaseOrderId,
    route.query.purchaseOrderLineId,
    route.query.demandId,
    route.query.workOrderId,
    route.query.supplementLineId,
    route.query.supplementReason,
    route.query.receiptLineId,
  ],
  () => {
    // 显式入口即使已消费或回滚，首次列表也不另选默认单据。
    if (!initialListExpansionHandled) initialEntryIsExplicit ||= hasExplicitEntry();
    if (
      route.name === 'procurement-orders' &&
      routeWrite?.revision === routeRevision &&
      routeWrite.token === locateToken(readLocateQuery())
    )
      return;
    routeRevision += 1;
    expansion.cancelPendingFocus();
    if (active && route.name === 'procurement-orders') void locate();
    else pendingLocate = false;
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
  expansion.cancelPendingFocus();
};
onDeactivated(deactivate);
onScopeDispose(deactivate);
</script>

<style scoped>
.query-panel {
  padding: 20px 20px 4px;
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.query-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0 20px;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
}
.table-panel {
  overflow: hidden;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.located-block {
  margin: 0 16px 16px;
  padding: 12px;
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: 8px;
}
.located-heading,
.located-order-heading,
.location-feedback {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.located-heading {
  justify-content: space-between;
}
.located-note {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.located-order-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}
.located-order-actions :deep(.el-button) {
  margin-left: 0;
}
.located-block :deep(.order-lines) {
  position: static;
  width: auto;
  margin: 12px 0 0;
}
.purchase-order-identity {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.purchase-order-number {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.purchase-order-actions {
  display: inline-flex;
  width: max-content;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.purchase-order-actions-heading {
  display: inline-block;
  white-space: nowrap;
}
.purchase-order-actions :deep(.el-button) {
  flex-shrink: 0;
  margin-left: 0;
  padding: 0;
}
.data-table :deep(.el-table__row.purchase-order-highlight > td.el-table__cell) {
  background: var(--el-color-primary-light-9);
}
.data-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
}
.data-table {
  container-type: inline-size;
}
.data-table :deep(.el-table__expanded-cell:has(> .order-lines)) {
  padding: 0;
}
</style>
