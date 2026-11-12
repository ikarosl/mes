<template>
  <section class="inspection-records">
    <el-alert
      v-if="!canViewQuality"
      title="无来料检验查看权限，无法读取检验记录。"
      type="info"
      :closable="false"
    />
    <el-empty
      v-else-if="!receiptLineId"
      description="请选择到货物料"
    />
    <template v-else>
      <el-alert
        v-if="recordsError"
        :title="recordsError"
        type="error"
        :closable="false"
        class="notice"
      />
      <div
        v-if="!recordsLoading && (recordsError || !hasCurrentPage)"
        class="retry-actions"
      >
        <el-button
          :disabled="!active"
          @click="loadRecords"
          >重试读取检验记录</el-button
        >
      </div>
      <el-table
        v-loading="recordsLoading"
        :data="records"
        row-key="id"
      >
        <template #empty>{{ recordsEmptyText }}</template>
        <el-table-column
          label="报告编号"
          min-width="200"
        >
          <template #default="{ row }">
            <strong>{{ row.reportNo }}</strong>
          </template>
        </el-table-column>
        <el-table-column
          label="检验日期"
          width="185"
        >
          <template #default="{ row }">{{ formatDateTimeForDisplay(row.inspectedAt) }}</template>
        </el-table-column>
        <el-table-column
          label="检验方式"
          width="90"
        >
          <template #default="{ row }">{{ inspectionMethodLabel(row) }}</template>
        </el-table-column>
        <el-table-column
          label="合格 / 不合格"
          min-width="145"
          align="right"
        >
          <template #default="{ row }">
            <span :class="{ qualified: Number(row.qualifiedQuantity) > 0 }">{{
              row.qualifiedQuantity
            }}</span>
            /
            <span :class="{ unqualified: Number(row.unqualifiedQuantity) > 0 }">{{
              row.unqualifiedQuantity
            }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="记录状态"
          min-width="120"
        >
          <template #default="{ row }">
            <el-tag
              :type="inspectionRecordTagType(row, recordsSnapshot?.currentReportId ?? null)"
              effect="plain"
              >{{
                inspectionRecordStatusLabel(row, recordsSnapshot?.currentReportId ?? null)
              }}</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="90"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :disabled="!active"
              :aria-expanded="focusedReportId === row.id"
              :aria-label="`${focusedReportId === row.id ? '收起' : '展开'}报告 ${row.reportNo}`"
              @click="toggleReport(row.id)"
              >{{ focusedReportId === row.id ? '收起' : '展开' }}</el-button
            >
          </template>
        </el-table-column>
      </el-table>
      <PaginationFooter
        v-if="recordsSnapshot"
        :total="recordsSnapshot.total"
        total-suffix="条报告记录（含历史）"
        :current-page="page"
        :page-size="pageSize"
        :disabled="recordsLoading || !active"
        compact
        @page-change="changePage"
        @update:page-size="changePageSize"
      />
      <section
        v-if="focusedReportId"
        v-loading="reportLoading"
        class="saved-report"
        aria-label="已保存检验报告"
      >
        <el-alert
          v-if="reportError"
          :title="reportError"
          type="error"
          :closable="false"
          class="notice"
        />
        <div
          v-if="!savedReport"
          class="report-pending"
        >
          <span>{{ reportLoading ? '正在读取所选报告…' : '所选报告尚未读取成功。' }}</span>
          <el-button
            v-if="!reportLoading"
            :disabled="!active"
            @click="loadReport(focusedReportId)"
            >重试读取报告</el-button
          >
        </div>
        <template v-else>
          <div class="report-heading">
            <strong>报告编号：{{ savedReport.reportNo }}</strong>
            <el-tag
              v-if="recordsSnapshot"
              :type="inspectionRecordTagType(savedReport, recordsSnapshot.currentReportId)"
              effect="plain"
              >{{
                inspectionRecordStatusLabel(savedReport, recordsSnapshot.currentReportId)
              }}</el-tag
            >
            <el-button
              :loading="printing"
              :disabled="!active || reportLoading || printing"
              @click="printReport"
              >打印</el-button
            >
          </div>
          <el-descriptions
            :column="3"
            border
            size="small"
          >
            <el-descriptions-item label="材料名称">{{ savedReport.itemName }}</el-descriptions-item>
            <el-descriptions-item label="物料编码">{{ savedReport.itemCode }}</el-descriptions-item>
            <el-descriptions-item label="规格型号">{{
              savedReport.materialVariantCode || '—'
            }}</el-descriptions-item>
            <el-descriptions-item label="供应商">{{
              savedReport.supplierName
            }}</el-descriptions-item>
            <el-descriptions-item label="采购单号">{{
              savedReport.purchaseNo
            }}</el-descriptions-item>
            <el-descriptions-item label="到货单号">{{
              savedReport.receiptNo
            }}</el-descriptions-item>
            <el-descriptions-item label="来料批次号">{{
              savedReport.batchNo || '—'
            }}</el-descriptions-item>
            <el-descriptions-item
              v-if="savedReport.expiresOn"
              label="有效期"
              >{{ savedReport.expiresOn }}</el-descriptions-item
            >
            <el-descriptions-item label="检验日期">{{
              formatDateTimeForDisplay(savedReport.inspectedAt)
            }}</el-descriptions-item>
            <el-descriptions-item label="检验方式">{{
              QUALITY_INSPECTION_METHOD_LABELS[savedReport.inspectionMethod]
            }}</el-descriptions-item>
            <el-descriptions-item label="检查数量"
              >{{ savedReport.inspectedQuantity }} {{ savedReport.unit }}</el-descriptions-item
            >
            <el-descriptions-item label="合格数量">
              <span :class="{ qualified: Number(savedReport.qualifiedQuantity) > 0 }"
                >{{ savedReport.qualifiedQuantity }} {{ savedReport.unit }}</span
              >
            </el-descriptions-item>
            <el-descriptions-item label="不合格数量">
              <span :class="{ unqualified: Number(savedReport.unqualifiedQuantity) > 0 }"
                >{{ savedReport.unqualifiedQuantity }} {{ savedReport.unit }}</span
              >
            </el-descriptions-item>
          </el-descriptions>
          <JsonTableEditor
            :model-value="savedReport.inspectionDetails"
            readonly
            class="report-records"
          />
          <p
            v-if="savedReport.remark"
            class="record-text"
          >
            异常说明：{{ savedReport.remark }}
          </p>
          <p
            v-if="savedReport.evidence"
            class="record-text"
          >
            检查凭据：{{ savedReport.evidence }}
          </p>
          <p
            v-if="savedReport.correctionReason"
            class="record-text"
          >
            修订原因：{{ savedReport.correctionReason }}
          </p>
        </template>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onDeactivated, onScopeDispose, ref, shallowRef, watch } from 'vue';
