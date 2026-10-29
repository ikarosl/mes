<template>
  <el-dialog
    :model-value="visible"
    :title="`相关采购${demandId ? ` · 需求 id:${demandId}` : ''}`"
    :width="DialogWidth.lg"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div class="purchase-toolbar">
      <span class="help">查看与此需求关联的采购记录。</span>
      <el-button
        v-if="canViewPurchase && workOrderId && demandId"
        type="primary"
        @click="purchaseFromDemand"
        >发起采购</el-button
      >
    </div>
    <el-alert
      v-if="loadError"
      :title="loadError"
      type="error"
      :closable="false"
      show-icon
    />
    <template v-else>
      <el-table
        v-loading="loading"
        :data="rows"
        row-key="purchaseOrderLineId"
        empty-text="暂无相关采购"
      >
        <el-table-column
          label="采购单 / 采购行"
          min-width="175"
        >
          <template #default="{ row }">
            <div>
              <strong class="identity-value">{{ row.purchaseNo }}</strong>
            </div>
            <div class="help">
              采购行 ID：<strong class="identity-value">{{ row.purchaseOrderLineId }}</strong>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          prop="supplierName"
          label="供应商"
          min-width="160"
        />
        <el-table-column
          label="采购状态"
          width="110"
        >
          <template #default="{ row }">
            <el-tag
              v-bind="purchaseOrderStatusTag(row.purchaseOrderStatus as PurchaseOrderStatus)"
              >{{
                PURCHASE_ORDER_STATUS_LABELS[row.purchaseOrderStatus as PurchaseOrderStatus]
              }}</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column
          label="行状态"
          width="100"
        >
          <template #default="{ row }">
            <el-tag
              v-bind="purchaseOrderLineStatusTag(row.lineStatus as PurchaseOrderLineStatus)"
              >{{
                PURCHASE_ORDER_LINE_STATUS_LABELS[row.lineStatus as PurchaseOrderLineStatus]
              }}</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="105"
        >
          <template #default="{ row }">
            <el-button
              v-if="canViewPurchase"
              link
              type="primary"
              @click="go(row)"
              >采购详情</el-button
            >
            <span v-else>查看受限</span>
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
    </template>
    <template #footer>
      <el-button
        :loading="loading"
        @click="load"
        >刷新</el-button
      >
      <el-button @click="$emit('update:visible', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type {
  PurchaseOrderLineStatus,
  PurchaseOrderStatus,
  RelatedPurchaseLine,
} from '@company/contracts';
import {
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_ORDER_LINE_STATUS_LABELS,
} from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { purchaseOrderLineStatusTag, purchaseOrderStatusTag } from '../purchase-order-presentation';
const props = defineProps<{
  visible: boolean;
  demandId: string | null;
  workOrderId?: string | null;
}>();
const emit = defineEmits<{ 'update:visible': [boolean] }>();
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
const canViewPurchase = computed(() => canAccessRoute({ name: 'procurement-orders' }));
const rows = ref<RelatedPurchaseLine[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const loading = ref(false);
const loadError = ref('');
const read = useLatestReadRequest(() => {
  loading.value = false;
});
const load = async (): Promise<void> => {
  const id = props.demandId;
  if (!props.visible || !id || !read.isActive()) return;
  const current = read.begin(() => props.visible && props.demandId === id);
  loading.value = true;
  loadError.value = '';
  try {
    const result = await procurementApi.relatedPurchases(
      { demandIds: [id], page: page.value, pageSize: pageSize.value },
      current.signal,
    );
    if (current.isCurrent()) {
      rows.value = result.items;
      total.value = result.total;
    }
  } catch (error) {
    if (!current.isCurrent()) return;
    rows.value = [];
    total.value = 0;
    loadError.value = error instanceof Error ? error.message : '相关采购加载失败，请刷新重试';
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
};
const changePage = async (value: number): Promise<void> => {
  if (value === page.value) return;
  page.value = value;
  await load();
};
const changePageSize = async (value: number): Promise<void> => {
  pageSize.value = value;
  page.value = 1;
  await load();
};
const go = async (row: RelatedPurchaseLine): Promise<void> => {
  emit('update:visible', false);
  await router.push({
    name: 'procurement-orders',
    query: { purchaseOrderId: row.purchaseOrderId, purchaseOrderLineId: row.purchaseOrderLineId },
  });
};
const purchaseFromDemand = async (): Promise<void> => {
  if (!props.demandId || !props.workOrderId || !canViewPurchase.value) return;
  emit('update:visible', false);
  await router.push({
    name: 'procurement-orders',
    query: { demandId: props.demandId, workOrderId: props.workOrderId },
  });
};
watch(
  () => [props.visible, props.demandId] as const,
  () => {
    read.invalidate();
    if (!props.visible) return;
    rows.value = [];
    total.value = 0;
    loadError.value = '';
    page.value = 1;
    void load();
  },
  { immediate: true },
);
</script>
<style scoped>
.identity-value {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.purchase-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.help {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.7;
}
</style>
