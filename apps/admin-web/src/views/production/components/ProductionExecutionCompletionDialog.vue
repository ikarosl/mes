<template>
  <el-dialog
    :model-value="visible"
    title="确认任务执行结束"
    :width="DialogWidth.md"
    :before-close="editor.close"
    :close-on-click-modal="false"
    :show-close="!submitting"
    :close-on-press-escape="!submitting"
  >
    <div v-loading="loading">
      <p v-if="batchLabel">{{ batchLabel }}</p>
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="确认后结束工序执行并进入产出核对。末工序报工数量保留，管理员须登记产出、引用质检记录并提交结案审批；本操作不增加库存。"
      />
      <el-descriptions
        v-if="basis"
        :column="2"
        border
        class="section"
      >
        <el-descriptions-item label="计划数量">{{
          formatQuantity(basis.plannedQuantity)
        }}</el-descriptions-item>
        <el-descriptions-item label="末工序正常报工"
          >{{ basis.finalRequiredStepName }} ·
          {{ formatQuantity(basis.finalEffectiveNormalQuantity) }}</el-descriptions-item
        >
        <el-descriptions-item label="明确完成工序"
          >{{ basis.completedRequiredStepCount }} /
          {{ basis.requiredStepCount }}</el-descriptions-item
        >
        <el-descriptions-item label="当前阶段">{{
          batchStatusMeta(basis.batchStatus).label
        }}</el-descriptions-item>
      </el-descriptions>
      <ul
        v-if="basis?.blockers.length"
        class="section"
      >
        <li
          v-for="blocker in basis.blockers"
          :key="blocker"
        >
          {{ PRODUCTION_EXECUTION_COMPLETION_BLOCKER_LABELS[blocker] }}
        </li>
      </ul>
      <el-alert
        v-if="stale"
        class="section"
        type="warning"
        :closable="false"
        title="任务或产出依据已变化，请重新核对后确认结束。"
      />
      <el-alert
        v-if="unresolved"
        class="section"
        type="warning"
        :closable="false"
        title="执行结束结果尚未确认，原请求与提交标识已保留；请重试原操作或核对任务历史。"
      />
      <el-alert
        v-if="error"
        class="section"
        type="error"
        :closable="false"
        :title="error"
      />
    </div>
    <template #footer>
      <el-button
        :disabled="submitting"
        @click="editor.close()"
        >关闭</el-button
      >
      <el-button
        :disabled="submitting || unresolved"
        @click="editor.reloadBasis"
        >重新核对</el-button
      >
      <el-button
        v-if="unresolved"
        type="primary"
        :loading="submitting"
        :disabled="!canRetry"
        @click="editor.submit"
        >重试原执行结束</el-button
      >
      <el-button
        v-else
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="editor.submit"
        >确认生产执行完工</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  CompleteProductionExecutionPayload,
  ProductionExecutionCompletionCheck,
  ProductionExecutionCompletionResult,
} from '@company/contracts';
import { PRODUCTION_EXECUTION_COMPLETION_BLOCKER_LABELS } from '@company/constants';
import { RequestError } from '@company/request';
import { productionApi } from '../../../api/production';
import { DialogWidth } from '../../../utils/dialog';
import { toBeijingDateTimeInputValue } from '../../../utils/date';
import { useProductionTaskCommand } from '../composables/useProductionTaskCommand';
import { batchStatusMeta, formatQuantity } from '../production-status';

defineOptions({ name: 'ProductionExecutionCompletionDialog' });
const props = defineProps<{ visible: boolean; batchId: string | null; batchLabel?: string }>();
const emit = defineEmits<{ 'update:visible': [boolean]; changed: [batchId: string] }>();
const editor = useProductionTaskCommand<
  ProductionExecutionCompletionCheck,
  CompleteProductionExecutionPayload,
  ProductionExecutionCompletionResult
>(props, {
  label: '任务执行结束',
  intentType: 'production.execution.complete',
  loadCheck: productionApi.getExecutionCompletionCheck,
  validateCheck: (check, batchId) => {
    if (
      !check ||
      check.productionBatchId !== batchId ||
      !Number.isInteger(check.version) ||
      typeof check.canComplete !== 'boolean' ||
      !Array.isArray(check.blockers) ||
      (check.closeoutVersion !== null && !Number.isInteger(check.closeoutVersion))
    )
      throw new Error('执行结束核对响应不完整，请重新核对');
  },
  basisSignature: (check) => `${check.version}:${check.closeoutVersion}:${check.canComplete}`,
  eligible: (check) => check.canComplete,
  requiresReason: () => false,
  buildBody: (check) => ({ version: check.version, closeoutVersion: check.closeoutVersion }),
  send: productionApi.completeProductionExecution,
  validateResult: (result, batchId, body) => {
    if (
      !result ||
      result.productionBatchId !== batchId ||
      !['closing', 'completed'].includes(result.batchStatus) ||
      result.version !== body.version + 1 ||
      !/^[1-9]\d*$/.test(result.closeoutId) ||
      !/^[1-9]\d*$/.test(result.executionCompletedById) ||
      !toBeijingDateTimeInputValue(result.executionCompletedAt) ||
      !/^\d+(\.0+)?$/.test(result.lastStepReportedQuantity)
    )
      throw new RequestError('服务器未返回完整的执行结束结果，请重试原操作以核对结果。', 502);
  },
  successMessage: '任务执行已结束，请核对产出并提交结案审批',
  changed: (batchId) => emit('changed', batchId),
  closed: () => emit('update:visible', false),
});
const { basis, loading, submitting, error, unresolved, stale, canSubmit, canRetry } = editor;
defineExpose({
  close: editor.close,
  navigationLocked: computed(() => submitting.value || unresolved.value),
  submitting,
});
</script>

<style scoped>
.section {
  margin-top: 12px;
}
</style>
