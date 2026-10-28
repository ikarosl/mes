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
          ><el-button
            v-if="hasExplicitEntry()"
            :disabled="blocked"
            @click="retryLocation"
            >重新读取定位</el-button
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
      <el-alert
        v-if="expansion.focused.value"
        :title="`当前定位：${expansion.focused.value.purchaseNo}${focusedOutsidePage ? '（临时置顶）' : ''}`"
        type="info"
        :closable="false"
        class="focus-notice"
      >
        <span v-if="focusedOutsidePage">该单不在当前查询页，分页总数仍对应查询结果。</span>
        <el-button
          link
          type="primary"
          :disabled="blocked"
          @click="clearLocation"
          >清除定位</el-button
        >
      </el-alert>
      <el-table
        ref="orderTable"
        v-loading="loading"
        :data="displayRows"
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
              @supplement-origin="openSupplement($event, undefined, 'excess_purchase')"
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
              <el-button
                :id="`purchase-order-${row.id}`"
                link
                type="primary"
                @click="expansion.setExpanded(row.id, !expansion.expanded.value.includes(row.id))"
                >{{ row.purchaseNo }}</el-button
              >
              <el-tag
                v-if="row.id === expansion.focusedId.value"
                size="small"
                type="primary"
                effect="light"
                >当前定位</el-tag
              >
            </div>
          </template>
        </el-table-column>
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
                v-if="row.status === 'draft'"
                link
                type="primary"
                :disabled="blocked"
                @click="edit(row.id)"
                >编辑草稿</el-button
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
              <el-button
                v-if="
                  row.status === 'ordered' &&
                  row.supplementReason !== 'excess_purchase' &&
                  auth.can(PERMISSIONS.warehouse.receipts.view)
                "
                link
                type="primary"
                :disabled="blocked"
                @click="goReceipts(row.id)"
                >记录到货</el-button
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
      @saved="saved"
    />
    <PurchaseOrderActionDialog
      ref="actions"
      @changed="actionChanged"
    />
    <RelatedSupplementsDialog
      ref="supplements"
      @navigate="navigateRelatedSupplement"
    />
    <PurchaseOrderSupplementDialog
      ref="supplement"
      @saved="saved"
      @related-navigate="navigateRelatedSupplement"
      @source-order="openSupplement($event.orderId, undefined, $event.reason ?? 'excess_purchase')"
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
import { Plus, Refresh } from '@element-plus/icons-vue';
import type {
  PurchaseOrderDetail,
  PurchaseOrderItem,
  PurchaseOrderSourceType,
  PurchaseOrderStatus,
  PurchaseOrderSupplementReason,
} from '@company/contracts';
import {
  PERMISSIONS,
  PURCHASE_ORDER_SOURCE_TYPES,
  PURCHASE_ORDER_SOURCE_TYPE_LABELS,
  PURCHASE_ORDER_STATUSES,
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_ORDER_SUPPLEMENT_REASON_LABELS,
} from '@company/constants';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
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
import PurchaseOrderExpandedRows from './components/PurchaseOrderExpandedRows.vue';
import RelatedSupplementsDialog from './components/RelatedSupplementsDialog.vue';
import PurchaseOrderSupplementDialog from './components/PurchaseOrderSupplementDialog.vue';
import PurchaseOrderLineReceiptRecordsDialog from './components/PurchaseOrderLineReceiptRecordsDialog.vue';
import { usePurchaseOrderExpansion } from './composables/usePurchaseOrderExpansion';
import { useAuthStore } from '../../stores/auth';
import { useRouteAccess } from '../../composables/useRouteAccess';
import { useTableActionColumn } from '../../composables/useTableActionColumn';

defineOptions({ name: 'PurchaseOrdersPage' });
const route = useRoute(),
  router = useRouter();
const auth = useAuthStore();
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
  search,
  reset,
  changePage,
  changePageSize,
} = usePurchaseOrdersList((listRows, refreshExpanded) => {
  expansion.sync(listRows, refreshExpanded);
  if (initialListExpansionHandled) return;
  initialListExpansionHandled = true;
  if (initialEntryIsExplicit) return;
  const first = listRows[0];
  if (first) expansion.setExpanded(first.id, true);
});
const focusedOutsidePage = computed(
  () =>
    Boolean(expansion.focused.value) &&
    !rows.value.some((row) => row.id === expansion.focusedId.value),
);
const displayRows = computed(() =>
  expansion.focused.value && focusedOutsidePage.value
    ? [expansion.focused.value, ...rows.value]
    : rows.value,
);
const { tablePanel, actionColumnWidth } = useTableActionColumn(
  displayRows,
  '.purchase-order-actions, .purchase-order-actions-heading',
);
const editor = ref<InstanceType<typeof PurchaseOrderEditorDialog>>(),
  actions = ref<InstanceType<typeof PurchaseOrderActionDialog>>(),
  supplement = ref<InstanceType<typeof PurchaseOrderSupplementDialog>>(),
  supplements = ref<InstanceType<typeof RelatedSupplementsDialog>>(),
  receiptRecords = ref<InstanceType<typeof PurchaseOrderLineReceiptRecordsDialog>>();
