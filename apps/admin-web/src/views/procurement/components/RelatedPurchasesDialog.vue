<template>
  <el-dialog
    :model-value="visible"
    title="需求相关采购"
    :width="DialogWidth.lg"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
  >
    <p class="help">
      共关联 {{ orderCount }} 张采购单。采购行数量是独立计划量，不是分摊到此需求的已采购量。
    </p>
    <el-table
      v-loading="loading"
      :data="rows"
      row-key="purchaseOrderLineId"
      empty-text="暂无相关采购"
    >
      <el-table-column
        prop="purchaseNo"
        label="采购单"
        min-width="175"
      />
      <el-table-column
        prop="supplierName"
        label="供应商"
        min-width="160"
      />
      <el-table-column
        label="采购状态"
        width="110"
        ><template #default="{ row }">{{
          PURCHASE_ORDER_STATUS_LABELS[row.purchaseOrderStatus as PurchaseOrderStatus]
        }}</template></el-table-column
      >
      <el-table-column
        label="行状态"
        width="100"
        ><template #default="{ row }">{{
          PURCHASE_ORDER_LINE_STATUS_LABELS[row.lineStatus as PurchaseOrderLineStatus]
        }}</template></el-table-column
      >
      <el-table-column
        label="该行计划量"
        width="110"
        ><template #default="{ row }">{{ Number(row.plannedQuantity) }}</template></el-table-column
      >
      <el-table-column
        label="操作"
        width="105"
        ><template #default="{ row }"
          ><el-button
            v-if="auth.can(PERMISSIONS.procurement.orders.view)"
            link
            type="primary"
            @click="go(row.purchaseOrderId)"
            >采购详情</el-button
          ><span v-else>查看受限</span></template
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
      ><el-button @click="$emit('update:visible', false)">关闭</el-button></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
import { onActivated, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type {
  PurchaseOrderLineStatus,
  PurchaseOrderStatus,
  RelatedPurchaseLine,
} from '@company/contracts';
import {
  PERMISSIONS,
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_ORDER_LINE_STATUS_LABELS,
} from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useAuthStore } from '../../../stores/auth';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import PaginationFooter from '../../../components/PaginationFooter.vue';
const props = defineProps<{ visible: boolean; demandId: string | null }>();
const emit = defineEmits<{ 'update:visible': [boolean] }>();
const auth = useAuthStore(),
  router = useRouter();
const rows = ref<RelatedPurchaseLine[]>([]),
  total = ref(0),
  orderCount = ref(0),
  page = ref(1),
  pageSize = ref(10),
  loading = ref(false);
const read = useLatestReadRequest(() => {
  loading.value = false;
});
const load = async (): Promise<void> => {
  const id = props.demandId;
  if (!props.visible || !id || !read.isActive()) return;
  const current = read.begin(() => props.visible && props.demandId === id);
  loading.value = true;
  try {
    const result = await procurementApi.relatedPurchases(
      { demandIds: [id], page: page.value, pageSize: pageSize.value },
      current.signal,
    );
    if (current.isCurrent()) {
      rows.value = result.items;
      total.value = result.total;
      orderCount.value =
        result.summaries.find((entry) => entry.demandId === id)?.purchaseOrderCount ?? 0;
    }
  } catch (error) {
    if (current.isCurrent()) EMessage.error(error, '相关采购加载失败');
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
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
const go = async (id: string): Promise<void> => {
  emit('update:visible', false);
  await router.push({ name: 'procurement-orders', query: { purchaseOrderId: id } });
};
watch(
  () => [props.visible, props.demandId],
  () => {
    if (!props.visible) {
      read.invalidate();
      return;
    }
    rows.value = [];
    total.value = 0;
    orderCount.value = 0;
    page.value = 1;
    void load();
  },
);
onActivated(() => {
  if (props.visible) void load();
});
</script>
<style scoped>
.help {
  color: #6b7280;
  line-height: 1.7;
}
</style>
