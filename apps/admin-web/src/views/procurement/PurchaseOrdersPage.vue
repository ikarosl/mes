<template>
  <section>
    <div class="query-panel">
      <el-form
        inline
        :model="query"
        class="query-form"
        @submit.prevent="search"
      >
        <el-form-item label="采购单 / 供应商"
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
    <div class="table-panel">
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
      <el-alert
        v-if="expansion.focused.value && !rows.some((row) => row.id === expansion.focusedId.value)"
        title="当前定位的采购单不在本页，已置顶显示；下方分页仍对应查询结果。"
        type="info"
        closable
        @close="expansion.clearFocus"
      />
      <el-table
        v-loading="loading"
        :data="displayRows"
        :expand-row-keys="expansion.expanded.value"
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
              :focused-line-id="focusedOrderId === row.id ? focusedLineId : undefined"
              :loading="expansion.entries[row.id]?.loading ?? false"
              :failed="expansion.entries[row.id]?.failed ?? false"
              :disabled="blocked"
              :line-count="row.lineCount"
              @refresh="expansion.read(row.id, true)"
              @close-line="handleAction(row.id, 'close', $event)"
              @supplements="showSupplements"
              @supplement="openSupplement(row.id, $event)"
              @supplement-origin="openSupplement($event, undefined, 'excess_purchase')"
              @receipts="goReceipts(row.id)"
              @source-receipt="goSourceReceipt"
              @navigate="navigate"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="采购单号"
          min-width="240"
        >
          <template #default="{ row }">
            <el-button
              :id="`purchase-order-${row.id}`"
              link
              type="primary"
              @click="expansion.setExpanded(row.id, !expansion.expanded.value.includes(row.id))"
              >{{ row.purchaseNo }}</el-button
            >
          </template>
        </el-table-column>
        <el-table-column
          prop="workOrderNo"
          label="所属工单"
          min-width="175"
        />
        <el-table-column
          label="采购来源"
          width="160"
          ><template #default="{ row }">{{
            PURCHASE_ORDER_SOURCE_TYPE_LABELS[row.sourceType as PurchaseOrderSourceType]
          }}</template></el-table-column
        >
        <el-table-column
          label="补单原因"
          width="120"
          ><template #default="{ row }">{{
            row.supplementReason
              ? PURCHASE_ORDER_SUPPLEMENT_REASON_LABELS[
                  row.supplementReason as PurchaseOrderSupplementReason
                ]
              : '—'
          }}</template></el-table-column
        >
        <el-table-column
          label="状态"
          width="110"
          ><template #default="{ row }"
            ><el-tag>{{
              PURCHASE_ORDER_STATUS_LABELS[row.status as PurchaseOrderStatus]
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column
          prop="lineCount"
          label="物料行"
          width="85"
        />
        <el-table-column
          label="创建时间"
          width="180"
          ><template #default="{ row }">{{
            formatDateTimeForDisplay(row.createdAt)
          }}</template></el-table-column
        >
        <el-table-column
          label="主单操作"
          fixed="right"
          width="275"
        >
          <template #default="{ row }">
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
              v-if="row.status !== 'draft' && auth.can(PERMISSIONS.procurement.receipts.view)"
              link
              type="primary"
              :disabled="blocked"
              @click="goReceipts(row.id)"
              >到货记录</el-button
            >
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
      @navigate="navigate"
    />
    <PurchaseOrderSupplementDialog
      ref="supplement"
      @saved="saved"
      @navigate="navigate"
      @source-order="openSupplement($event.orderId, undefined, $event.reason ?? 'excess_purchase')"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, ref, watch } from 'vue';
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
import PurchaseOrderEditorDialog from './components/PurchaseOrderEditorDialog.vue';
import PurchaseOrderActionDialog from './components/PurchaseOrderActionDialog.vue';
import PurchaseOrderExpandedRows from './components/PurchaseOrderExpandedRows.vue';
import RelatedSupplementsDialog from './components/RelatedSupplementsDialog.vue';
import PurchaseOrderSupplementDialog from './components/PurchaseOrderSupplementDialog.vue';
import { usePurchaseOrderExpansion } from './composables/usePurchaseOrderExpansion';
import { useAuthStore } from '../../stores/auth';

defineOptions({ name: 'PurchaseOrdersPage' });
const route = useRoute(),
  router = useRouter();
