<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    :width="DialogWidth.md"
    :before-close="beforeClose"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div v-loading="loading">
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        show-icon
        :closable="false"
      /><el-button
        v-if="error"
        @click="load"
        >重试核对</el-button
      >
      <template v-if="context">
        <el-descriptions
          :column="2"
          border
          ><el-descriptions-item label="任务">{{ context.batch.batchNo }}</el-descriptions-item
          ><el-descriptions-item label="产品">{{ context.batch.productName }}</el-descriptions-item
          ><el-descriptions-item label="计划数量">{{
            formatQuantity(context.batch.plannedQuantity)
          }}</el-descriptions-item
          ><el-descriptions-item label="实际最终产出">{{
            formatQuantity(context.summary.availableQuantity)
          }}</el-descriptions-item></el-descriptions
        >
        <InlineHint v-if="mode === 'finish'"
          >结束任务将关闭剩余需求、释放未出库预留、取消未领料单并作废未完追踪卡（当前
          <strong>{{
            context.summary.unusedCardCount + context.summary.inProgressCardCount
          }}</strong>
          盘）。保留已确认产出和库存，允许短产或零产结束。</InlineHint
        >
        <InlineHint v-else-if="mode === 'start'"
          >确认开始后，可继续办理物料和生产追踪；实际领料仍须通过出库单确认。</InlineHint
        >
        <InlineHint v-else
          >研发产出由质检人员一次确认。0
          产出不入库，正数与本次确认同时入库；确认后可人工结束任务。</InlineHint
        >
        <el-alert
          v-if="recovery"
          :title="submissionRecoveryMessage(status, '任务状态与产出')"
          type="warning"
          show-icon
          :closable="false"
        />
        <el-form
          label-width="100px"
          :disabled="submitting || recovery"
          class="lifecycle-form"
        >
          <template v-if="mode === 'research-output'"
            ><el-form-item
              label="质检登记人"
              required
              ><el-select
                v-model="personnelId"
                filterable
                :loading="personnelLoading"
                ><el-option
                  v-for="person in personnel"
                  :key="person.id"
                  :label="`${person.code} / ${person.name}`"
                  :value="person.id" /></el-select
              ><el-button @click="loadPersonnel">刷新人员</el-button></el-form-item
            ><el-form-item
              label="可用产出"
              required
              ><el-input-number
                v-model="quantity"
                :min="0"
                :precision="0" /></el-form-item
          ></template>
          <el-form-item
            :label="mode === 'finish' ? '结束原因' : '备注'"
            :required="mode === 'finish'"
            ><el-input
              v-model="reason"
              type="textarea"
              :rows="3"
              maxlength="1000"
          /></el-form-item>
        </el-form>
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
        :disabled="loading || !context || status === 'blocked' || status === 'expired'"
        @click="submit"
        >{{ recovery ? '重试本次提交' : title }}</el-button
      ></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import type {
  PersonnelOption,
  ProductionBatchItem,
  ProductionTrackingWorkbench,
} from '@company/contracts';
import { personnelApi } from '../../../api/personnel';
import { productionTrackingApi } from '../../../api/production/tracking';
import InlineHint from '../../../components/InlineHint.vue';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import {
  useIdempotentIntent,
  submissionRecoveryMessage,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { useTabsStore } from '../../../stores/tabs';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { formatQuantity } from '../../../utils/quantity';
export type TaskLifecycleMode = 'start' | 'finish' | 'research-output';
const props = defineProps<{
  visible: boolean;
  batch: ProductionBatchItem | null;
  mode: TaskLifecycleMode;
}>();
const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'changed', batchId: string): void;
}>();
const title = computed(
  () =>
    ({ start: '确认任务开工', finish: '确认结束任务', 'research-output': '确认研发实际产出' })[
      props.mode
    ],
);
const context = ref<ProductionTrackingWorkbench | null>(null),
  loading = ref(false),
  error = ref(''),
  submitting = ref(false),
  reason = ref(''),
  quantity = ref<number | undefined>(undefined),
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
async function load(): Promise<void> {
  const id = props.batch?.id;
  if (!id || !props.visible || !reads.isActive()) return;
  const read = reads.begin(() => props.visible && props.batch?.id === id);
  loading.value = true;
  error.value = '';
  try {
    const value = await productionTrackingApi.workbench(id, {
      signal: read.signal,
      skipErrorHandling: true,
    });
    if (read.isCurrent()) context.value = value;
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
    const value = await personnelApi.options('quality', { signal: read.signal });
    if (read.isCurrent()) personnel.value = value;
  } catch (failure) {
    if (read.isCurrent()) EMessage.error(failure, '质检登记人加载失败');
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
    reason.value = '';
    quantity.value = undefined;
    personnelId.value = '';
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
        ? '提交结果尚未确认，请先核对任务状态与产出。确认放弃本次提交？'
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
async function close(visible: boolean): Promise<void> {
  if (!visible && (await allowClose())) emit('update:visible', false);
}
async function beforeClose(done: () => void): Promise<void> {
  if (await allowClose()) done();
}
async function submit(): Promise<void> {
  const batch = context.value?.batch;
  if (!batch || submitting.value || !reads.isActive()) return;
  if (props.mode === 'finish' && !reason.value.trim()) {
    EMessage.warning('请填写结束原因');
    return;
  }
  if (props.mode === 'research-output' && !personnelId.value) {
    EMessage.warning('请选择质检登记人');
    return;
  }
  if (
    props.mode === 'research-output' &&
    (quantity.value === undefined || !Number.isSafeInteger(quantity.value) || quantity.value < 0)
  ) {
    EMessage.warning('请据实填写可用产出，允许填0');
    return;
  }
  const body = {
    version: batch.version,
    reason: reason.value.trim(),
    personnelId: personnelId.value,
    availableQuantity: quantity.value ?? 0,
  };
  const mode = props.mode;
  submitting.value = true;
  try {
    await intent.execute(
      { intentType: `production.task.${mode}`, params: { batchId: batch.id }, query: {}, body },
      (key) => {
        if (mode === 'start')
          return productionTrackingApi.start(
            batch.id,
            { version: body.version, reason: body.reason || undefined },
            key,
          );
        if (mode === 'finish')
          return productionTrackingApi.finish(
            batch.id,
            { version: body.version, reason: body.reason },
            key,
          );
        return productionTrackingApi.confirmResearchOutput(
          batch.id,
          {
            version: body.version,
            personnelId: body.personnelId,
            availableQuantity: body.availableQuantity,
            remark: body.reason || null,
          },
          key,
        );
      },
    );
    EMessage.success(`${title.value}已完成`);
    emit('update:visible', false);
    emit('changed', batch.id);
  } catch (failure) {
    EMessage.error(failure, `${title.value}失败`);
  } finally {
    status.value = intent.getStatus();
    submitting.value = false;
  }
}
const unregister = useTabsStore().registerCloseGuard('production-tasks', allowClose);
onScopeDispose(unregister);
</script>
<style scoped>
.lifecycle-form {
  margin-top: 20px;
}
.lifecycle-form .el-button {
  margin-left: 8px;
}
</style>
