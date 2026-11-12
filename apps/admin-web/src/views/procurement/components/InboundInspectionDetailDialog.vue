<template>
  <el-dialog
    :model-value="visible"
    title="进料检验报告"
    :width="DialogWidth.workbench"
    workbench
    :before-close="beforeClose"
    :close-on-click-modal="false"
    :show-close="!command.busy.value"
    @update:model-value="(value: boolean) => !value && close()"
  >
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      class="notice"
    /><el-alert
      v-if="command.status.value !== 'idle'"
      :title="submissionRecoveryMessage(command.status.value, '检验报告历史')"
      type="warning"
      :closable="false"
      class="notice"
    />
    <div v-loading="loading || templateLoading">
      <ReceiptVoidNotice
        v-if="line?.void"
        :record="line.void"
        class="notice"
      /><el-descriptions
        v-if="line"
        :column="3"
        border
        size="small"
        ><el-descriptions-item label="材料名称"
          ><strong>{{ line.itemName }}</strong></el-descriptions-item
        ><el-descriptions-item label="物料版本">{{ line.materialVariantCode }}</el-descriptions-item
        ><el-descriptions-item label="供应商">{{ line.supplierName }}</el-descriptions-item
        ><el-descriptions-item label="采购单号">{{ line.purchaseNo }}</el-descriptions-item
        ><el-descriptions-item label="到货单号">{{ line.receiptNo }}</el-descriptions-item
        ><el-descriptions-item label="来料批次号">{{
          line.receiptNo
        }}</el-descriptions-item></el-descriptions
      >
      <el-tabs
        v-model="activeTab"
        class="inspection-tabs"
        ><el-tab-pane
          :label="form.previousRecordId ? '更正报告' : '填写报告'"
          name="current"
          :disabled="Boolean(line?.void)"
          ><InlineHint
            v-if="form.previousRecordId"
            tone="warning"
            class="notice"
            >本次保存新增更正记录，保留原报告；请填写更正原因。</InlineHint
          ><InboundInspectionFields
            v-if="line"
            :key="line.id"
            v-model="form"
            :unit="line.unit"
            :active="visible && activeTab === 'current'"
            :disabled="locked || loading || Boolean(error) || Boolean(line.void)"
        /></el-tab-pane>
        <el-tab-pane
          label="检查记录 / 报告历史"
          name="history"
          ><el-alert
            v-if="recordsError"
            :title="recordsError"
            type="error"
            :closable="false"
            class="notice"
          />
          <el-table
            v-loading="recordsLoading"
            :data="records"
            row-key="id"
            ><el-table-column
              label="报告编号"
              min-width="190"
              ><template #default="{ row }"
                ><el-button
                  link
                  type="primary"
                  :disabled="reportLoading"
                  @click="showReport(row.id)"
                  >{{ row.reportNo }}</el-button
                ></template
              ></el-table-column
            ><el-table-column
              label="检验日期"
              width="185"
              ><template #default="{ row }">{{
                formatDateTimeForDisplay(row.inspectedAt)
              }}</template></el-table-column
            ><el-table-column
              label="方式"
              width="80"
              ><template #default="{ row }">{{
                QUALITY_INSPECTION_METHOD_LABELS[row.inspectionMethod as QualityInspectionMethod]
              }}</template></el-table-column
            ><el-table-column
              label="合格 / 不合格"
              min-width="135"
              ><template #default="{ row }"
                >{{ Number(row.qualifiedQuantity) }} /
                <span :class="{ unqualified: Number(row.unqualifiedQuantity) > 0 }">{{
                  Number(row.unqualifiedQuantity)
                }}</span>
                {{ line?.unit }}</template
              ></el-table-column
            ><el-table-column
              label="记录关系"
              min-width="120"
              ><template #default="{ row }"
                ><el-tag
                  v-if="row.correctedByRecordId"
                  type="info"
                  >已更正</el-tag
                ><el-tag
                  v-else-if="row.previousRecordId"
                  effect="plain"
                  >更正记录</el-tag
                ><span v-else>检查记录</span></template
              ></el-table-column
            ><el-table-column
              label="操作"
              width="150"
              fixed="right"
              ><template #default="{ row }"
                ><el-button
                  link
                  type="primary"
                  @click="showReport(row.id)"
                  >查看 / 打印</el-button
                ><el-button
                  v-if="!row.correctedByRecordId && !line?.void"
                  link
                  type="primary"
                  :disabled="locked"
                  @click="correctReport(row.id)"
                  >更正</el-button
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
          /><el-alert
            v-if="reportError"
            :title="reportError"
            type="error"
            :closable="false"
            class="notice"
          />
          <section
            v-if="selectedReport && selectedReport.id === focusedReportId && !reportError"
            v-loading="reportLoading"
            class="saved-report"
          >
            <div class="report-heading">
              <strong>{{ selectedReport.reportNo }}</strong
              ><el-button
                :disabled="reportLoading || printing"
                :loading="printing"
                @click="printReport"
                >打印进料检验报告</el-button
              >
            </div>
            <el-descriptions
              :column="3"
              border
              size="small"
              ><el-descriptions-item label="材料名称">{{
                selectedReport.itemName
              }}</el-descriptions-item
              ><el-descriptions-item label="规格型号">{{
                selectedReport.materialVariantCode || '—'
              }}</el-descriptions-item
              ><el-descriptions-item label="供应商">{{
                selectedReport.supplierName
              }}</el-descriptions-item
              ><el-descriptions-item label="采购单号">{{
                selectedReport.purchaseNo
              }}</el-descriptions-item
              ><el-descriptions-item label="来料批次号">{{
                selectedReport.batchNo || '—'
              }}</el-descriptions-item
              ><el-descriptions-item label="有效期">{{
                selectedReport.expiresOn || '—'
              }}</el-descriptions-item
              ><el-descriptions-item label="检验日期">{{
                formatDateTimeForDisplay(selectedReport.inspectedAt)
              }}</el-descriptions-item
              ><el-descriptions-item label="检验方式">{{
                QUALITY_INSPECTION_METHOD_LABELS[selectedReport.inspectionMethod]
              }}</el-descriptions-item
              ><el-descriptions-item label="检查数量"
                >{{ Number(selectedReport.inspectedQuantity) }}
                {{ selectedReport.unit }}</el-descriptions-item
              ><el-descriptions-item label="合格数量"
                >{{ Number(selectedReport.qualifiedQuantity) }}
                {{ selectedReport.unit }}</el-descriptions-item
              ><el-descriptions-item label="不合格数量"
                >{{ Number(selectedReport.unqualifiedQuantity) }}
                {{ selectedReport.unit }}</el-descriptions-item
              ><el-descriptions-item label="到货单号">{{
                selectedReport.receiptNo
              }}</el-descriptions-item></el-descriptions
            ><JsonTableEditor
              :model-value="selectedReport.inspectionDetails"
              readonly
              class="report-records"
            />
            <p
              v-if="selectedReport.remark"
              class="record-text"
            >
              异常说明：{{ selectedReport.remark }}
            </p>
            <p
              v-if="selectedReport.evidence"
              class="record-text"
            >
              检查凭据：{{ selectedReport.evidence }}
            </p>
            <p
              v-if="selectedReport.correctionReason"
              class="record-text"
            >
              更正原因：{{ selectedReport.correctionReason }}
            </p>
          </section>
        </el-tab-pane></el-tabs
      >
    </div>
    <template #footer
      ><el-button
        v-if="allowAssociation && line"
        :disabled="locked"
        @click="emit('change-association', line.receiptId)"
        >调整到货归属</el-button
      ><el-button
        v-if="line && canViewReceipt"
        :disabled="locked"
        @click="goReceipt"
        >查看到货</el-button
      ><el-button
        :disabled="command.busy.value || checking"
        @click="close"
        >关闭</el-button
      ><el-button
        :disabled="locked || loading"
        @click="refresh"
        >刷新</el-button
      ><el-button
        v-if="command.status.value === 'pending'"
        type="primary"
        :loading="command.busy.value"
        @click="command.retry"
        >重试本次提交</el-button
      ><template v-else-if="command.status.value === 'idle'"
        ><el-button
          v-if="activeTab === 'history' && line && !line.void"
          type="primary"
          :disabled="locked"
          @click="newReport"
          >填写新报告</el-button
        ><el-button
          v-else-if="activeTab === 'current'"
          type="primary"
          :loading="command.busy.value || checking"
          :disabled="!canSave"
          @click="save"
          >保存检验报告</el-button
        ></template
      ></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { QualityInspectionMethod } from '@company/contracts';
