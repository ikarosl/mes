<template>
  <el-dialog
    :model-value="step.visible"
    title="工序专检"
    :width="DialogWidth.workbench"
    :before-close="beforeClose"
    :close-on-click-modal="false"
  >
    <el-alert
      v-if="step.error"
      :title="step.error"
      type="error"
      :closable="false"
      show-icon
    />
    <div v-loading="step.loading">
      <el-descriptions
        v-if="step.summary"
        :column="3"
        border
      >
        <el-descriptions-item label="工单">{{ step.summary.workOrderNo }}</el-descriptions-item>
        <el-descriptions-item label="任务">{{ step.summary.batchNo }}</el-descriptions-item>
        <el-descriptions-item label="工序"
          >{{ step.summary.stepOrder }} · {{ step.summary.stepName }}</el-descriptions-item
        >
        <el-descriptions-item
          label="成品"
          :span="2"
          >{{ step.summary.productCode }} · {{ step.summary.productName }}</el-descriptions-item
        >
        <el-descriptions-item label="检查次数"
          >{{ step.summary.inspectionCount }} 次（有效
          {{ step.summary.activeInspectionCount }} 次）</el-descriptions-item
        >
        <el-descriptions-item label="有效合格累计"
          ><InspectionQuantity
            :value="step.summary.qualifiedQuantity"
            kind="qualified"
            :unit="step.summary.unit"
        /></el-descriptions-item>
        <el-descriptions-item label="有效不合格累计"
          ><InspectionQuantity
            :value="step.summary.unqualifiedQuantity"
            kind="unqualified"
            :unit="step.summary.unit"
        /></el-descriptions-item>
        <el-descriptions-item label="最近有效检查">{{
          formatDateTimeForDisplay(step.summary.latestInspectedAt)
        }}</el-descriptions-item>
        <el-descriptions-item label="累计已处理"
          >{{ step.summary.acceptedQuantity }} {{ step.summary.unit }}</el-descriptions-item
        >
        <el-descriptions-item label="待处理"
          >{{ step.summary.pendingQuantity }} {{ step.summary.unit }}</el-descriptions-item
        >
      </el-descriptions>
    </div>
    <div class="actions">
      <el-button
        type="primary"
        :disabled="step.loading || !!step.error || !step.summary?.canCreate"
        @click="create"
        >登记检查</el-button
      >
      <el-button
        v-if="canAccessRoute({ name: 'production-execution-records' })"
        :disabled="!step.summary"
        @click="goProduction"
        >查看生产处理</el-button
      >
      <InlineHint v-if="step.summary?.createBlockedReason">{{
        step.summary.createBlockedReason
      }}</InlineHint>
    </div>
    <InlineHint
      >同一工序的检查持续登记在这里。合格和不合格汇总当前有效结果，抽检累计不代表独立实物覆盖量。</InlineHint
    >
    <div class="entries-heading">
      <strong>检查明细</strong>
      <span v-if="step.summary && !step.summary.activeInspectionCount"
        >暂无有效检查，历史记录保留。</span
      >
    </div>
    <el-alert
      v-if="step.entriesError"
      :title="step.entriesError"
      type="error"
      :closable="false"
      show-icon
    />
    <el-table
      v-loading="step.entriesLoading"
      :data="step.entries"
      row-key="id"
      border
      :row-class-name="rowClassName"
    >
      <el-table-column
        label="现场范围 / 方式"
        min-width="235"
      >
        <template #default="{ row }">
          <template v-if="row.currentRecord">
            {{ row.currentRecord.scopeNote }}
            <div class="muted">
              {{
                QUALITY_INSPECTION_METHOD_LABELS[
                  row.currentRecord.inspectionMethod as ProcessInspectionRecord['inspectionMethod']
                ]
              }}
            </div>
          </template>
          <span
            v-else
            class="muted"
            >本次检查已冲销，原范围见历史</span
          >
        </template>
      </el-table-column>
      <el-table-column
        label="合格 / 不合格"
        min-width="145"
      >
        <template #default="{ row }">
          <template v-if="row.currentRecord">
            <InspectionQuantity
              :value="row.currentRecord.qualifiedQuantity"
              kind="qualified"
            />
            /
            <InspectionQuantity
              :value="row.currentRecord.unqualifiedQuantity"
              kind="unqualified"
            />
            {{ row.unit }}
          </template>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column
        prop="acceptedQuantity"
        label="已处理"
        width="85"
      />
      <el-table-column
        prop="pendingQuantity"
        label="待处理"
        width="85"
      />
      <el-table-column
        label="状态"
        width="85"
        ><template #default="{ row }">{{
          PROCESS_INSPECTION_STATUS_LABELS[row.status as ProcessInspectionEntry['status']]
        }}</template></el-table-column
      >
      <el-table-column
        label="结果登记人"
        min-width="110"
      >
        <template #default="{ row }">{{ row.currentRecord?.createdByName || '见历史' }}</template>
      </el-table-column>
      <el-table-column
        label="检验时间"
        min-width="165"
        ><template #default="{ row }">{{
          formatDateTimeForDisplay(row.currentRecord?.inspectedAt)
        }}</template></el-table-column
      >
      <el-table-column
        label="操作"
        width="210"
        fixed="right"
      >
        <template #default="{ row }">
          <el-button
            link
            type="primary"
            @click="openEntry(row.id)"
            >详情 / 历史</el-button
          >
          <el-button
            link
            type="primary"
            :disabled="!row.currentRecord"
            @click="openEntry(row.id, 'correct')"
            >更正</el-button
          >
          <el-button
            link
            type="danger"
            :disabled="!row.currentRecord || row.acceptedQuantity > 0"
            @click="openEntry(row.id, 'reverse')"
            >冲销</el-button
          >
        </template>
      </el-table-column>
    </el-table>
    <PaginationFooter
      :total="step.total"
      :current-page="step.page"
      :page-size="step.pageSize"
      @page-change="step.changePage"
      @update:page-size="step.changePageSize"
    />
    <template #footer>
      <el-button
        :loading="step.loading || step.entriesLoading"
        @click="step.refresh"
        >刷新汇总与明细</el-button
      >
      <el-button @click="close">关闭</el-button>
    </template>
  </el-dialog>
  <ProcessInspectionEntryDialog
    ref="entryDialog"
    @changed="entryChanged"
  />
