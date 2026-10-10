<template>
  <el-dialog
    :model-value="visible"
    title="撤回结束"
    :width="DialogWidth.lg"
    :before-close="editor.close"
    :close-on-click-modal="false"
    :show-close="!submitting"
    :close-on-press-escape="!submitting"
  >
    <div v-loading="loading">
      <p v-if="batchLabel">{{ batchLabel }}</p>
      <InlineHint
        >撤回后恢复任务生产阶段；已经发生的领退料、损耗、收尾处理、质检事实与历史记录继续保留。后续产出和质检办理资格会重新核对。</InlineHint
      >
      <el-descriptions
        v-if="basis"
        :column="2"
        border
        class="section"
      >
        <el-descriptions-item label="当前阶段">{{
          batchStatusMeta(basis.batchStatus).label
        }}</el-descriptions-item>
        <el-descriptions-item label="将恢复阶段">{{
          basis.restoreStatus ? batchStatusMeta(basis.restoreStatus).label : '当前不可撤回'
        }}</el-descriptions-item>
      </el-descriptions>
      <el-alert
        v-if="basis?.blockedReason"
        class="section"
        type="warning"
        :closable="false"
        show-icon
        :title="basis.blockedReason"
      />
      <el-form
        label-position="top"
        class="section"
        :disabled="submitting || unresolved"
      >
        <el-form-item
          label="撤回说明"
          required
          ><el-input
            v-model="reason"
            type="textarea"
            :rows="4"
            maxlength="5000"
            show-word-limit
            placeholder="说明为何撤回结束，以及后续补充生产安排"
        /></el-form-item>
      </el-form>
      <el-alert
        v-if="stale"
        type="warning"
        :closable="false"
        show-icon
        title="任务或结案依据已变化，说明已保留；请重新核对后办理。"
      />
      <el-alert
        v-if="unresolved"
        class="section"
        type="warning"
        :closable="false"
        show-icon
        title="撤回结果尚未确认，原请求与提交标识已保留；请重试原操作或核对任务历史。"
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
        >重试原撤回</el-button
      >
      <el-button
        v-else
        type="warning"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="editor.submit"
        >确认撤回结束</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type {
  BatchCloseoutWithdrawalCheck,
  WithdrawBatchCloseoutPayload,
  WithdrawBatchCloseoutResult,
} from '@company/contracts';
import { RequestError } from '@company/request';
import { productionApi } from '../../../api/production';
import InlineHint from '../../../components/InlineHint.vue';
import { DialogWidth } from '../../../utils/dialog';
import { useProductionTaskCommand } from '../composables/useProductionTaskCommand';
import { batchStatusMeta } from '../production-status';

defineOptions({ name: 'ProductionCloseoutWithdrawalDialog' });
const props = defineProps<{ visible: boolean; batchId: string | null; batchLabel?: string }>();
const emit = defineEmits<{ 'update:visible': [boolean]; changed: [batchId: string] }>();
const editor = useProductionTaskCommand<
  BatchCloseoutWithdrawalCheck,
  WithdrawBatchCloseoutPayload,
  WithdrawBatchCloseoutResult
>(props, {
  label: '撤回结束',
  intentType: 'production.closeout.withdraw',
  loadCheck: productionApi.getCloseoutWithdrawalCheck,
  validateCheck: (check, batchId) => {
    if (
      !check ||
      check.batchId !== batchId ||
      !Number.isInteger(check.version) ||
      typeof check.canWithdraw !== 'boolean' ||
      (check.canWithdraw &&
        (!check.closeoutId || !Number.isInteger(check.closeoutVersion) || !check.restoreStatus))
    )
      throw new Error('撤回核对响应不完整，请重新核对');
  },
  basisSignature: (check) =>
    `${check.version}:${check.closeoutVersion}:${check.canWithdraw}:${check.restoreStatus}`,
  eligible: (check) => check.canWithdraw && check.closeoutVersion !== null,
  requiresReason: () => true,
  buildBody: (check, reason) => ({
    version: check.version,
    closeoutVersion: check.closeoutVersion!,
    reason,
  }),
  send: productionApi.withdrawBatchCloseout,
  validateResult: (result, batchId, body) => {
    if (
      !result ||
      result.batchId !== batchId ||
      !/^[1-9]\d*$/.test(result.closeoutId) ||
      !/^[1-9]\d*$/.test(result.entryActionId) ||
      !/^[1-9]\d*$/.test(result.withdrawalActionId) ||
      !Number.isInteger(result.version) ||
      result.version !== body.version + 1 ||
      result.closeoutVersion !== body.closeoutVersion + 1 ||
      ![
        'pending',
        'material_pending',
        'material_assigned',
        'material_partially_outbound',
        'material_outbound',
        'doing',
      ].includes(result.batchStatus)
    )
      throw new RequestError('服务器未返回完整的撤回结果，请重试原操作以核对结果。', 502);
  },
  successMessage: '已撤回结束，任务已恢复到核对后的生产阶段',
  changed: (batchId) => emit('changed', batchId),
  closed: () => emit('update:visible', false),
});
const { basis, reason, loading, submitting, error, unresolved, stale, canSubmit, canRetry } =
  editor;
defineExpose({ close: editor.close, navigationLocked: submitting });
</script>

<style scoped>
.section {
  margin-top: 12px;
}
</style>
