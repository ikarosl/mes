<template>
  <el-dialog
    :model-value="modelValue"
    title="批量全量冲销正常报工"
    :width="DialogWidth.workbench"
    workbench
    :before-close="beforeClose"
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    @update:model-value="(open: boolean) => !open && requestClose()"
  >
    <InlineHint
      >本次仅处理清单中明确选中的
      {{ selections.length }}
      条普通正常报工，限定同一任务；所有记录全部成功或全部不生效。工序状态、批准产出和库存不会随冲销改变。</InlineHint
    >
    <el-alert
      v-if="intentStatus !== 'idle'"
      class="notice"
      title="提交结果尚未确认，已保留本次选择和原因。请按原请求重试或核对报工历史后关闭。"
      type="warning"
      :closable="false"
      show-icon
    />
    <el-alert
      v-if="errorText"
      class="notice"
      :title="errorText"
      type="error"
      :closable="false"
      show-icon
    />
    <section class="notice">
      <div class="section-heading">
        <strong>明确选中的记录</strong
        ><span>{{ submitted?.batchNo || record?.batchNo || '—' }}</span>
      </div>
      <el-table
        :data="selections"
        row-key="reportId"
        empty-text="尚未选择记录"
      >
        <el-table-column
          label="工序"
          min-width="150"
          ><template #default="{ row }"
            >{{ row.stepOrder }}. {{ row.stepName }}</template
          ></el-table-column
        >
        <el-table-column
          label="报工单号 / ID"
          min-width="220"
          ><template #default="{ row }"
            >{{ row.report.reportNo
            }}<small class="muted">报工 ID {{ row.reportId }}</small></template
          ></el-table-column
        >
        <el-table-column
          label="原正常数量"
          min-width="150"
          ><template #default="{ row }"
            >{{ formatQuantity(row.report.normalQuantity) }} {{ row.report.unit }}</template
          ></el-table-column
        >
        <el-table-column
          label="核对结果"
          min-width="250"
          ><template #default="{ row }">
            <template v-if="previewItem(row.reportId)"
              ><span
                :class="previewItem(row.reportId)?.canReverse ? 'valid-text' : 'blocked-text'"
                >{{
                  previewItem(row.reportId)?.canReverse
                    ? '可全量冲销'
                    : previewItem(row.reportId)?.blockedReason
                }}</span
              >
              <div
                v-for="dependency in previewItem(row.reportId)?.dependencies ?? []"
                :key="`${dependency.kind}:${dependency.id}`"
                class="dependency"
              >
                {{ BATCH_STEP_REPORT_DEPENDENCY_LABELS[dependency.kind] }} ID {{ dependency.id }}
              </div></template
            >
            <span
              v-else
              class="muted"
              >尚未预览</span
            >
          </template></el-table-column
        >
        <el-table-column
          label="操作"
          width="90"
          ><template #default="{ row }"
            ><el-button
              link
              type="danger"
              :disabled="locked"
              @click="$emit('remove-report', row.reportId)"
              >移除</el-button
            ></template
          ></el-table-column
        >
      </el-table>
    </section>
    <section
      v-if="preview && preview.affectedSteps.length"
      class="notice"
    >
      <div class="section-heading">
        <strong>各工序冲销前后数量</strong><span>包含全部报工记录，已扣除冲销</span>
      </div>
      <el-table
        :data="preview.affectedSteps"
        row-key="stepRecordId"
      >
        <el-table-column
          label="工序 / 状态"
          min-width="170"
          ><template #default="{ row }"
            >{{ row.stepOrder }}. {{ row.stepName }}
            <div>{{ stepStatusLabel(row) }}</div></template
          ></el-table-column
        >
        <el-table-column
          label="直接净报工"
          min-width="170"
          ><template #default="{ row }"
            >{{ formatQuantity(row.before.effectiveDirectReportedQuantity) }} →
            {{ formatQuantity(row.after.effectiveDirectReportedQuantity) }}</template
          ></el-table-column
        >
        <el-table-column
          label="正常累计 / 异常累计"
          min-width="220"
          ><template #default="{ row }"
            >{{ formatQuantity(row.before.effectiveNormalQuantity) }} /
            {{ formatQuantity(row.before.effectiveAbnormalQuantity) }} →
            {{ formatQuantity(row.after.effectiveNormalQuantity) }} /
            {{ formatQuantity(row.after.effectiveAbnormalQuantity) }}</template
          ></el-table-column
        >
        <el-table-column
          label="剩余可报"
          min-width="150"
          ><template #default="{ row }"
            >{{ formatQuantity(row.before.availableReportQuantity) }} →
            {{ formatQuantity(row.after.availableReportQuantity) }}</template
          ></el-table-column
        >
        <el-table-column
          label="与前道正常量之差"
          min-width="175"
          ><template #default="{ row }"
            >{{ formatQuantityDifference(row.before.directReportedVsPreviousNormalDifference) }} →
            {{
              formatQuantityDifference(row.after.directReportedVsPreviousNormalDifference)
            }}</template
          ></el-table-column
        >
      </el-table>
    </section>
    <el-alert
      v-if="stale && intentStatus === 'idle'"
      class="notice"
      title="选择或任务依据已变化，旧预览不能提交，请重新预览。"
      type="warning"
      :closable="false"
      show-icon
    />
    <el-alert
      v-if="preview && !preview.canReverse"
      class="notice"
      title="本批存在阻断项，整体不会写入。请核对具体原因；明确移除记录后须重新预览。"
      type="error"
      :closable="false"
      show-icon
    />
    <el-form
      label-position="top"
      class="notice"
      :disabled="locked"
      ><el-form-item
        label="本次统一冲销原因"
        required
        ><el-input
          v-model="reason"
          type="textarea"
          :rows="3"
          maxlength="5000"
          show-word-limit
          placeholder="说明这些记录需要全量冲销的原因" /></el-form-item
    ></el-form>
    <template #footer
      ><el-button
        :disabled="submitting"
        @click="requestClose"
        >取消</el-button
      ><el-button
        v-if="intentStatus !== 'idle'"
        :disabled="submitting"
        @click="verificationVisible = true"
        >核对报工历史</el-button
      ><el-button
        v-if="intentStatus === 'idle'"
        :disabled="locked || disabled"
        @click="$emit('refresh-selection')"
        >刷新任务依据</el-button
      ><el-button
        :loading="previewLoading"
        :disabled="locked || !selections.length || !record || disabled"
        @click="loadPreview"
        >{{ preview ? '重新预览' : '预览影响' }}</el-button
      ><el-button
        type="danger"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="submit"
        >{{ intentStatus === 'pending' ? '按原请求重试' : '确认整体冲销' }}</el-button
      ></template
    >
  </el-dialog>
  <ProductionReportVerificationDialog
    v-model="verificationVisible"
    :steps="verificationSteps"
    :report-ids="selections.map((item) => item.reportId)"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  BatchReverseStepReportImpact,
  BatchReverseStepReportsPayload,
  BatchReverseStepReportsPreview,
  ProductionExecutionRecordGroup,
} from '@company/contracts';
import { RequestError } from '@company/request';
import { BATCH_STEP_REPORT_DEPENDENCY_LABELS, BATCH_STEP_STATUS_LABELS } from '@company/constants';
import { productionApi } from '../../../api/production';
import InlineHint from '../../../components/InlineHint.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { formatQuantity, formatQuantityDifference } from '../production-status';
import type { SelectedProductionReport } from '../production-report-selection';
import ProductionReportVerificationDialog from './ProductionReportVerificationDialog.vue';