const auth = useAuthStore();
const expansion = usePurchaseOrderExpansion();
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
} = usePurchaseOrdersList(expansion.sync);
const displayRows = computed(() =>
  expansion.focused.value && !rows.value.some((row) => row.id === expansion.focusedId.value)
    ? [expansion.focused.value, ...rows.value]
    : rows.value,
);
const editor = ref<InstanceType<typeof PurchaseOrderEditorDialog>>(),
  actions = ref<InstanceType<typeof PurchaseOrderActionDialog>>(),
  supplement = ref<InstanceType<typeof PurchaseOrderSupplementDialog>>(),
  supplements = ref<InstanceType<typeof RelatedSupplementsDialog>>();
const navigating = ref(false);
const focusedOrderId = ref('');
const focusedLineId = ref('');
let pendingLocate = false;
const finishNavigation = (): void => {
  navigating.value = false;
  if (pendingLocate) {
    pendingLocate = false;
    void locate();
  }
};
const blocked = computed(
  () =>
    navigating.value ||
    Boolean(editor.value?.locked || actions.value?.locked || supplement.value?.locked),
);
const releaseDialogs = async (): Promise<boolean> => {
  if (editor.value?.locked || actions.value?.locked || supplement.value?.locked) {
    EMessage.warning('请先确认当前操作结果，再切换采购记录');
    return false;
  }
  if (editor.value?.visible && !(await editor.value.close())) return false;
  if (actions.value?.visible && !(await actions.value.close())) return false;
  if (supplement.value?.visible && !(await supplement.value.close())) return false;
  if (supplements.value?.visible) supplements.value.close();
  return true;
};
const navigate = async (id: string, lineId?: string): Promise<boolean> => {
  if (navigating.value) return false;
  navigating.value = true;
  try {
    if (!(await releaseDialogs())) return false;
    const loaded = await expansion.focus(id);
    if (loaded) {
      if (lineId && !expansion.entries[id]?.detail?.items.some((item) => item.id === lineId)) {
        EMessage.warning('指定采购行已不在该采购单中，请重新核对来源');
        return false;
      }
      focusedOrderId.value = lineId ? id : '';
      focusedLineId.value = lineId ?? '';
      await nextTick();
      document
        .getElementById(lineId ? `purchase-order-line-${lineId}` : `purchase-order-${id}`)
        ?.scrollIntoView({ block: 'nearest' });
    }
    return loaded;
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
  navigating.value = true;
  try {
    if (!(await releaseDialogs())) return false;
    await editor.value?.open(type, undefined, demandIds, workOrderId);
    return true;
  } finally {
    finishNavigation();
  }
};
const edit = async (id: string): Promise<void> => {
  if (navigating.value) return;
  navigating.value = true;
  try {
    if (!(await releaseDialogs())) return;
    const value = await expansion.read(id, true);
    if (!value) return;
    if (value.status !== 'draft') {
      EMessage.warning('该采购已不是草稿，请刷新列表');
      return;
    }
    await editor.value?.open(value.sourceType, value);
  } finally {
    finishNavigation();
  }
};
const handleAction = async (id: string, action: 'place' | 'cancel' | 'close', lineId?: string) => {
  if (navigating.value) return;
  navigating.value = true;
  try {
    if (!(await releaseDialogs())) return;
    await actions.value?.open(id, action, lineId);
  } finally {
    finishNavigation();
  }
};
const saved = async (id: string): Promise<void> => {
  await load({ refreshExpanded: false });
  await expansion.focus(id);
};
const openSupplement = async (
  orderId: string,
  lineId?: string,
  reason?: PurchaseOrderSupplementReason,
  receiptLineId?: string,
  allocationId?: string,
): Promise<boolean> => {
  if (navigating.value) return false;
  navigating.value = true;
  try {
    if (!(await releaseDialogs())) return false;
    if (!(await expansion.focus(orderId))) return false;
    return (
      (await supplement.value?.open(orderId, { lineId, reason, receiptLineId, allocationId })) ??
      false
    );
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
  if (await releaseDialogs()) await supplements.value?.open(id);
};
const goReceipts = async (id: string) => {
  if (auth.can(PERMISSIONS.procurement.receipts.view) && (await releaseDialogs()))
    await router.push({ name: 'procurement-receipts', query: { purchaseOrderId: id } });
};
const goSourceReceipt = async (id: string) => {
  if (await releaseDialogs())
    await router.push({ name: 'procurement-receipts', query: { receiptLineId: id } });
};
let consumed = '';
let routeRevision = 0;
let accepted: {
  purchaseOrderId?: string;
  purchaseOrderLineId?: string;
  demandId?: string;
  workOrderId?: string;
  supplementLineId?: string;
  supplementReason?: string;
  receiptLineId?: string;
  allocationId?: string;
} = {};
const locate = async (): Promise<void> => {
  const revision = routeRevision;
  if (route.name !== 'procurement-orders') return;
  await nextTick();
  if (revision !== routeRevision || route.name !== 'procurement-orders') return;
  const orderId =
    typeof route.query.purchaseOrderId === 'string' ? route.query.purchaseOrderId : '';
  const orderLineId =
    typeof route.query.purchaseOrderLineId === 'string' ? route.query.purchaseOrderLineId : '';
  const demandId = typeof route.query.demandId === 'string' ? route.query.demandId : '';
  const workOrderId = typeof route.query.workOrderId === 'string' ? route.query.workOrderId : '';
  const supplementLineId =
    typeof route.query.supplementLineId === 'string' ? route.query.supplementLineId : '';
  const receiptLineId =
    typeof route.query.receiptLineId === 'string' ? route.query.receiptLineId : '';
  const supplementReason =
    route.query.supplementReason === 'excess_purchase' ||
    route.query.supplementReason === 'quality_replacement'
      ? route.query.supplementReason
      : '';
  const allocationId = typeof route.query.allocationId === 'string' ? route.query.allocationId : '';
  const token = JSON.stringify([
    orderId,
    orderLineId,
    demandId,
    workOrderId,
    supplementLineId,
    supplementReason,
    receiptLineId,
    allocationId,
  ]);
  if (!orderId && !demandId) return;
  if (token === consumed) {
    if (supplementLineId && supplement.value?.visible) return;
    if (demandId && editor.value?.visible) return;
    if (
      orderId &&
      !editor.value?.visible &&
      !actions.value?.visible &&
      !supplement.value?.visible &&
      !supplements.value?.visible &&
      expansion.expanded.value.includes(orderId) &&
      (!orderLineId || focusedLineId.value === orderLineId)
    ) {
      document
        .getElementById(
          orderLineId ? `purchase-order-line-${orderLineId}` : `purchase-order-${orderId}`,
        )
        ?.scrollIntoView({ block: 'nearest' });
      return;
    }
  }
  if (navigating.value) {
    pendingLocate = true;
    return;
  }
  consumed = token;
  const succeeded = orderId
    ? supplementLineId
      ? await openSupplement(
          orderId,
          supplementLineId,
          supplementReason || undefined,
          receiptLineId || undefined,
          allocationId || undefined,
        )
      : await navigate(orderId, orderLineId || undefined)
    : await create('demand', [demandId], workOrderId || undefined);
  if (
    revision !== routeRevision ||
    route.name !== 'procurement-orders' ||
    JSON.stringify([
      typeof route.query.purchaseOrderId === 'string' ? route.query.purchaseOrderId : '',
      typeof route.query.purchaseOrderLineId === 'string' ? route.query.purchaseOrderLineId : '',
      typeof route.query.demandId === 'string' ? route.query.demandId : '',
      typeof route.query.workOrderId === 'string' ? route.query.workOrderId : '',
      typeof route.query.supplementLineId === 'string' ? route.query.supplementLineId : '',
      typeof route.query.supplementReason === 'string' ? route.query.supplementReason : '',
      typeof route.query.receiptLineId === 'string' ? route.query.receiptLineId : '',
      typeof route.query.allocationId === 'string' ? route.query.allocationId : '',
    ]) !== token
  )
    return;
  if (succeeded)
    accepted = orderId
      ? {
          purchaseOrderId: orderId,
          ...(orderLineId ? { purchaseOrderLineId: orderLineId } : {}),
          ...(supplementLineId
            ? { supplementLineId, supplementReason, receiptLineId, allocationId }
            : {}),
        }
      : { demandId, workOrderId };
  else {
    const nextQuery = { ...route.query };
    delete nextQuery.purchaseOrderId;
    delete nextQuery.purchaseOrderLineId;
    delete nextQuery.demandId;
    delete nextQuery.workOrderId;
    delete nextQuery.supplementLineId;
    delete nextQuery.supplementReason;
    delete nextQuery.receiptLineId;
    delete nextQuery.allocationId;
    await router.replace({ query: { ...nextQuery, ...accepted } });
    consumed = JSON.stringify([
      accepted.purchaseOrderId ?? '',
      accepted.purchaseOrderLineId ?? '',
      accepted.demandId ?? '',
      accepted.workOrderId ?? '',
      accepted.supplementLineId ?? '',
      accepted.supplementReason ?? '',
      accepted.receiptLineId ?? '',
      accepted.allocationId ?? '',
    ]);
  }
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
    route.query.allocationId,
  ],
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
