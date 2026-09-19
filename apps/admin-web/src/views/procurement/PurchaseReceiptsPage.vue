<template>
  <section>
    <div class="query-panel">
      <el-form
        inline
        @submit.prevent="search"
        ><el-form-item label="到货 / 采购 / 供应商"
          ><el-input
            v-model="keyword"
            clearable
            maxlength="100"
            placeholder="输入单号或供应商" /></el-form-item
        ><el-form-item
          ><el-button
            type="primary"
            native-type="submit"
            :loading="loading"
            >查询</el-button
          ><el-button @click="reset">重置</el-button></el-form-item
        ></el-form
      >
    </div>
    <div class="table-panel">
      <TableToolbar
        ><template #actions
          ><el-button
            type="primary"
            :icon="Plus"
            @click="create()"
            >登记实际到货</el-button
          ></template
        ><template #tools
          ><el-button
            :icon="Refresh"
            text
            circle
            :loading="loading"
            aria-label="刷新采购到货"
            @click="load" /></template
      ></TableToolbar>
      <el-table
        v-loading="loading"
        :data="rows"
        row-key="id"
        empty-text="暂无采购到货记录"
        ><el-table-column
          prop="receiptNo"
          label="到货单号"
          min-width="185"
        /><el-table-column
          prop="purchaseNo"
          label="采购单号"
          min-width="185"
        /><el-table-column
          prop="supplierName"
          label="供应商"
          min-width="210"
        /><el-table-column
          prop="lineCount"
          label="明细数"
          width="85"
        /><el-table-column
          label="实际到货时间"
          width="190"
          ><template #default="{ row }">{{
            formatDateTimeForDisplay(row.receivedAt)
          }}</template></el-table-column
        ><el-table-column
          prop="handoverEvidence"
          label="交接凭据"
          min-width="210"
          show-overflow-tooltip
        /><el-table-column
          label="操作"
          width="110"
          fixed="right"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click="navigate(row.id)"
              >查看 / 办理</el-button
            ></template
          ></el-table-column
        ></el-table
      >
      <PaginationFooter
        :total="total"
        :current-page="page"
        :page-size="pageSize"
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
import { nextTick, onActivated, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { procurementApi } from '../../api/procurement';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { formatDateTimeForDisplay } from '../../utils/date';
import { EMessage } from '../../utils/message';
import { useLatestReadRequest } from '../../composables/requests/useLatestReadRequest';
import { useReceiptsList } from './composables/useReceiptsList';
import ReceiptCreateDialog from './components/ReceiptCreateDialog.vue';
import ReceiptDetailDialog from './components/ReceiptDetailDialog.vue';
defineOptions({ name: 'PurchaseReceiptsPage' });
const route = useRoute(),
  router = useRouter();
const {
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
const editor = ref<InstanceType<typeof ReceiptCreateDialog>>(),
  detail = ref<InstanceType<typeof ReceiptDetailDialog>>();
const locator = useLatestReadRequest(() => {});
let navigating = false;
const release = async (): Promise<boolean> => {
  if (editor.value?.locked || detail.value?.locked) {
    EMessage.warning('请先确认当前操作结果再切换到货记录');
    return false;
  }
  if (editor.value?.visible && !(await editor.value.close())) return false;
  if (detail.value?.visible && !(await detail.value.close())) return false;
  return true;
};
const navigate = async (id: string, lineId?: string): Promise<boolean> => {
  if (navigating) return false;
  navigating = true;
  try {
    if (!(await release())) return false;
    await detail.value?.open(id, lineId);
    return true;
  } finally {
    navigating = false;
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
    navigating = false;
  }
};
const saved = async (id: string): Promise<void> => {
  await load();
  await detail.value?.open(id);
};
let consumed = '',
  accepted: Record<string, string> = {};
const locate = async (): Promise<void> => {
  if (route.name !== 'procurement-receipts') return;
  await nextTick();
  const receiptId = typeof route.query.receiptId === 'string' ? route.query.receiptId : '';
  const lineId = typeof route.query.receiptLineId === 'string' ? route.query.receiptLineId : '';
  const orderId =
    typeof route.query.purchaseOrderId === 'string' ? route.query.purchaseOrderId : '';
  const token = JSON.stringify([receiptId, lineId, orderId]);
  if (token === consumed || (!receiptId && !lineId && !orderId)) return;
  consumed = token;
  const current = locator.begin(
    () =>
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
.table-panel {
  overflow: hidden;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
</style>