const props = defineProps<{
  modelValue: boolean;
  record: ProductionExecutionRecordGroup | null;
  selections: SelectedProductionReport[];
  disabled: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [open: boolean];
  'remove-report': [id: string];
  'refresh-selection': [];
  changed: [];
  'locked-change': [locked: boolean];
}>();
const preview = ref<BatchReverseStepReportsPreview | null>(null);
const verificationVisible = ref(false);
const submitted = ref<{
  batchId: string;
  batchNo: string;
  body: BatchReverseStepReportsPayload;
} | null>(null);
const verificationSteps = computed(() => {
  const batchId = submitted.value?.batchId ?? props.record?.productionBatchId;
  return batchId
    ? props.selections
        .filter(
          (selection, index, rows) =>
            rows.findIndex((item) => item.stepRecordId === selection.stepRecordId) === index,
        )
        .map((selection) => ({
          productionBatchId: batchId,
          stepRecordId: selection.stepRecordId,
          version: selection.version,
          stepOrder: selection.stepOrder,
          stepName: selection.stepName,
        }))
    : [];
});
const previewLoading = ref(false),
  submitting = ref(false),
  stale = ref(false);
const reason = ref(''),
  errorText = ref('');
const intent = useIdempotentIntent('批量冲销');
const intentStatus = ref<IdempotentIntentStatus>('idle');
const reads = useLatestReadRequest(() => (previewLoading.value = false));
const locked = computed(() => submitting.value || intentStatus.value !== 'idle');
const selectionSignature = computed(() =>
  JSON.stringify(props.selections.map((row) => [row.reportId, row.stepRecordId, row.version])),
);
const previewItem = (id: string) => preview.value?.items.find((item) => item.reportId === id);
const stepStatusLabel = (impact: BatchReverseStepReportImpact): string =>
  BATCH_STEP_STATUS_LABELS[impact.stepStatus];
