<template>
  <el-dialog
    :model-value="editor.visible"
    title="完成整笔返工"
    :width="DialogWidth.md"
    :before-close="editor.beforeClose"
    :close-on-click-modal="false"
    :show-close="!editor.submitting"
    :close-on-press-escape="!editor.submitting"
    @update:model-value="(open: boolean) => !open && editor.close()"
  >
    <template v-if="editor.selected">
      <el-descriptions
        :column="2"
        border
      >
        <el-descriptions-item label="返工单">{{ editor.selected.reworkNo }}</el-descriptions-item>
        <el-descriptions-item label="任务 / 工序"
          >{{ editor.batchNo }} / {{ editor.stepName }}</el-descriptions-item
        >
        <el-descriptions-item label="必须整笔完成"
          >{{ formatQuantity(editor.selected.reworkQuantity) }}
          {{ editor.selected.unit }}</el-descriptions-item
        >
        <el-descriptions-item label="来源工序负责人（批准时）">{{
          editor.selected.responsibleUserName || editor.selected.responsibleUserId
        }}</el-descriptions-item>
      </el-descriptions>
      <el-alert
        v-if="editor.stale && editor.intentStatus === 'idle'"
        class="notice"
        type="warning"
        :closable="false"
        show-icon
        :title="editor.staleReason"
      />
      <el-alert
        v-if="editor.intentStatus !== 'idle'"
        class="notice"
        type="warning"
        :closable="false"
        show-icon
        :title="
          editor.intentStatus === 'pending'
            ? '上次完成结果尚未确认，已保留首次完整请求；仅可按原数量、备注和版本重试。'
            : '原请求已不能安全重试，请先核对来源与处理过程，再明确放弃本次请求。'
        "
      />
      <el-form
        label-position="top"
        class="notice"
        :disabled="editor.inputsLocked"
      >
        <el-form-item
          :label="`${BATCH_STEP_REWORK_RESULT_LABELS.normal}数量`"
          required
        >
          <el-input-number
            :model-value="editor.form.normalQuantity"
            :aria-label="`${BATCH_STEP_REWORK_RESULT_LABELS.normal}数量`"
            :min="0"
            :max="Number(editor.selected.reworkQuantity)"
            :precision="0"
            :step="1"
            @update:model-value="editor.setNormalQuantity"
          />
        </el-form-item>
        <el-form-item
          :label="`${BATCH_STEP_REWORK_RESULT_LABELS.abnormal}数量`"
          required
        >
          <el-input-number
            :model-value="editor.form.abnormalQuantity"
            :aria-label="`${BATCH_STEP_REWORK_RESULT_LABELS.abnormal}数量`"
            :min="0"
            :max="Number(editor.selected.reworkQuantity)"
            :precision="0"
            :step="1"
            @update:model-value="editor.setAbnormalQuantity"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            :model-value="editor.form.remark"
            aria-label="返工完成备注"
            type="textarea"
            :rows="3"
            maxlength="5000"
            show-word-limit
            @update:model-value="editor.setRemark"
          />
        </el-form-item>
      </el-form>
      <InlineHint
        >{{ BATCH_STEP_REWORK_RESULT_LABELS.normal }}与{{
          BATCH_STEP_REWORK_RESULT_LABELS.abnormal
        }}合计必须等于原整笔返工数量；有量的两类结果分别生成报工事实，保留同一返工来源，不新增普通报工额度。</InlineHint
      >
    </template>
    <template #footer>
      <el-button
        v-if="editor.selected"
        link
        type="primary"
        :disabled="editor.submitting"
        @click="$emit('view-report', reworkSourceReference(editor.selected))"
        >核对来源与处理过程</el-button
      >
      <el-button
        :disabled="editor.submitting"
        @click="editor.close"
        >取消</el-button
      >
      <el-button
        type="primary"
        :loading="editor.submitting"
        :disabled="!editor.canSubmit"
        @click="editor.submit"
        >{{ editor.intentStatus === 'pending' ? '按原请求重试' : '确认完成返工' }}</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { BATCH_STEP_REWORK_RESULT_LABELS } from '@company/constants';
import type { BatchStepReportReference } from '@company/contracts';
import InlineHint from '../../../components/InlineHint.vue';
import { DialogWidth } from '../../../utils/dialog';
import type { useProductionReworkCompletion } from '../composables/useProductionReworkCompletion';
import { reworkSourceReference } from '../production-report-presentation';
import { formatQuantity } from '../production-status';

defineProps<{ editor: ReturnType<typeof useProductionReworkCompletion> }>();
defineEmits<{ 'view-report': [report: BatchStepReportReference] }>();
</script>

<style scoped>
.notice {
  margin-top: 12px;
}
</style>
