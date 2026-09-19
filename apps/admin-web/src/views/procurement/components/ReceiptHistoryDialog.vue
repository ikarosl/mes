<template>
  <el-dialog
    v-model="visible"
    title="到货明细历史"
    :width="DialogWidth.workbench"
    workbench
    :before-close="beforeClose"
  >
    <el-tabs
      v-model="tab"
      @tab-change="changeTab"
      ><el-tab-pane
        label="实收修订"
        name="revisions" /><el-tab-pane
        label="检验与复核"
        name="cases" /><el-tab-pane
        label="供应商退回"
        name="returns" /><el-tab-pane
        label="实际入库"
        name="inbounds" /><el-tab-pane
        label="范围变更"
        name="scopes"
    /></el-tabs>
    <el-table
      v-loading="loading"
      :data="rows"
      empty-text="暂无记录"
    >
      <template v-if="tab === 'revisions'">
        <el-table-column
          prop="revisionNo"
          label="修订"
          width="85"
        /><el-table-column
          label="实收量"
          width="110"
          ><template #default="{ row }">{{
            Number(row.receivedQuantity)
          }}</template></el-table-column
        ><el-table-column
          prop="reason"
          label="更正依据"
          min-width="280"
        /><el-table-column
          label="记录时间"
          width="190"
          ><template #default="{ row }">{{
            formatDateTimeForDisplay(row.createdAt)
          }}</template></el-table-column
        >
      </template>
      <template v-else-if="tab === 'cases'">
        <el-table-column type="expand"
          ><template #default="{ row }"
            ><InboundInspectionRecord
              v-if="row.inspection"
              :inspection="row.inspection" /><el-empty
              v-else
              description="尚无检验结论" /></template></el-table-column
        ><el-table-column
          label="发起类型"
          width="145"
          ><template #default="{ row }">{{
            QUALITY_INBOUND_CASE_TYPE_LABELS[row.caseType as QualityInboundCaseType]
          }}</template></el-table-column
        ><el-table-column
          label="状态"
          width="160"
          ><template #default="{ row }">{{
            QUALITY_INBOUND_CASE_STATUS_LABELS[row.status as QualityInboundCaseStatus]
          }}</template></el-table-column
        ><el-table-column
          label="覆盖量"
          width="110"
          ><template #default="{ row }">{{
            Number(row.coveredQuantity)
          }}</template></el-table-column
        ><el-table-column
          prop="reason"
          label="发起原因"
          min-width="250"
        /><el-table-column
          label="发起时间"
          width="185"
          ><template #default="{ row }">{{
            formatDateTimeForDisplay(row.createdAt)
          }}</template></el-table-column
        >
      </template>
      <template v-else-if="tab === 'returns'">
        <el-table-column
          v-if="sourceLine && auth.can(PERMISSIONS.procurement.orders.view)"
          label="补发采购"
          width="125"
          ><template #default="{ row }"
            ><el-button
              v-if="row.reasonType === 'quality'"
              link
              type="primary"
              :disabled="replacement?.visible"
              @click="replacement?.open(sourceLine!, row)"
              >不合格补货</el-button
            ></template
          ></el-table-column
        >
        <el-table-column
          prop="returnNo"
          label="退回记录"
          min-width="170"
        /><el-table-column
          label="原因"
          width="140"
          ><template #default="{ row }">{{
            SUPPLIER_RETURN_REASON_LABELS[row.reasonType as SupplierReturnItem['reasonType']]
          }}</template></el-table-column
        ><el-table-column
          label="已退量"
          width="110"
          ><template #default="{ row }">{{
            Number(row.returnedQuantity)
          }}</template></el-table-column
        ><el-table-column
          prop="handoverEvidence"
          label="交接凭据"
          min-width="240"
        /><el-table-column
          label="交接时间"
          width="185"
          ><template #default="{ row }">{{
            formatDateTimeForDisplay(row.returnedAt)
          }}</template></el-table-column
        >
      </template>
      <template v-else-if="tab === 'inbounds'">
        <el-table-column
          label="入库单"
          min-width="180"
          ><template #default="{ row }"
            ><el-button
              v-if="auth.can(PERMISSIONS.production.inbounds.view)"
              link
              type="primary"
              @click="goInbound(row.inboundId)"
              >{{ row.inboundNo }}</el-button
            ><span v-else>{{ row.inboundNo }}</span></template
          ></el-table-column
        ><el-table-column
          label="入库量"
          width="110"
          ><template #default="{ row }">{{ Number(row.quantity) }}</template></el-table-column
        ><el-table-column
          prop="transactionId"
          label="库存事实记录"
          min-width="170"
        /><el-table-column
          prop="scopeId"
          label="来源范围"
          min-width="160"
        /><el-table-column
          label="确认时间"
          width="185"
          ><template #default="{ row }">{{
            formatDateTimeForDisplay(row.confirmedAt)
          }}</template></el-table-column
        >
      </template>
      <template v-else>
        <el-table-column
          prop="id"
          label="范围"
          min-width="160"
        /><el-table-column
          prop="parentScopeId"
          label="原范围"
          min-width="160"
        /><el-table-column
          label="数量"
          width="110"
          ><template #default="{ row }">{{ Number(row.quantity) }}</template></el-table-column
        ><el-table-column
          label="处置状态"
          width="170"
          ><template #default="{ row }">{{
            RECEIPT_SCOPE_DISPOSITION_LABELS[row.disposition as ReceiptScopeDisposition]
          }}</template></el-table-column
        ><el-table-column
          prop="terminationReason"
          label="采购终止原因"
          min-width="230"
        /><el-table-column
          label="形成时间"
          width="185"
          ><template #default="{ row }">{{
            formatDateTimeForDisplay(row.createdAt)
          }}</template></el-table-column
        >
      </template>
    </el-table>
    <PaginationFooter
      :total="total"
      :current-page="page"
      :page-size="pageSize"
      @page-change="changePage"
      @update:page-size="changePageSize"
    />
    <template #footer
      ><el-button @click="load">刷新</el-button><el-button @click="close">关闭</el-button></template
    >
  </el-dialog>
  <QualityReplacementDialog
    ref="replacement"
    @saved="replacementSaved"
  />
