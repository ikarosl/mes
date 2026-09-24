<template>
  <el-dialog
    v-model="visible"
    title="该采购行的相关补单"
    :width="DialogWidth.lg"
  >
    <p class="help">
      共 {{ total }} 张独立补单。补单量独立管理，原单数量和需求来源不会按此分摊或回写。
    </p>
    <el-table
      v-loading="loading"
      :data="rows"
      row-key="id"
      empty-text="该采购行尚无补单"
    >
      <el-table-column
        prop="purchaseNo"
        label="补单号"
        min-width="180"
      />
      <el-table-column
        label="供应商"
        min-width="210"
        show-overflow-tooltip
        ><template #default="{ row }">{{
          supplierSummary(row.suppliers)
        }}</template></el-table-column
      >
      <el-table-column
        label="补单原因"
        width="125"
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
        width="100"
        ><template #default="{ row }">{{
          PURCHASE_ORDER_STATUS_LABELS[row.status as PurchaseOrderStatus]
        }}</template></el-table-column
      >
      <el-table-column
        label="创建时间"
        width="190"
        ><template #default="{ row }">{{
          formatDateTimeForDisplay(row.createdAt)
        }}</template></el-table-column
      >
      <el-table-column
        label="操作"
        width="105"
        ><template #default="{ row }"
          ><el-button
            link
            type="primary"
            @click="navigate(row.id)"
            >查看补单</el-button
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
    <template #footer
      ><el-button @click="load">刷新</el-button
      ><el-button @click="visible = false">关闭</el-button></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
import { supplierSummary } from '../supplier-summary';
import { onActivated, ref, watch } from 'vue';
import type {
  PurchaseOrderItem,
  PurchaseOrderStatus,
  PurchaseOrderSupplementReason,
} from '@company/contracts';
import {
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_ORDER_SUPPLEMENT_REASON_LABELS,
} from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { formatDateTimeForDisplay } from '../../../utils/date';
import PaginationFooter from '../../../components/PaginationFooter.vue';
const emit = defineEmits<{ navigate: [string] }>();
const visible = ref(false),
  lineId = ref(''),
  rows = ref<PurchaseOrderItem[]>([]),
  loading = ref(false),
  page = ref(1),
  pageSize = ref(10),
  total = ref(0);
const read = useLatestReadRequest(() => {
  loading.value = false;
});
const load = async (): Promise<void> => {
  if (!visible.value || !read.isActive()) return;
  const id = lineId.value,
    current = read.begin(() => visible.value && lineId.value === id);
  loading.value = true;
  try {
    const result = await procurementApi.listOrders(
      { originOrderLineId: id, page: page.value, pageSize: pageSize.value },
      current.signal,
    );
    if (current.isCurrent()) {
      rows.value = result.items;
      total.value = result.total;
    }
  } catch (error) {
    if (current.isCurrent()) EMessage.error(error, '相关补单加载失败');
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
};
const open = async (id: string): Promise<void> => {
  lineId.value = id;
  rows.value = [];
  total.value = 0;
  page.value = 1;
  visible.value = true;
  await load();
};
const changePage = async (value: number): Promise<void> => {
  page.value = value;
  await load();
};
const changePageSize = async (value: number): Promise<void> => {
  pageSize.value = value;
  page.value = 1;
  await load();
};
const navigate = (id: string): void => {
  visible.value = false;
  emit('navigate', id);
};
watch(visible, (value) => {
  if (!value) read.invalidate();
});
onActivated(() => {
  if (visible.value) void load();
});
defineExpose({ open });
</script>
<style scoped>
.help {
  color: #6b7280;
  font-size: 13px;
}
</style>
