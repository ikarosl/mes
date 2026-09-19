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
            @click="load"
        /></template>
      </TableToolbar>
      <el-table
        v-loading="loading"
        :data="rows"
        row-key="id"
        class="data-table"
        empty-text="暂无采购单"
      >
        <el-table-column
          prop="purchaseNo"
          label="采购单号"
          min-width="185"
        />
        <el-table-column
          prop="supplierName"
          label="供应商"
          min-width="210"
          show-overflow-tooltip
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
          label="操作"
          fixed="right"
          width="105"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click="navigate(row.id)"
              >查看详情</el-button
            ></template
          ></el-table-column
        >
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
    <PurchaseOrderDetailDialog
      ref="detail"
      @changed="load"
      @edit="edit"
      @navigate="navigate"
    />
  </section>
</template>

<script setup lang="ts">
import { nextTick, onActivated, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus, Refresh } from '@element-plus/icons-vue';
import type {
  PurchaseOrderDetail,
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
import { formatDateTimeForDisplay } from '../../utils/date';
import { EMessage } from '../../utils/message';
import { usePurchaseOrdersList } from './composables/usePurchaseOrdersList';
import PurchaseOrderEditorDialog from './components/PurchaseOrderEditorDialog.vue';
import PurchaseOrderDetailDialog from './components/PurchaseOrderDetailDialog.vue';

defineOptions({ name: 'PurchaseOrdersPage' });
const route = useRoute(),
  router = useRouter();
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
} = usePurchaseOrdersList();
const editor = ref<InstanceType<typeof PurchaseOrderEditorDialog>>(),
  detail = ref<InstanceType<typeof PurchaseOrderDetailDialog>>();
let navigating = false;
const releaseDialogs = async (): Promise<boolean> => {
  if (editor.value?.locked || detail.value?.locked) {
    EMessage.warning('请先确认当前操作结果，再切换采购记录');
    return false;
  }
  if (editor.value?.visible && !(await editor.value.close())) return false;
  if (detail.value?.visible && !(await detail.value.close())) return false;
  return true;
};
const navigate = async (id: string): Promise<boolean> => {
  if (navigating) return false;
  navigating = true;
  try {
    if (!(await releaseDialogs())) return false;
    await detail.value?.open(id);
    return true;
  } finally {
    navigating = false;
  }
};
const create = async (type: PurchaseOrderSourceType, demandIds?: string[]): Promise<boolean> => {
  if (navigating) return false;
  navigating = true;
  try {
    if (!(await releaseDialogs())) return false;
    await editor.value?.open(type, undefined, demandIds);
    return true;
  } finally {
    navigating = false;
  }
};
const edit = async (value: PurchaseOrderDetail): Promise<void> => {
  await editor.value?.open(value.sourceType, value);
};
const saved = async (id: string): Promise<void> => {
  await load();
  await detail.value?.open(id);
};
let consumed = '';
let accepted: { purchaseOrderId?: string; demandId?: string } = {};
const locate = async (): Promise<void> => {
  if (route.name !== 'procurement-orders') return;
  await nextTick();
  const orderId =
    typeof route.query.purchaseOrderId === 'string' ? route.query.purchaseOrderId : '';
  const demandId = typeof route.query.demandId === 'string' ? route.query.demandId : '';
  const token = JSON.stringify([orderId, demandId]);
  if (token === consumed || (!orderId && !demandId)) return;
  consumed = token;
  const succeeded = orderId ? await navigate(orderId) : await create('demand', [demandId]);
  if (succeeded) accepted = orderId ? { purchaseOrderId: orderId } : { demandId };
  else {
    const nextQuery = { ...route.query };
    delete nextQuery.purchaseOrderId;
    delete nextQuery.demandId;
    await router.replace({ query: { ...nextQuery, ...accepted } });
    consumed = JSON.stringify([accepted.purchaseOrderId ?? '', accepted.demandId ?? '']);
  }
};
watch(
  () => [route.name, route.query.purchaseOrderId, route.query.demandId],
  () => {
    void locate();
  },
  { immediate: true },
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
</style>
