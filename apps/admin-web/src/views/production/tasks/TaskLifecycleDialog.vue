<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    :width="DialogWidth.md"
    :before-close="beforeClose"
    @update:model-value="close"
  >
    <div
      v-loading="loading"
      class="lifecycle-content"
    >
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        show-icon
        :closable="false"
      />
      <el-button
        :loading="loading"
        :disabled="submitting || recovery"
        @click="load"
        >刷新核对</el-button
      >
      <template v-if="context">
        <el-descriptions
          :column="2"
          border
        >
          <el-descriptions-item label="任务">{{ context.batch.batchNo }}</el-descriptions-item>
          <el-descriptions-item label="产品">{{ context.batch.productName }}</el-descriptions-item>
          <el-descriptions-item label="计划数量">{{
            formatQuantity(context.batch.plannedQuantity)
          }}</el-descriptions-item>
          <el-descriptions-item label="终检产出"
            ><BatchApprovedOutput :output="context.batch.finalOutput"
          /></el-descriptions-item>
          <el-descriptions-item label="已入库">{{
            formatQuantity(context.batch.finalOutput.inboundQuantity)
          }}</el-descriptions-item>
          <el-descriptions-item label="待入库">{{
            formatQuantity(context.batch.finalOutput.pendingInboundQuantity)
          }}</el-descriptions-item>
          <template v-if="mode === 'finish'">
            <el-descriptions-item label="未完追踪卡">{{ unfinishedCards }} 盘</el-descriptions-item>
            <el-descriptions-item label="待处理异常"
              >{{ context.summary.openAbnormalityCount }} 条</el-descriptions-item
            >
          </template>
          <el-descriptions-item
            v-if="mode === 'reopen' && workOrderStatus"
            label="工单状态"
            :span="2"
            >{{ orderStatusMeta(workOrderStatus).label }}</el-descriptions-item
          >
        </el-descriptions>
        <InlineHint v-if="mode === 'finish'">
          结束任务将关闭剩余需求、释放未出库预留并取消待出库单，保留已确认产出与库存。计划数量只用于参考，短产或零产均可结束；待入库产出可在结束后继续入库。
        </InlineHint>
        <InlineHint v-else-if="mode === 'start'"
          >确认开始后，可继续办理物料和生产追踪；实际领料仍须通过出库单确认。</InlineHint
        >
        <InlineHint v-else-if="mode === 'reopen'"
          >工单仍在进行时可重新打开任务，恢复未完追踪卡办理。此前已关闭的物料需求、已释放的预留和已取消的出库单保持原处理结果；后续用料须重新登记需求。</InlineHint
        >
        <InlineHint v-else
          >每次据实登记研发可用产出，允许多次登记及明确的零产出。确认只形成产出记录，正数产出后续通过“产出与成品入库”办理。</InlineHint
        >
        <template v-if="mode === 'start' && startCheck">
          <el-alert
            v-if="!startCheck.canStart"
            :title="startCheck.blockedReason || '当前任务不能开工，请先核对物料配置和工单状态'"
            type="warning"
            :closable="false"
            show-icon
          />
          <InlineHint v-else-if="startCheck.requiresReason"
            >当前仍有物料未领足，开工前须填写开工说明。已领数量以确认的出库记录为准。</InlineHint
          >
          <el-table
            v-if="startCheck.hasMaterialShortage"
            :data="startCheck.lines"
            row-key="demandId"
          >
            <el-table-column
              label="物料 / 版本"
              min-width="170"
              ><template #default="{ row }"
                >{{ row.itemCode }} / {{ row.materialVariantCode }}</template
              ></el-table-column
            >
            <el-table-column
              label="需求"
              width="90"
              align="right"
              ><template #default="{ row }"
                >{{ formatQuantity(row.demandQuantity) }} {{ row.unit }}</template
              ></el-table-column
            >
            <el-table-column
              label="已领"
              width="90"
              align="right"
              ><template #default="{ row }">{{
                formatQuantity(row.confirmedOutboundQuantity)
              }}</template></el-table-column
            >
            <el-table-column
              label="未领"
              width="90"
              align="right"
              ><template #default="{ row }">{{
                formatQuantity(row.remainingQuantity)
              }}</template></el-table-column
            >
          </el-table>
        </template>
        <SubmissionRecoveryNotice
          v-if="recovery"
          :status="status"
          :busy="submitting"
          records-label="任务状态与产出"
          :retry-disabled="!reads.isActive()"
          allow-restart
          @retry="submit"
          @restart="restartSubmission"
        />
        <el-form
          label-width="100px"
          :disabled="submitting || recovery"
          class="lifecycle-form"
        >
          <template v-if="mode === 'finish'">
            <el-form-item
              label="结束方式"
              required
              ><el-radio-group v-model="finishMode"
                ><el-radio
                  value="normal"
                  :disabled="context.batch.status !== 'doing'"
                  >{{ PRODUCTION_TASK_FINISH_MODE_LABELS.normal }}</el-radio
                ><el-radio value="early">{{
                  PRODUCTION_TASK_FINISH_MODE_LABELS.early
                }}</el-radio></el-radio-group
              ></el-form-item
            >
            <el-alert
              v-if="finishMode === 'normal' && normalFinishBlocked"
              title="普通结束须先完成或处理全部未完追踪卡及待处理异常；也可选择提前结束，保留未完现场。"
              type="warning"
              :closable="false"
              show-icon
            />
            <InlineHint v-else-if="finishMode === 'early'"
              >提前结束保留未完追踪卡和异常记录并暂停办理。以后重新打开任务可继续处理。</InlineHint
            >
          </template>
          <template v-if="mode === 'research-output'">
            <el-form-item
              label="确认人员"
              required
              ><div class="personnel-picker">
                <el-select
                  v-model="personnelId"
                  filterable
                  :loading="personnelLoading"
                  ><el-option
                    v-for="person in personnel"
                    :key="person.id"
                    :label="`${person.code} / ${person.name}`"
                    :value="person.id" /></el-select
                ><el-button @click="loadPersonnel">刷新人员</el-button>
              </div></el-form-item
            >
            <el-form-item
              label="本次可用产出"
              required
              ><el-input-number
                v-model="quantity"
                :min="0"
                :precision="0"
                placeholder="据实填写，允许0"
            /></el-form-item>
          </template>
          <el-form-item
            :label="reasonLabel"
            :required="
              mode === 'finish' ||
              mode === 'reopen' ||
              (mode === 'start' && startCheck?.requiresReason)
            "
            ><el-input
              v-model="reason"
              type="textarea"
              :rows="3"
              maxlength="1000"
          /></el-form-item>
        </el-form>
        <el-alert
          v-if="mode === 'reopen' && !canReopenParent"
          title="工单已结束或不在可生产状态，当前不能重新打开任务。"
          type="warning"
          :closable="false"
          show-icon
        />
      </template>
    </div>
    <template #footer
      ><el-button
        :disabled="submitting"
        @click="close(false)"
        >取消</el-button
      ><el-button
        :type="mode === 'finish' ? 'warning' : 'primary'"
        :loading="submitting"
        :disabled="recovery || !canSubmit"
        @click="submit"
        >{{ title }}</el-button
      ></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