</template>
<script setup lang="ts">
import { computed, onActivated, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type {
  ReceiptRevisionItem,
  ReceiptScopeItem,
  ReceiptScopeDisposition,
  SupplierReturnItem,
  ReceiptInboundHistoryItem,
  QualityInboundCaseItem,
  QualityInboundCaseType,
  QualityInboundCaseStatus,
  ProcurementReceiptLine,
} from '@company/contracts';
import {
  PERMISSIONS,
  QUALITY_INBOUND_CASE_TYPE_LABELS,
  QUALITY_INBOUND_CASE_STATUS_LABELS,
  RECEIPT_SCOPE_DISPOSITION_LABELS,
  SUPPLIER_RETURN_REASON_LABELS,
} from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import { useAuthStore } from '../../../stores/auth';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import InboundInspectionRecord from './InboundInspectionRecord.vue';
import QualityReplacementDialog from './QualityReplacementDialog.vue';
type HistoryTab = 'revisions' | 'cases' | 'returns' | 'inbounds' | 'scopes';
const visible = ref(false),
  lineId = ref(''),
  tab = ref<HistoryTab>('revisions'),
  loading = ref(false),
  total = ref(0),
  page = ref(1),
  pageSize = ref(10);
const rows = ref<
  Array<
    | ReceiptRevisionItem
    | ReceiptScopeItem
    | SupplierReturnItem
    | ReceiptInboundHistoryItem
    | QualityInboundCaseItem
  >
>([]);
const auth = useAuthStore(),
  router = useRouter();
const sourceLine = ref<ProcurementReceiptLine | null>(null),
  replacement = ref<InstanceType<typeof QualityReplacementDialog>>();
const read = useLatestReadRequest(() => {
  loading.value = false;
});
const load = async (): Promise<void> => {
  if (!visible.value || !read.isActive()) return;
  const target = lineId.value,
    kind = tab.value;
  const current = read.begin(() => visible.value && lineId.value === target && tab.value === kind);
  loading.value = true;
  try {
    const loaders = {
      revisions: procurementApi.receiptRevisions,
      cases: procurementApi.receiptCases,
      returns: procurementApi.receiptReturns,
      inbounds: procurementApi.receiptInbounds,
      scopes: procurementApi.receiptScopes,
    };
    const result = await loaders[kind](
      target,
      { page: page.value, pageSize: pageSize.value },
      current.signal,
    );
    if (current.isCurrent()) {
      rows.value = result.items;
      total.value = result.total;
    }
  } catch (error) {
    if (current.isCurrent()) EMessage.error(error, '到货历史加载失败');
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
};
const open = async (
  id: string,
  initial: HistoryTab = 'revisions',
  source?: ProcurementReceiptLine,
): Promise<void> => {
  lineId.value = id;
  sourceLine.value = source ?? null;
  tab.value = initial;
  page.value = 1;
  rows.value = [];
  total.value = 0;
  visible.value = true;
  await load();
};
const changeTab = async (): Promise<void> => {
  rows.value = [];
  total.value = 0;
  page.value = 1;
  await load();
};
const changePage = async (value: number): Promise<void> => {
  page.value = value;
  await load();
};
const changePageSize = async (value: number): Promise<void> => {
  pageSize.value = value;
  await changeTab();
};
const close = async (): Promise<boolean> => {
  if (replacement.value?.locked) {
    EMessage.warning('请先核对补单创建结果');
    return false;
  }
  if (replacement.value?.visible && !(await replacement.value.close())) return false;
  visible.value = false;
  return true;
};
const beforeClose = (): void => {
  void close();
};
const replacementSaved = async (id: string): Promise<void> => {
  visible.value = false;
  await router.push({ name: 'procurement-orders', query: { purchaseOrderId: id } });
};
const goInbound = async (id: string): Promise<void> => {
  if (await close())
    await router.push({
      name: 'warehouse-inbound',
      query: { inboundId: id, sourceType: 'purchased' },
    });
};
watch(visible, (value) => {
  if (!value) read.invalidate();
});
onActivated(() => {
  if (visible.value) void load();
});
defineExpose({ open, close, visible, locked: computed(() => Boolean(replacement.value?.locked)) });
</script>