const canSubmit = computed(
  () =>
    !submitting.value &&
    (intentStatus.value === 'pending'
      ? submitted.value !== null
      : intentStatus.value === 'idle' &&
        !props.disabled &&
        !previewLoading.value &&
        !stale.value &&
        preview.value?.canReverse === true &&
        reason.value.trim().length > 0),
);
watch(locked, (value) => emit('locked-change', value));
watch([selectionSignature, () => props.record], () => {
  if (intentStatus.value === 'idle') {
    reads.invalidate();
    if (preview.value) stale.value = true;
    preview.value = null;
  }
});
watch(
  () => props.modelValue,
  (open) => {
    if (open && intentStatus.value === 'idle') {
      preview.value = null;
      reason.value = '';
      stale.value = false;
      errorText.value = '';
    }
    if (!open) reads.invalidate();
  },
);
const loadPreview = async (): Promise<void> => {
  if (
    !props.record ||
    !props.selections.length ||
    locked.value ||
    props.disabled ||
    !reads.isActive()
  )
    return;
  const batchId = props.record.productionBatchId,
    signature = selectionSignature.value;
  const { isCurrent, signal } = reads.begin(
    () =>
      props.modelValue &&
      props.record?.productionBatchId === batchId &&
      selectionSignature.value === signature,
  );
  previewLoading.value = true;
  preview.value = null;
  errorText.value = '';
  try {
    const result = await productionApi.previewBatchReverseStepReports(
      batchId,
      {
        reports: props.selections.map(({ reportId, stepRecordId, version }) => ({
          reportId,
          stepRecordId,
          version,
        })),
      },
      { skipErrorHandling: true, signal },
    );
    if (!isCurrent()) return;
    if (
      !isPreview(result) ||
      result.productionBatchId !== batchId ||
      result.items.length !== props.selections.length ||
      new Set(result.items.map((item) => item.reportId)).size !== props.selections.length ||
      result.items.some(
        (item) =>
          !props.selections.some(
            (selection) =>
              selection.reportId === item.reportId && selection.stepRecordId === item.stepRecordId,
          ),
      )
    )
      throw new Error('预览返回的记录范围与本次选择不一致，请刷新');
    preview.value = result;
    stale.value = false;
  } catch (error) {
    if (isCurrent()) {
      errorText.value = '预览失败，当前不能提交；请刷新任务并重新预览。';
      EMessage.error(error, errorText.value);
    }
  } finally {
    if (isCurrent()) previewLoading.value = false;
  }
};
const discard = async (): Promise<boolean> => {
  if (!props.modelValue) return true;
  if (submitting.value) return false;
  if (intentStatus.value === 'idle' && !reason.value.trim()) return true;
  try {
    await RouteMessageBox.confirm(
      intentStatus.value !== 'idle'
        ? '本次整体冲销结果尚未确认。请先核对记录；放弃本地原请求后不能保证安全重试。'
        : '本次填写的冲销原因尚未提交，确认放弃？',
      '关闭批量冲销',
      { type: 'warning', confirmButtonText: '确认放弃', cancelButtonText: '继续保留' },
    );
    intent.reset();
    intentStatus.value = 'idle';
    submitted.value = null;
    return true;
  } catch {
    return false;
  }
};
const requestClose = async (): Promise<void> => {
  if (await discard()) emit('update:modelValue', false);
};
const beforeClose = async (done: () => void): Promise<void> => {
  if (await discard()) done();
};
const submit = async (): Promise<void> => {
  if (!canSubmit.value) return;
  let target = submitted.value;
  if (!target) {
    if (!props.record || !preview.value) return;
    target = {
      batchId: props.record.productionBatchId,
      batchNo: props.record.batchNo,
      body: {
        reports: props.selections.map(({ reportId, stepRecordId, version }) => ({
          reportId,
          stepRecordId,
          version,
        })),
        reason: reason.value.trim(),
        previewToken: preview.value.previewToken,
      },
    };
  }
  submitted.value = target;
  submitting.value = true;
  errorText.value = '';
  try {
    const result = await intent.execute(
      {
        intentType: 'production.step-reports.batch-reverse',
        params: { batchId: target.batchId },
        query: {},
        body: target.body,
      },
      async (key) => {
        const response = await productionApi.batchReverseStepReports(
          target.batchId,
          target.body,
          key,
        );
        const reportIds =
          response && Array.isArray(response.reversals)
            ? response.reversals.map((item) => item?.originalReportId)
            : null;
        if (
          !response ||
          response.productionBatchId !== target.batchId ||
          !Array.isArray(reportIds) ||
          reportIds.length !== target.body.reports.length ||
          new Set(reportIds).size !== target.body.reports.length ||
          reportIds.some((id) => !target.body.reports.some((row) => row.reportId === id))
        )
          // 无法确认成功范围时保留原意图，不能清键后另发一次整体操作。
          throw new RequestError('批量成功结果无法核对，请保留原请求并检查报工历史', 0);
        return response;
      },
    );
    EMessage.success(`已整体冲销 ${result.reversals.length} 条报工，原事实已保留`);
    submitted.value = null;
    emit('update:modelValue', false);
    emit('changed');
  } catch (error) {
    errorText.value = '本次未取得整体成功结果；请核对具体记录及其阻断原因。';
    EMessage.error(error, errorText.value);
    if (intent.getStatus() === 'idle') {
      preview.value = null;
      stale.value = true;
      submitted.value = null;
      if (
        error instanceof RequestError &&
        error.details &&
        typeof error.details === 'object' &&
        'preview' in error.details
      ) {
        const currentPreview = error.details.preview;
        if (isPreview(currentPreview) && currentPreview.productionBatchId === target.batchId)
          preview.value = currentPreview;
      }
    }
  } finally {
    intentStatus.value = intent.getStatus();
    submitting.value = false;
  }
};
const isPreview = (value: unknown): value is BatchReverseStepReportsPreview => {
  if (!isObject(value)) return false;
  return (
    typeof value.productionBatchId === 'string' &&
    typeof value.previewToken === 'string' &&
    value.previewToken.length > 0 &&
    typeof value.canReverse === 'boolean' &&
    Array.isArray(value.items) &&
    value.items.every(
      (item) =>
        isObject(item) &&
        typeof item.reportId === 'string' &&
        typeof item.stepRecordId === 'string' &&
        typeof item.canReverse === 'boolean' &&
        (item.blockedReason === null || typeof item.blockedReason === 'string') &&
        Array.isArray(item.dependencies) &&
        item.dependencies.every(
          (dependency) =>
            isObject(dependency) &&
            typeof dependency.id === 'string' &&
            typeof dependency.kind === 'string' &&
            dependency.kind in BATCH_STEP_REPORT_DEPENDENCY_LABELS,
        ),
    ) &&
    Array.isArray(value.affectedSteps) &&
    value.affectedSteps.every(
      (step) =>
        isObject(step) &&
        typeof step.stepRecordId === 'string' &&
        typeof step.stepOrder === 'number' &&
        typeof step.stepName === 'string' &&
        typeof step.stepStatus === 'string' &&
        step.stepStatus in BATCH_STEP_STATUS_LABELS &&
        isQuantityDisplay(step.before) &&
        isQuantityDisplay(step.after),
    )
  );
};
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';
const isQuantityDisplay = (value: unknown): boolean =>
  isObject(value) &&
  typeof value.effectiveDirectReportedQuantity === 'string' &&
  typeof value.effectiveNormalQuantity === 'string' &&
  typeof value.effectiveAbnormalQuantity === 'string' &&
  typeof value.availableReportQuantity === 'string' &&
  (value.directReportedVsPreviousNormalDifference === null ||
    typeof value.directReportedVsPreviousNormalDifference === 'string');
defineExpose({ discard, isLocked: () => locked.value });
</script>

<style scoped>
.notice {
  margin-top: 16px;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 14px;
}
.section-heading span,
.muted {
  color: var(--el-text-color-secondary);
}
small.muted {
  display: block;
  font-size: 12px;
}
.valid-text {
  color: var(--el-color-success);
}
.blocked-text {
  color: var(--el-color-danger);
}
.dependency {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