import SubmissionRecoveryNotice from '../../../components/SubmissionRecoveryNotice.vue';
import { computed, onScopeDispose, ref, watch } from 'vue';
import { PRODUCTION_TASK_FINISH_MODE_LABELS } from '@company/constants';
import type {
  ConfirmProductionResearchOutputPayload,
  FinishProductionTrackingTaskPayload,
  PersonnelOption,
  ProductionBatchItem,
  ProductionExecutionStartCheck,
  ProductionTaskFinishMode,
  ProductionTrackingWorkbench,
  WorkOrderStatus,
} from '@company/contracts';
import { personnelApi } from '../../../api/personnel';
import { productionTrackingApi } from '../../../api/production/tracking';
import InlineHint from '../../../components/InlineHint.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { useTabsStore } from '../../../stores/tabs';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { formatQuantity } from '../../../utils/quantity';
import BatchApprovedOutput from '../shared/BatchApprovedOutput.vue';
import { orderStatusMeta } from '../shared/production-status';

export type TaskLifecycleMode = 'start' | 'finish' | 'reopen' | 'research-output';
const props = defineProps<{
  visible: boolean;
  batch: ProductionBatchItem | null;
  mode: TaskLifecycleMode;
  initialFinishMode?: ProductionTaskFinishMode;
}>();
const emit = defineEmits<{ 'update:visible': [value: boolean]; changed: [batchId: string] }>();
const title = computed(() => {
  if (props.mode === 'start') return '确认任务开工';
  if (props.mode === 'finish') return '确认结束任务';
  if (props.mode === 'reopen') return '重新打开任务';
  return '登记研发实际产出';
});
const reasonLabel = computed(() => {
  if (props.mode === 'finish') return '结束原因';
  if (props.mode === 'reopen') return '重新打开原因';
  if (props.mode === 'start') return '开工说明';
  return '备注';
});
const context = ref<ProductionTrackingWorkbench | null>(null),
  workOrderStatus = ref<WorkOrderStatus | null>(null),
  loading = ref(false),
  error = ref(''),
  submitting = ref(false),
  reason = ref(''),
  quantity = ref<number | undefined>(undefined),
  finishMode = ref<ProductionTaskFinishMode>('normal'),
  personnelId = ref(''),
  personnel = ref<PersonnelOption[]>([]),
  personnelLoading = ref(false);