const navigating = ref(false);
const focusedLineId = ref('');
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
    Boolean(editor.value?.locked || actions.value?.locked || supplement.value?.locked),
);
const releaseDialogs = async (
  current: () => boolean = () => active && route.name === 'procurement-orders',
): Promise<boolean> => {
  if (!current()) return false;
  if (editor.value?.locked || actions.value?.locked || supplement.value?.locked) {
    EMessage.warning('请先确认当前操作结果，再切换采购记录');
    return false;
  }
  if (editor.value?.visible && !(await editor.value.close())) return false;
  if (!current()) return false;
  if (actions.value?.visible && !(await actions.value.close())) return false;
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
  release = true,
): Promise<boolean> => {
  if (navigating.value) return false;
  const revision = routeRevision;
  const operation = ++navigationRevision;
  const current = (): boolean => isCurrent(revision) && operation === navigationRevision;
  beginNavigation();
  try {
    if (!current() || (release && !(await releaseDialogs(current)))) return false;
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
    if (!loaded || !current()) return false;
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
const clearLocation = async (): Promise<boolean> => {
  if (navigating.value) return false;
  const revision = routeRevision;
  const operation = ++navigationRevision;
  const current = (): boolean => isCurrent(revision) && operation === navigationRevision;
  beginNavigation();
  try {
    if (!(await releaseDialogs(current)) || !(await writeLocation({}, current))) return false;
    expansion.clearFocus();
    focusedLineId.value = '';
    rememberLocation({});
    return true;
  } finally {
    finishNavigation();
  }
};
const create = async (
  type: PurchaseOrderSourceType,
  demandIds?: string[],
  workOrderId?: string,
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
const edit = async (id: string): Promise<void> => {
  if (navigating.value) return;
  const revision = routeRevision;
  const operation = ++navigationRevision;
  const current = (): boolean => isCurrent(revision) && operation === navigationRevision;
  beginNavigation();
  try {
    if (!(await releaseDialogs(current))) return;
    const value = await expansion.read(id, true);
    if (!value || !current()) return;
    if (value.status !== 'draft') {
      EMessage.warning('该采购已不是草稿，请刷新列表');
      return;
    }
    await editor.value?.open(value.sourceType, value);
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
const saved = async (id: string): Promise<void> => {
  const revision = routeRevision;
  const operation = navigationRevision;
  await load({ refreshExpanded: false });
  if (!isCurrent(revision) || operation !== navigationRevision) return;
  // 成功回调仍可能处在原命令的 busy 阶段，无需再次关闭已保存的编辑器。
  await focusOrder(id, () => undefined, false);
};
const openSupplement = async (
  orderId: string,
  lineId?: string,
  reason?: PurchaseOrderSupplementReason,
  receiptLineId?: string,
): Promise<boolean> => {
  if (navigating.value) return false;
  const revision = routeRevision;
  const operation = ++navigationRevision;
  const current = (): boolean => isCurrent(revision) && operation === navigationRevision;
  beginNavigation();
  try {
    if (!(await releaseDialogs(current))) return false;
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
    if (!loaded || !current()) return false;
    focusedLineId.value = lineId ?? '';
    rememberLocation(location);
    return true;
  } finally {
    finishNavigation();
  }
};
const actionChanged = async (id: string, latest: PurchaseOrderDetail | null): Promise<void> => {
  if (latest) expansion.replace(latest);
  await load({ refreshExpanded: false });
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
const goReceipts = async (id: string) => {
  if (auth.can(PERMISSIONS.warehouse.receipts.view) && (await releaseDialogs()))
    await router.push({ name: 'procurement-receipts', query: { purchaseOrderId: id } });
};
const goSourceReceipt = async (id: string) => {
  if (canAccessRoute({ name: 'procurement-receipts' }) && (await releaseDialogs()))
    await router.push({ name: 'procurement-receipts', query: { receiptLineId: id } });
};
const retryLocation = (): void => {
  consumed = '';
  void locate();
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
      );
    } else {
      succeeded = await navigate(orderId, query.purchaseOrderLineId);
    }
  } else if (demandId) {
    succeeded = await create('demand', [demandId], query.workOrderId);
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
    initialEntryIsExplicit ||= hasExplicitEntry();
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
.focus-notice {
  margin-bottom: 8px;
}
.focus-notice :deep(.el-alert__description) {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.purchase-order-identity {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
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