import type {
  QualityIncomingInspectionReportItem,
  QualityIncomingInspectionReportPage,
  QualityIncomingInspectionReportSummary,
} from '@company/contracts';
import { QUALITY_INSPECTION_METHOD_LABELS } from '@company/constants';
import { procurementApi } from '../../../api/procurement';
import JsonTableEditor from '../../../components/JsonTableEditor.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import { printIncomingInspectionReport } from '../../quality/incoming-inspection-report/incoming-inspection-report-print';
import {
  inspectionRecordStatusLabel,
  inspectionRecordTagType,
} from '../../quality/incoming-inspection-presentation';

defineOptions({ name: 'ReceiptInspectionRecords' });
const props = defineProps<{ receiptLineId: string; active: boolean }>();
const { canAccessRoute } = useRouteAccess();
const canViewQuality = computed(() => canAccessRoute({ name: 'quality-inbound-inspections' }));
const page = ref(1),
  pageSize = ref(10),
  recordsLoading = ref(false),
  recordsError = ref('');
const recordsSnapshot = shallowRef<QualityIncomingInspectionReportPage | null>(null);
const focusedReportId = ref(''),
  selectedReport = shallowRef<QualityIncomingInspectionReportItem | null>(null),
  reportLoading = ref(false),
  reportError = ref(''),
  printing = ref(false);
let recordsAttempted = false;
let printRevision = 0;
const recordsRead = useLatestReadRequest(() => {
  recordsLoading.value = false;
});
const reportRead = useLatestReadRequest(() => {
  reportLoading.value = false;
});
const hasCurrentPage = computed(
  () =>
    recordsSnapshot.value?.page === page.value && recordsSnapshot.value.pageSize === pageSize.value,
);
const records = computed(() => (hasCurrentPage.value ? (recordsSnapshot.value?.items ?? []) : []));
const savedReport = computed(() => {
  const report = selectedReport.value;
  if (
    reportError.value ||
    !report ||
    report.id !== focusedReportId.value ||
    report.receiptLineId !== props.receiptLineId
  )
    return null;
  return report;
});
const recordsEmptyText = computed(() => {
  if (recordsLoading.value) return '正在读取检验记录…';
  if (recordsError.value) return '检验记录读取失败，请重试';
  if (!hasCurrentPage.value) return '检验记录尚未读取成功，请重试';
  return '该到货物料暂无检验记录';
});
const inspectionMethodLabel = (record: QualityIncomingInspectionReportSummary): string =>
  QUALITY_INSPECTION_METHOD_LABELS[record.inspectionMethod];