const reads = useLatestReadRequest(() => {
    loading.value = false;
  }),
  personnelReads = useLatestReadRequest(() => {
    personnelLoading.value = false;
  });
const intent = useIdempotentIntent('任务办理'),
  status = ref<IdempotentIntentStatus>('idle'),
  recovery = computed(() => status.value !== 'idle');
const startCheck = ref<ProductionExecutionStartCheck | null>(null);
type Submission =
  | { mode: 'start' | 'reopen'; batchId: string; body: { version: number; reason: string } }
  | { mode: 'finish'; batchId: string; body: FinishProductionTrackingTaskPayload }
  | { mode: 'research-output'; batchId: string; body: ConfirmProductionResearchOutputPayload };
let pendingSubmission: Submission | null = null;
function restartSubmission(): void {
  if (submitting.value) return;
  intent.reset();
  status.value = 'idle';
  pendingSubmission = null;
}
let closeApproved = false;
const unfinishedCards = computed(
  () =>
    (context.value?.summary.unusedCardCount ?? 0) +
    (context.value?.summary.inProgressCardCount ?? 0),
);
const normalFinishBlocked = computed(
  () => unfinishedCards.value > 0 || (context.value?.summary.openAbnormalityCount ?? 0) > 0,
);
const canReopenParent = computed(
  () => workOrderStatus.value === 'released' || workOrderStatus.value === 'doing',
);
const canSubmit = computed(() => {
  if (submitting.value || status.value === 'blocked' || status.value === 'expired') return false;
  if (recovery.value) return true;
  if (loading.value || error.value || !context.value) return false;
  if (props.mode === 'start') return startCheck.value?.canStart === true;
  if (props.mode === 'reopen') return canReopenParent.value;
  return (
    props.mode !== 'finish' ||
    finishMode.value !== 'normal' ||
    (context.value.batch.status === 'doing' && !normalFinishBlocked.value)
  );
});
async function load(): Promise<void> {
  const batch = props.batch;
  if (!batch || !props.visible || !reads.isActive()) return;
  const read = reads.begin(() => props.visible && props.batch?.id === batch.id);
  loading.value = true;
  error.value = '';
  try {
    const [value, check] = await Promise.all([
      productionTrackingApi.workbench(batch.id, { signal: read.signal, skipErrorHandling: true }),
      props.mode === 'start'
        ? productionTrackingApi.startCheck(batch.id, {
            signal: read.signal,
            skipErrorHandling: true,
          })
        : Promise.resolve(null),
    ]);
    if (!read.isCurrent()) return;
    if (check && (check.productionBatchId !== batch.id || check.version !== value.batch.version))
      throw new Error('任务状态已更新，请重新核对开工依据');
    context.value = value;
    workOrderStatus.value = value.workOrderStatus;
    startCheck.value = check;
  } catch (failure) {
    if (read.isCurrent())
      error.value = failure instanceof Error ? failure.message : '任务核对信息加载失败';
  } finally {
    if (read.isCurrent()) loading.value = false;
  }
}
async function loadPersonnel(): Promise<void> {
  if (!props.visible || !personnelReads.isActive()) return;
  const read = personnelReads.begin(() => props.visible);
  personnelLoading.value = true;
  try {
    const value = await personnelApi.options({ signal: read.signal });
    if (read.isCurrent()) personnel.value = value;
  } catch (failure) {
    if (read.isCurrent()) EMessage.error(failure, '确认人员加载失败');
  } finally {
    if (read.isCurrent()) personnelLoading.value = false;
  }
}
watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      reads.invalidate();
      personnelReads.invalidate();
      return;
    }
    context.value = null;
    workOrderStatus.value = null;
    startCheck.value = null;
    reason.value = '';
    quantity.value = undefined;
    personnelId.value = '';
    finishMode.value = props.initialFinishMode ?? 'normal';
    pendingSubmission = null;
    intent.reset();
    status.value = 'idle';
    void load();
    if (props.mode === 'research-output') void loadPersonnel();
  },
);
async function allowClose(): Promise<boolean> {
  if (submitting.value) return false;
  if (
    !props.visible ||
    (!recovery.value && !reason.value && quantity.value === undefined && !personnelId.value)
  )
    return true;
  try {
    await RouteMessageBox.confirm(
      recovery.value
        ? '提交结果尚未确认，请先核对任务状态与产出。放弃后将不能重试本次提交，确认放弃？'
        : '本次填写尚未保存，确认放弃？',
      '关闭确认',
      { type: 'warning' },
    );
    intent.reset();
    status.value = 'idle';
    return true;
  } catch {
    return false;
  }
}
async function close(value: boolean): Promise<void> {
  if (!value && closeApproved) {
    closeApproved = false;
    emit('update:visible', false);
    return;
  }
  if (!value && (await allowClose())) emit('update:visible', false);
}
async function beforeClose(done: () => void): Promise<void> {
  if (await allowClose()) {
    closeApproved = true;
    done();
  }
}
function prepareSubmission(): Submission | null {
  const batch = context.value?.batch;
  if (!batch) return null;
  const text = reason.value.trim();
  if (props.mode === 'start' && startCheck.value?.requiresReason && !text) {
    EMessage.warning('物料尚未领足，请填写开工说明');
    return null;
  }
  if ((props.mode === 'finish' || props.mode === 'reopen') && !text) {
    EMessage.warning(`请填写${reasonLabel.value}`);
    return null;
  }
  if (props.mode === 'research-output') {
    if (!personnelId.value) {
      EMessage.warning('请选择确认人员');
      return null;
    }
    if (
      quantity.value === undefined ||
      !Number.isSafeInteger(quantity.value) ||
      quantity.value < 0
    ) {
      EMessage.warning('请据实填写本次可用产出，允许填0');
      return null;
    }
    return {
      mode: props.mode,
      batchId: batch.id,
      body: {
        version: batch.version,
        personnelId: personnelId.value,
        availableQuantity: quantity.value,
        remark: text || null,
      },
    };
  }
  if (props.mode === 'finish')
    return {
      mode: 'finish',
      batchId: batch.id,
      body: { version: batch.version, mode: finishMode.value, reason: text },
    };
  return { mode: props.mode, batchId: batch.id, body: { version: batch.version, reason: text } };
}
async function submit(): Promise<void> {
  if (!canSubmit.value || !reads.isActive()) return;
  const submission = pendingSubmission ?? prepareSubmission();
  if (!submission) return;
  pendingSubmission = submission;
  submitting.value = true;
  try {
    await intent.execute(
      {
        intentType: `production.task.${submission.mode}`,
        params: { batchId: submission.batchId },
        query: {},
        body: submission.body,
      },
      async (key): Promise<void> => {
        if (submission.mode === 'start')
          await productionTrackingApi.start(submission.batchId, submission.body, key);
        else if (submission.mode === 'reopen')
          await productionTrackingApi.reopen(submission.batchId, submission.body, key);
        else if (submission.mode === 'finish')
          await productionTrackingApi.finish(submission.batchId, submission.body, key);
        else if (submission.mode === 'research-output')
          await productionTrackingApi.confirmResearchOutput(
            submission.batchId,
            submission.body,
            key,
          );
      },
    );
    EMessage.success(`${title.value}已完成`);
    emit('update:visible', false);
    emit('changed', submission.batchId);
  } catch (failure) {
    EMessage.error(failure, `${title.value}失败`);
  } finally {
    status.value = intent.getStatus();
    if (status.value === 'idle') pendingSubmission = null;
    submitting.value = false;
  }
}
const unregister = useTabsStore().registerCloseGuard('production-tasks', allowClose);
onScopeDispose(unregister);
</script>
<style scoped>
.lifecycle-content {
  display: grid;
  gap: 16px;
}
.personnel-picker {
  display: flex;
  gap: 8px;
  width: 100%;
}
.personnel-picker .el-select {
  flex: 1;
}
.lifecycle-form .el-alert,
.lifecycle-form :deep(.inline-hint) {
  margin-bottom: 16px;
}
</style>
