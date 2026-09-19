<template>
  <section>
    <div class="query-panel">
      <el-form
        inline
        @submit.prevent="search"
        ><el-form-item label="到货 / 采购 / 物料"
          ><el-input
            v-model="keyword"
            clearable
            maxlength="100"
            placeholder="输入单号、名称或版本" /></el-form-item
        ><el-form-item label="办理状态"
          ><el-select
            v-model="status"
            clearable
            placeholder="全部"
            style="width: 180px"
            ><el-option
              value="uninspected"
              :label="RECEIPT_SCOPE_DISPOSITION_LABELS.uninspected" /><el-option
              v-for="value in QUALITY_INBOUND_CASE_STATUSES"
              :key="value"
              :value="value"
              :label="QUALITY_INBOUND_CASE_STATUS_LABELS[value]" /></el-select></el-form-item
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
          ><span class="help"
            >到货必须检验，明确放行后由仓管确认入库；采购关闭不清除检验待办。</span
          ></template
        ><template #tools
          ><el-button
            :icon="Refresh"
            text
            circle
            :loading="loading"
            aria-label="刷新来料检验"
            @click="load" /></template
      ></TableToolbar>
      <el-table
        v-loading="loading"
        :data="rows"
        row-key="taskKey"
        empty-text="暂无来料检验记录"
        ><el-table-column
          prop="receiptNo"
          label="到货单"
          min-width="170"
        /><el-table-column
          prop="purchaseNo"
          label="采购单"
          min-width="170"
        /><el-table-column
          prop="supplierName"
          label="供应商"
          min-width="170"
        /><el-table-column
          label="物料 / 版本"
          min-width="265"
          ><template #default="{ row }"
            >{{ row.itemCode }} · {{ row.itemName }}
            <p>{{ row.materialVariantCode }}</p></template
          ></el-table-column
        ><el-table-column
          label="覆盖量"
          width="105"
          ><template #default="{ row }"
            >{{ Number(row.coveredQuantity) }} {{ row.unit }}</template
          ></el-table-column
        ><el-table-column
          label="办理类型"
          width="145"
          ><template #default="{ row }">{{
            row.case
              ? QUALITY_INBOUND_CASE_TYPE_LABELS[row.case.caseType as QualityInboundCaseType]
              : RECEIPT_SCOPE_DISPOSITION_LABELS.uninspected
          }}</template></el-table-column
        ><el-table-column
          label="状态"
          width="140"
          ><template #default="{ row }"
            ><el-tag :type="row.case?.status === 'reviewing' ? 'warning' : 'info'">{{
              row.case
                ? QUALITY_INBOUND_CASE_STATUS_LABELS[row.case.status as QualityInboundCaseStatus]
                : RECEIPT_SCOPE_DISPOSITION_LABELS.uninspected
            }}</el-tag></template
          ></el-table-column
        ><el-table-column
          label="操作"
          width="110"
          fixed="right"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click="navigate(row.receiptLineId, row)"
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
    <InboundInspectionDetailDialog
      ref="detail"
      @changed="load"
    />
  </section>
</template>
<script setup lang="ts">
import { nextTick, onActivated, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import type {
  ProcurementInboundInspectionItem,
  QualityInboundCaseType,
  QualityInboundCaseStatus,
} from '@company/contracts';
import {
  QUALITY_INBOUND_CASE_STATUSES,
  QUALITY_INBOUND_CASE_STATUS_LABELS,
  QUALITY_INBOUND_CASE_TYPE_LABELS,
  RECEIPT_SCOPE_DISPOSITION_LABELS,
} from '@company/constants';
import { procurementApi } from '../../api/procurement';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { EMessage } from '../../utils/message';
import { useLatestReadRequest } from '../../composables/requests/useLatestReadRequest';
import { useInboundInspectionsList } from '../procurement/composables/useInboundInspectionsList';
import InboundInspectionDetailDialog from '../procurement/components/InboundInspectionDetailDialog.vue';
defineOptions({ name: 'InboundInspectionsPage' });
const route = useRoute(),
  router = useRouter();
const {
  keyword,
  status,
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
} = useInboundInspectionsList();
const detail = ref<InstanceType<typeof InboundInspectionDetailDialog>>();
const locator = useLatestReadRequest(() => {});
let navigating = false;
const navigate = async (
  id: string,
  context?: ProcurementInboundInspectionItem,
): Promise<boolean> => {
  if (navigating) return false;
  if (detail.value?.locked) {
    EMessage.warning('请先确认当前检验操作结果再切换');
    return false;
  }
  navigating = true;
  try {
    if (detail.value?.visible && !(await detail.value.close())) return false;
    await detail.value?.open(id, context);
    return true;
  } finally {
    navigating = false;
  }
};
let consumed = '',
  accepted: Record<string, string> = {};
const locate = async (): Promise<void> => {
  if (route.name !== 'quality-inbound-inspections') return;
  await nextTick();
  const lineId = typeof route.query.receiptLineId === 'string' ? route.query.receiptLineId : '',
    caseId = typeof route.query.caseId === 'string' ? route.query.caseId : '';
  const token = JSON.stringify([lineId, caseId]);
  if (token === consumed || (!lineId && !caseId)) return;
  consumed = token;
  const current = locator.begin(
    () =>
      route.name === 'quality-inbound-inspections' &&
      JSON.stringify([
        typeof route.query.receiptLineId === 'string' ? route.query.receiptLineId : '',
        typeof route.query.caseId === 'string' ? route.query.caseId : '',
      ]) === token,
  );
  let succeeded = false;
  try {
    if (caseId) {
      const task = await procurementApi.getInspection(caseId, current.signal);
      if (!current.isCurrent()) return;
      succeeded = await navigate(task.receiptLineId, task);
    } else succeeded = await navigate(lineId);
  } catch (error) {
    if (current.isCurrent()) EMessage.error(error, '检验记录定位失败');
  }
  if (!current.isCurrent()) return;
  if (succeeded)
    accepted = { ...(lineId ? { receiptLineId: lineId } : {}), ...(caseId ? { caseId } : {}) };
  else {
    const query = { ...route.query };
    delete query.receiptLineId;
    delete query.caseId;
    consumed = JSON.stringify([accepted.receiptLineId ?? '', accepted.caseId ?? '']);
    await router.replace({ query: { ...query, ...accepted } });
  }
};
watch(
  () => [route.name, route.query.receiptLineId, route.query.caseId],
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
.help {
  color: #6b7280;
  font-size: 13px;
}
</style>
