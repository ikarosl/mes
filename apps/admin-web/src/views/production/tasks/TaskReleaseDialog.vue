<template>
  <el-dialog
    :model-value="visible"
    title="下达任务"
    :width="DialogWidth.md"
    :before-close="() => close()"
  >
    <div
      v-loading="loading"
      class="release-content"
    >
      <el-button
        :loading="loading"
        :disabled="submitting || recovery"
        @click="load"
        >刷新核对</el-button
      >
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        show-icon
      />
      <template v-if="detail">
        <el-descriptions
          :column="2"
          border
        >
          <el-descriptions-item label="任务">{{ detail.batchNo }}</el-descriptions-item>
          <el-descriptions-item label="工单">{{ detail.workOrderNo }}</el-descriptions-item>
          <el-descriptions-item
            label="产品"
            :span="2"
            >{{ detail.productCode }} / {{ detail.productName }}</el-descriptions-item
          >
          <el-descriptions-item label="计划数量">{{
            formatQuantity(detail.plannedQuantity)
          }}</el-descriptions-item>
          <el-descriptions-item label="负责人">{{
            detail.ownerName || '未指定'
          }}</el-descriptions-item>
          <el-descriptions-item label="工艺路线"
            >{{ detail.routeCode || '无路线' }}
            {{ detail.routeVersion || '' }}</el-descriptions-item
          >
          <el-descriptions-item label="计划日期"
            >{{ formatDateForDisplay(detail.planStartDate, '未设置') }} 至
            {{ formatDateForDisplay(detail.planEndDate, '未设置') }}</el-descriptions-item
          >
          <el-descriptions-item
            label="备注"
            :span="2"
            >{{ detail.remark || '—' }}</el-descriptions-item
          >
        </el-descriptions>
        <el-alert
          v-if="detail.status !== 'draft' && !recovery"
          title="当前任务已不是草稿，请关闭并刷新任务列表。"
          type="warning"
          :closable="false"
        />
        <InlineHint>
          下达后进入待配料，工艺路线、计划日期和备注固定，计划数量和负责人仍可调整。<template
            v-if="detail.orderType === 'mass_production'"
            >将按选定路线生成工序与 SOP 快照。</template
          >下达后仍须配置物料需求并明确开工。
        </InlineHint>
      </template>
      <SubmissionRecoveryNotice
        :status="status"
        :busy="submitting"
        records-label="生产任务状态"
        :retry-disabled="!reads.isActive()"
        allow-restart
        @retry="submit"
        @restart="restart"
      />
    </div>
    <template #footer>
      <el-button
        :disabled="submitting"
        @click="close"
        >取消</el-button
      >
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit || recovery"
        @click="submit"
        >确认下达</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import type {
  ProductionBatchDetail,
  ProductionBatchItem,
  ReleaseProductionBatchPayload,
} from '@company/contracts';
import InlineHint from '../../../components/InlineHint.vue';
import SubmissionRecoveryNotice from '../../../components/SubmissionRecoveryNotice.vue';
import { productionTasksApi } from '../../../api/production/tasks';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import {
  useIdempotentIntent,
  type IdempotentIntentStatus,
} from '../../../composables/idempotency/useIdempotentIntent';
import { confirmSubmissionClose } from '../../../composables/idempotency/submission-recovery';
import { useTabsStore } from '../../../stores/tabs';
import { formatDateForDisplay } from '../../../utils/date';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { formatQuantity } from '../../../utils/quantity';

const props = defineProps<{ visible: boolean; batch: ProductionBatchItem | null }>();
const emit = defineEmits<{ 'update:visible': [value: boolean]; changed: [batchId: string] }>();
const detail = ref<ProductionBatchDetail | null>(null),
  loading = ref(false),
  error = ref(''),
  submitting = ref(false),
  status = ref<IdempotentIntentStatus>('idle');
const reads = useLatestReadRequest(() => {
  loading.value = false;
});
const intent = useIdempotentIntent('下达任务');
const recovery = computed(() => status.value !== 'idle');
let pendingSubmission: { batchId: string; body: ReleaseProductionBatchPayload } | null = null;
const canSubmit = computed(() => {
  if (submitting.value || status.value === 'blocked' || status.value === 'expired') return false;
  if (recovery.value) return pendingSubmission !== null;
  return Boolean(
    props.visible &&
    detail.value?.id === props.batch?.id &&
    detail.value?.status === 'draft' &&
    !loading.value &&
    !error.value,
  );
});

async function load(): Promise<void> {
  const id = props.batch?.id;
  if (!id || !props.visible || submitting.value || recovery.value || !reads.isActive()) return;
  const read = reads.begin(() => props.visible && props.batch?.id === id);
  loading.value = true;
  error.value = '';
  try {
    const value = await productionTasksApi.getBatch(id, {
      signal: read.signal,
      skipErrorHandling: true,
    });
    if (!read.isCurrent()) return;
    if (value.id !== id) throw new Error('任务下达依据与当前目标不一致，请重新核对');
    detail.value = value;
  } catch (failure) {
    if (read.isCurrent())
      error.value = failure instanceof Error ? failure.message : '任务下达信息读取失败，请刷新重试';
  } finally {
    if (read.isCurrent()) loading.value = false;
  }
}

async function restart(): Promise<void> {
  if (submitting.value) return;
  intent.reset();
  status.value = 'idle';
  pendingSubmission = null;
  await load();
}
watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      reads.invalidate();
      return;
    }
    detail.value = null;
    error.value = '';
    pendingSubmission = null;
    intent.reset();
    status.value = 'idle';
    void load();
  },
);

async function allowClose(): Promise<boolean> {
  if (submitting.value) return false;
  return !props.visible || confirmSubmissionClose(intent.getStatus(), { entityLabel: '下达任务' });
}
async function close(): Promise<void> {
  if (!(await allowClose()) || submitting.value) return;
  reads.invalidate();
  intent.reset();
  status.value = 'idle';
  pendingSubmission = null;
  emit('update:visible', false);
}
async function submit(): Promise<void> {
  if (!canSubmit.value || !reads.isActive()) return;
  const target = detail.value;
  if (!pendingSubmission) {
    if (!target) return;
    pendingSubmission = { batchId: target.id, body: { version: target.version } };
  }
  const submission = pendingSubmission;
  submitting.value = true;
  try {
    await intent.execute(
      {
        intentType: 'production.batch.release',
        params: { batchId: submission.batchId },
        query: {},
        body: submission.body,
      },
      (key) => productionTasksApi.releaseBatch(submission.batchId, submission.body, key),
    );
    EMessage.success('任务已下达，请配置物料需求');
    emit('update:visible', false);
    emit('changed', submission.batchId);
  } catch (failure) {
    EMessage.error(failure, '任务下达失败');
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
.release-content {
  display: grid;
  gap: 16px;
}
</style>