function canRead(): boolean {
  return Boolean(
    props.active && props.receiptLineId && canViewQuality.value && recordsRead.isActive(),
  );
}
function invalidatePrint(): void {
  printRevision += 1;
  printing.value = false;
}
function clearReport(): void {
  reportRead.invalidate();
  invalidatePrint();
  focusedReportId.value = '';
  selectedReport.value = null;
  reportError.value = '';
}
function invalidateReads(): void {
  recordsRead.invalidate();
  reportRead.invalidate();
  invalidatePrint();
}
function reset(): void {
  invalidateReads();
  clearReport();
  recordsSnapshot.value = null;
  recordsError.value = '';
  recordsAttempted = false;
  page.value = 1;
  pageSize.value = 10;
}
async function loadRecords(): Promise<void> {
  if (!canRead()) return;
  const target = props.receiptLineId;
  const query = { page: page.value, pageSize: pageSize.value };
  const current = recordsRead.begin(
    () =>
      props.active &&
      canViewQuality.value &&
      props.receiptLineId === target &&
      page.value === query.page &&
      pageSize.value === query.pageSize,
  );
  recordsAttempted = true;
  recordsLoading.value = true;
  recordsError.value = '';
  try {
    const result = await procurementApi.inspectionReports(target, query, current.signal);
    if (!current.isCurrent()) return;
    if (
      result.items.some((record) => record.receiptLineId !== target) ||
      result.total > 0 !== Boolean(result.currentReportId) ||
      (query.page === 1 && (result.items[0]?.id ?? null) !== result.currentReportId)
    )
      throw new Error('检验记录与当前到货物料不匹配，请重新读取');
    recordsSnapshot.value = result;
  } catch (error) {
    if (current.isCurrent()) {
      recordsError.value = hasCurrentPage.value
        ? '检验记录刷新失败，当前列表为上次读取结果，请重试。'
        : '检验记录读取失败，请重试。';
      EMessage.error(error, '检验记录读取失败');
    }
  } finally {
    if (current.isCurrent()) recordsLoading.value = false;
  }
}
async function loadReport(id: string): Promise<void> {
  if (!canRead() || !id || focusedReportId.value !== id || !reportRead.isActive()) return;
  const target = props.receiptLineId;
  const current = reportRead.begin(
    () =>
      props.active &&
      canViewQuality.value &&
      props.receiptLineId === target &&
      focusedReportId.value === id,
  );
  invalidatePrint();
  selectedReport.value = null;
  reportError.value = '';
  reportLoading.value = true;
  try {
    const result = await procurementApi.getInspection(id, current.signal);
    if (!current.isCurrent()) return;
    if (result.id !== id || result.receiptLineId !== target)
      throw new Error('报告不属于当前到货物料，请核对来源');
    selectedReport.value = result;
  } catch (error) {
    if (current.isCurrent()) {
      reportError.value = '所选报告读取失败，请重试；不会替换为其他报告。';
      EMessage.error(error, '检验报告读取失败');
    }
  } finally {
    if (current.isCurrent()) reportLoading.value = false;
  }
}
async function toggleReport(id: string): Promise<void> {
  if (!canRead()) return;
  if (focusedReportId.value === id) {
    clearReport();
    return;
  }
  clearReport();
  focusedReportId.value = id;
  await loadReport(id);
}
async function changePage(value: number): Promise<void> {
  if (!canRead()) return;
  clearReport();
  page.value = value;
  await loadRecords();
}
async function changePageSize(value: number): Promise<void> {
  if (!canRead()) return;
  pageSize.value = value;
  await changePage(1);
}
async function refresh(): Promise<void> {
  if (!canRead()) return;
  const reportId = focusedReportId.value;
  await Promise.all([loadRecords(), reportId ? loadReport(reportId) : Promise.resolve()]);
}
async function printReport(): Promise<void> {
  const report = savedReport.value;
  if (!canRead() || !report || reportLoading.value || printing.value) return;
  const revision = ++printRevision;
  const isCurrent = (): boolean =>
    revision === printRevision && canRead() && savedReport.value === report;
  printing.value = true;
  try {
    await printIncomingInspectionReport(report);
  } catch (error) {
    if (isCurrent()) EMessage.error(error, '打印报告失败，请重试');
  } finally {
    if (isCurrent()) printing.value = false;
  }
}
watch(
  [() => props.receiptLineId, () => props.active, canViewQuality],
  ([target, active, allowed], [previousTarget, , previouslyAllowed]) => {
    if (target !== previousTarget || (!allowed && previouslyAllowed)) reset();
    if (!active || !allowed) {
      invalidateReads();
      return;
    }
    // A cancelled first read remains retryable; returning to a cached tab never refetches it.
    if (!recordsAttempted) void loadRecords();
  },
  { immediate: true, flush: 'sync' },
);
onDeactivated(invalidatePrint);
onScopeDispose(invalidatePrint);
defineExpose({ refresh });
</script>

<style scoped>
.inspection-records {
  min-width: 0;
}
.notice,
.retry-actions {
  margin-bottom: 12px;
}
.saved-report {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.report-heading,
.report-pending {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}
.report-heading {
  margin-bottom: 12px;
}
.report-records {
  margin-top: 12px;
}
.record-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.qualified {
  color: var(--el-color-success);
}
.unqualified {
  color: var(--el-color-danger);
}
</style>