import { QUALITY_INSPECTION_METHOD_LABELS } from '@company/constants';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { submissionRecoveryMessage } from '../../../composables/idempotency/useIdempotentIntent';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import InlineHint from '../../../components/InlineHint.vue';
import JsonTableEditor from '../../../components/JsonTableEditor.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import { useInboundInspection } from '../composables/useInboundInspection';
import { printIncomingInspectionReport } from '../../quality/incoming-inspection-report-print';
import InboundInspectionFields from './InboundInspectionFields.vue';
import ReceiptVoidNotice from './ReceiptVoidNotice.vue';
defineOptions({ name: 'InboundInspectionDetailDialog' });
withDefaults(defineProps<{ allowAssociation?: boolean }>(), { allowAssociation: false });
const emit = defineEmits<{
  changed: [];
  'record-focus-cleared': [];
  'change-association': [receiptId: string];
}>();
const editor = useInboundInspection(() => emit('changed'));
const {
  visible,
  lineId,
  line,
  loading,
  error,
  activeTab,
  form,
  records,
  recordsLoading,
  recordsError,
  page,
  pageSize,
  total,
  selectedReport,
  reportLoading,
  reportError,
  focusedReportId,
  command,
  locked,
  checking,
  templateLoading,
  canSave,
  open,
  close,
  refresh,
  showReport,
  newReport,
  correctReport,
  save,
  changePage,
  changePageSize,
} = editor;
const router = useRouter(),
  { canAccessRoute } = useRouteAccess();
const canViewReceipt = computed(() => canAccessRoute({ name: 'procurement-receipts' }));
async function goReceipt(): Promise<void> {
  const id = lineId.value;
  if (id && (await close()))
    await router.push({ name: 'procurement-receipts', query: { receiptLineId: id } });
}
const printing = ref(false);
async function printReport(): Promise<void> {
  const report = selectedReport.value;
  if (
    !report ||
    report.id !== focusedReportId.value ||
    reportLoading.value ||
    reportError.value ||
    printing.value
  )
    return;
  printing.value = true;
  try {
    await printIncomingInspectionReport(report);
  } catch (error) {
    EMessage.error(error, '打印报告失败，请重试');
  } finally {
    printing.value = false;
  }
}
const beforeClose = (): void => {
  void close();
};
defineExpose({
  open,
  close,
  visible,
  openedLineId: computed(() => (visible.value ? lineId.value : '')),
  openedReportId: computed(() => (visible.value ? focusedReportId.value : '')),
  locked,
});
</script>
<style scoped>
.inspection-tabs {
  margin-top: 16px;
}
.inspection-tabs :deep(.el-tabs__content) {
  overflow: visible;
}
.notice {
  margin-bottom: 16px;
}
.saved-report {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.report-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.report-records {
  margin-top: 12px;
}
.record-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.unqualified {
  color: var(--el-color-danger);
  font-weight: 600;
}
</style>
