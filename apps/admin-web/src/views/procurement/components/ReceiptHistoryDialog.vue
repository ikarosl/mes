<template>
  <el-dialog
    v-model="visible"
    title="到货明细历史"
    :width="DialogWidth.workbench"
    workbench
    :before-close="beforeClose"
  >
    <el-alert
      v-if="readError"
      type="error"
      title="本次历史读取失败，请重试；当前显示仅供参考。"
      :closable="false"
    />
    <el-tabs
      v-model="tab"
      @tab-change="changeTab"
      ><el-tab-pane
        label="处理轮次"
        name="rounds" /><el-tab-pane
        label="实收修订"
        name="revisions" /><el-tab-pane
        label="检验与复核"
        name="cases" /><el-tab-pane
        label="正式清单"
        name="acceptances" /><el-tab-pane
        label="供应商退回"
        name="returns" /><el-tab-pane
        label="实际入库"
        name="inbounds" /><el-tab-pane
        label="处置分配"
        name="allocations"
    /></el-tabs>
    <el-table
      v-loading="loading"
      :data="rows"
      empty-text="暂无记录"
    >
      <template v-if="tab === 'rounds'">
        <el-table-column
          prop="roundNo"
          label="轮次"
          width="85"
        />
        <el-table-column
          label="发起原因"
          width="140"
          ><template #default="{ row }">{{
            RECEIPT_ROUND_TRIGGER_LABELS[row.triggerType as ReceiptRoundItem['triggerType']]
          }}</template></el-table-column
        >
        <el-table-column
          label="阶段"
          width="150"
          ><template #default="{ row }">{{
            RECEIPT_ROUND_STATUS_LABELS[row.status as ReceiptRoundItem['status']]
          }}</template></el-table-column
        >
        <el-table-column
          prop="startingQuantity"
          label="开始时未处置量"
          width="145"
        />
        <el-table-column
          prop="previousRoundId"
          label="前一轮"
          width="95"
        />
        <el-table-column
          prop="inspectionId"
          label="引用检验"
          width="105"
        />
        <el-table-column
          prop="reason"
          label="原因"
          min-width="200"
        />
        <el-table-column
          label="发起时间"
          width="185"
          ><template #default="{ row }">{{
            formatDateTimeForDisplay(row.createdAt)
          }}</template></el-table-column
        >
      </template>
      <template v-else-if="tab === 'revisions'">
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
          label="原申报量"
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
      <template v-else-if="tab === 'acceptances'">
        <el-table-column type="expand"
          ><template #default="{ row }"
            ><el-table :data="row.details">
              <el-table-column
                prop="id"
                label="分配明细"
                width="110"
              /><el-table-column
                prop="purchaseNo"
                label="采购单"
                min-width="190"
              />
              <el-table-column
                label="授权去向"
                width="110"
                ><template #default="{ row: detail }">{{
                  RECEIPT_ALLOCATION_AUTHORIZATION_LABELS[
                    detail.disposition as ReceiptAllocationDisposition
                  ]
                }}</template></el-table-column
              >
              <el-table-column
                prop="quantity"
                label="数量"
                width="100"
              />
              <el-table-column
                label="退回原因"
                width="150"
                ><template #default="{ row: detail }">{{
                  detail.returnReason
                    ? SUPPLIER_RETURN_REASON_LABELS[detail.returnReason as ReceiptReturnReason]
                    : '—'
                }}</template></el-table-column
              >
            </el-table></template
          ></el-table-column
        >
        <el-table-column
          prop="id"
          label="正式清单"
          width="110"
        /><el-table-column
          prop="inspectionId"
          label="引用检验"
          width="110"
        />
        <el-table-column
          prop="confirmedScopeQuantity"
          label="库管核实量"
          width="115"
        />
        <el-table-column label="实收版本"
          ><template #default="{ row }"
            >{{ row.beforeReceiptRevisionId }} → {{ row.afterReceiptRevisionId }}</template
          ></el-table-column
        >
        <el-table-column
          prop="roundId"
          label="处理轮次"
          width="100"
        />
        <el-table-column
          prop="overrideReason"
          label="异常 / 超建议依据"
          min-width="220"
        />
        <el-table-column
          prop="previousAcceptanceId"
          label="前一清单"
          width="110"
        /><el-table-column
          prop="remark"
          label="确认 / 更正说明"
          min-width="220"
        />
        <el-table-column
          prop="createdBy"
          label="确认人"
          width="100"
        /><el-table-column
          label="确认时间"
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
              v-if="row.reasonType === 'quality' && row.allocationId"
              link
              type="primary"
              :disabled="loading || readError || replacement?.visible"
              @click="
                replacement?.open(sourceLine!, {
                  allocationId: row.allocationId,
                  quantity: row.returnedQuantity,
                  returned: true,
                })
              "
              >质量补发</el-button
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
          prop="allocationId"
          label="正式分配明细"
          min-width="140"
        /><el-table-column
          prop="inspectionId"
          label="引用检验"
          min-width="110"
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
          label="效力"
          width="110"
          ><template #default="{ row }">{{
            row.isCurrent ? '当前轮次' : '历史轮次'
          }}</template></el-table-column
        >
        <el-table-column
          prop="inboundQuantity"
          label="已入库"
          width="100"
        />
        <el-table-column
          prop="returnedQuantity"
          label="已退回"
          width="100"
        />
        <el-table-column
          label="当前分配余量"
          width="130"
          ><template #default="{ row }">{{
            row.isCurrent ? row.remainingQuantity : 0
          }}</template></el-table-column
        >
        <el-table-column
          prop="id"
          label="分配"
          min-width="160"
        /><el-table-column
          prop="roundId"
          label="所属轮次"
          width="100"
        /><el-table-column
          label="数量"
          width="110"
          ><template #default="{ row }">{{ Number(row.quantity) }}</template></el-table-column
        ><el-table-column
          label="授权去向"
          width="170"
          ><template #default="{ row }">{{
            RECEIPT_ALLOCATION_AUTHORIZATION_LABELS[row.disposition as ReceiptAllocationDisposition]
          }}</template></el-table-column
        ><el-table-column
          prop="remark"
          label="处置说明"
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
  ReceiptAllocationItem,
  ReceiptAllocationDisposition,
  SupplierReturnItem,
  ReceiptInboundHistoryItem,
  QualityInboundCaseItem,
  QualityInboundCaseType,
  QualityInboundCaseStatus,
  ProcurementReceiptLine,
  ReceiptAcceptanceItem,
  ReceiptReturnReason,
  ReceiptRoundItem,
} from '@company/contracts';
import {
  PERMISSIONS,
  QUALITY_INBOUND_CASE_TYPE_LABELS,
  QUALITY_INBOUND_CASE_STATUS_LABELS,
  RECEIPT_ALLOCATION_AUTHORIZATION_LABELS,
  SUPPLIER_RETURN_REASON_LABELS,
  RECEIPT_ROUND_STATUS_LABELS,
  RECEIPT_ROUND_TRIGGER_LABELS,
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
type HistoryTab =
  'rounds' | 'revisions' | 'cases' | 'returns' | 'inbounds' | 'allocations' | 'acceptances';
const visible = ref(false),
  lineId = ref(''),
  tab = ref<HistoryTab>('revisions'),
  loading = ref(false),
  readError = ref(false),
  total = ref(0),
  page = ref(1),
  pageSize = ref(10);
const rows = ref<
  Array<
    | ReceiptRoundItem
    | ReceiptAcceptanceItem
    | ReceiptRevisionItem
    | ReceiptAllocationItem
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
      rounds: procurementApi.receiptRounds,
      acceptances: procurementApi.receiptAcceptances,
      revisions: procurementApi.receiptRevisions,
      cases: procurementApi.receiptCases,
      returns: procurementApi.receiptReturns,
      inbounds: procurementApi.receiptInbounds,
      allocations: procurementApi.receiptAllocations,
    };
    const result = await loaders[kind](
      target,
      { page: page.value, pageSize: pageSize.value },
      current.signal,
    );
    if (current.isCurrent()) {
      rows.value = result.items;
      total.value = result.total;
      readError.value = false;
    }
  } catch (error) {
    if (current.isCurrent()) {
      readError.value = true;
      EMessage.error(error, '到货历史加载失败');
    }
  } finally {
    if (current.isCurrent()) loading.value = false;
  }
};
const open = async (
  id: string,
  initial: HistoryTab = 'revisions',
  source?: ProcurementReceiptLine,
): Promise<void> => {
  if (visible.value && !(await close())) return;
  lineId.value = id;
  sourceLine.value = source ?? null;
  tab.value = initial;
  page.value = 1;
  rows.value = [];
  total.value = 0;
  readError.value = false;
  visible.value = true;
  await load();
};
const changeTab = async (): Promise<void> => {
  rows.value = [];
  total.value = 0;
  readError.value = false;
  page.value = 1;
  await load();
};
const changePage = async (value: number): Promise<void> => {
  page.value = value;
  rows.value = [];
  readError.value = false;
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