</template>
<script setup lang="ts">
import { onScopeDispose, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { ProcessInspectionEntry, ProcessInspectionRecord } from '@company/contracts';
import {
  PROCESS_INSPECTION_STATUS_LABELS,
  QUALITY_INSPECTION_METHOD_LABELS,
} from '@company/constants';
import { processInspectionsApi } from '../../../api/process-inspections';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { useProcessInspectionStep } from '../composables/useProcessInspectionStep';
import { useRouteAccess } from '../../../composables/useRouteAccess';
import { useTabsStore } from '../../../stores/tabs';
import { useAuthStore } from '../../../stores/auth';
import { EMessage } from '../../../utils/message';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { DialogWidth } from '../../../utils/dialog';
import InlineHint from '../../../components/InlineHint.vue';
import PaginationFooter from '../../../components/PaginationFooter.vue';
import InspectionQuantity from './InspectionQuantity.vue';
import ProcessInspectionEntryDialog from './ProcessInspectionEntryDialog.vue';

const emit = defineEmits<{ changed: [] }>();
const step = reactive(useProcessInspectionStep());
const entryDialog = ref<InstanceType<typeof ProcessInspectionEntryDialog>>();
const selectedInspectionId = ref('');
const locationRead = useLatestReadRequest(() => {});
const { canAccessRoute } = useRouteAccess();
const router = useRouter();
async function close(): Promise<boolean> {
  if (entryDialog.value && !(await entryDialog.value.close())) return false;
  locationRead.invalidate();
  step.close();
  return true;
}
async function beforeClose(done: () => void): Promise<void> {
  if (await close()) done();
}
async function open(stepId: string): Promise<boolean> {
  if (!(await close())) return false;
  selectedInspectionId.value = '';
  await step.open(stepId);
  return true;
}
async function openEntry(id: string, action?: 'correct' | 'reverse'): Promise<void> {
  if (await entryDialog.value?.open(id, action)) selectedInspectionId.value = id;
}
async function openInspection(id: string): Promise<boolean> {
  if (!locationRead.isActive()) return false;
  if (!(await close())) return false;
  const current = locationRead.begin();
  try {
    const source = await processInspectionsApi.detail(id, current.signal);
    if (!current.isCurrent()) return false;
    if (source.id !== id) throw new Error('检查来源与当前定位对象不一致');
    await step.open(source.stepId);
    if (!current.isCurrent() || step.targetId !== source.stepId) return false;
    await openEntry(id);
    return true;
  } catch (failure) {
    if (current.isCurrent()) EMessage.error(failure, '专检来源定位失败');
    return false;
  }
}
async function create(): Promise<void> {
  if (step.summary && !step.loading && !step.error && step.summary.canCreate)
    await entryDialog.value?.openCreate(step.summary);
}
async function entryChanged(id: string, created: boolean): Promise<void> {
  selectedInspectionId.value = id;
  emit('changed');
  await step.refreshAfterEntryChange(created);
}
async function goProduction(): Promise<void> {
  if (!step.summary || !canAccessRoute({ name: 'production-execution-records' })) return;
  await router.push({
    name: 'production-execution-records',
    query: { batchId: step.summary.batchId, stepId: step.summary.stepId },
  });
}
function rowClassName({ row }: { row: ProcessInspectionEntry }): string {
  return row.id === selectedInspectionId.value ? 'selected-inspection' : '';
}
onScopeDispose(useTabsStore().registerCloseGuard('quality-process-inspections', close));
const auth = useAuthStore();
watch(
  () => auth.session?.user.id,
  () => locationRead.invalidate(),
);
defineExpose({ open, openInspection, close });
</script>
<style scoped>
.actions,
.entries-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 16px 0;
}
.muted,
.entries-heading span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.muted {
  margin-top: 4px;
}
.el-alert {
  margin-bottom: 12px;
}
:deep(.el-descriptions__content) {
  overflow-wrap: anywhere;
}
:deep(.selected-inspection) {
  --el-table-tr-bg-color: var(--el-color-primary-light-9);
}
</style>
