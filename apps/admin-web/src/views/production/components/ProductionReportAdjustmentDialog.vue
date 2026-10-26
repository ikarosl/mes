<template>
  <el-dialog
    :model-value="editor.visible"
    :title="editor.mode === 'correct' ? '更正正常报工数量' : '全量冲销正常报工'"
    :width="DialogWidth.md"
    :before-close="editor.beforeClose"
    :close-on-click-modal="false"
    :close-on-press-escape="!editor.submitting"
    :show-close="!editor.submitting"
    @update:model-value="(open: boolean) => !open && editor.close()"
  >
    <template v-if="editor.step && editor.report">
      <el-descriptions
        :column="2"
        border
      >
        <el-descriptions-item label="工序">
          {{ editor.step.stepOrder }}. {{ editor.step.stepName }}
        </el-descriptions-item>
        <el-descriptions-item label="报工单号">{{ editor.report.reportNo }}</el-descriptions-item>
        <el-descriptions-item label="本条报工原数量">
          <strong>{{ formatQuantity(editor.report.normalQuantity) }}</strong>
          {{ editor.report.unit }}
        </el-descriptions-item>
        <el-descriptions-item label="实际录入人">
          {{ editor.report.createdByName || '未提供姓名' }}
        </el-descriptions-item>
      </el-descriptions>
      <ProductionQuotaBasis
        class="editor-note"
        :quota="editor.step"
        :planned-quantity="editor.step.baseNormalQuantity"
        :show-reopen-hint="false"
      />
      <InlineHint class="editor-note">
        <template v-if="editor.mode === 'correct'">
          填写本条报工实际应保留的数量。例如，原报工 40 {{ editor.report.unit }}，实际应为 30
          {{ editor.report.unit }}，就填写 30。
        </template>
        <template v-else>
          将全量冲销本条报工的 <strong>{{ formatQuantity(editor.report.normalQuantity) }}</strong>
          {{ editor.report.unit }}。
        </template>
      </InlineHint>
      <p class="adjustment-note">
        原记录和{{ editor.mode === 'correct' ? '更正' : '冲销' }}原因保留供查阅。
        数量调整不改变工序状态。
      </p>
      <el-alert
        v-if="editor.historical"
        class="editor-note"
        title="当前办理历史纠错：仅限无具体依赖的普通正常报工，不改变批准清单、质检、库存或员工执行资格。"
        type="warning"
        :closable="false"
        show-icon
      />
      <el-alert
        v-if="editor.stale && editor.intentStatus === 'idle'"
        class="editor-note"
        title="任务或工序依据已变化，当前草稿已保留；请关闭后从最新记录重新办理。"
        type="warning"
        :closable="false"
        show-icon
      />
      <el-alert
        v-if="editor.intentStatus !== 'idle' || editor.unknownReverse"
        class="editor-note"
        :title="unconfirmedNote"
        type="warning"
        :closable="false"
        show-icon
      />
      <el-form
        label-position="top"
        class="editor-form"
        :disabled="editor.inputsLocked"
        @submit.prevent="editor.submit"
      >
        <el-form-item
          v-if="editor.mode === 'correct'"
          label="本条报工更正后数量"
          :error="editor.quantityTouched ? (editor.quantityValidation.error ?? '') : ''"
          required
        >
          <el-input
            :model-value="editor.form.normalQuantity"
            inputmode="numeric"
            placeholder="请输入本条报工实际应保留的数量"
            aria-label="本条报工更正后数量"
            @update:model-value="editor.setNormalQuantity"
            @blur="editor.touchQuantity"
          />
          <div class="quantity-limit">
            本条报工最多可填 <strong>{{ previewQuantity(editor.maximumQuantity) }}</strong>
            {{ editor.report.unit }}
          </div>
          <div
            v-if="quantityImpact"
            class="quantity-impact"
          >
            更正后：{{ quantityImpact }}
          </div>
          <el-button
            v-if="editor.quantityValidation.quantity === 0"
            class="reverse-entry"
            link
            type="danger"
            :disabled="!editor.canSwitchToReverse"
            @click="editor.switchToReverse"
            >改为全量冲销</el-button
          >
        </el-form-item>
        <div
          v-if="editor.mode === 'reverse' && quantityImpact"
          class="quantity-impact reverse-impact"
        >
          冲销后：{{ quantityImpact }}
        </div>
        <el-form-item
          :label="editor.mode === 'correct' ? '更正原因' : '冲销原因'"
          required
        >
          <el-input
            :model-value="editor.form.reason"
            type="textarea"
            :rows="3"
            maxlength="5000"
            show-word-limit
            @update:model-value="editor.setReason"
          />
        </el-form-item>
      </el-form>
    </template>
    <template #footer>
      <el-button
        v-if="editor.intentStatus !== 'idle' || editor.unknownReverse"
        :disabled="editor.submitting"
        @click="verificationVisible = true"
        >核对报工历史</el-button
      >
      <el-button
        :disabled="editor.submitting"
        @click="editor.close"
        >取消</el-button
      >
      <el-button
        :type="editor.mode === 'reverse' ? 'danger' : 'primary'"
        :loading="editor.submitting"
        :disabled="!editor.canSubmit"
        @click="editor.submit"
        >{{ submitLabel }}</el-button
      >
    </template>
  </el-dialog>
  <ProductionReportVerificationDialog
    v-model="verificationVisible"
    :steps="editor.step ? [editor.step] : []"
    :report-ids="editor.report ? [editor.report.reportId] : []"
  />
</template>

<script setup lang="ts">
import { submissionRecoveryMessage } from '../../../composables/idempotency/useIdempotentIntent';
import { computed, ref, watch } from 'vue';
import type { ProductionReportAdjustmentEditor } from '../composables/useProductionReportAdjustment';
import InlineHint from '../../../components/InlineHint.vue';
import { DialogWidth } from '../../../utils/dialog';
import { formatQuantity } from '../production-status';
import ProductionQuotaBasis from './ProductionQuotaBasis.vue';
import ProductionReportVerificationDialog from './ProductionReportVerificationDialog.vue';

const props = defineProps<{ editor: ProductionReportAdjustmentEditor }>();
const submitLabel = computed(() => {
  if (props.editor.intentStatus === 'pending') return '重试本次提交';
  if (props.editor.mode === 'correct') return '确认更正正常数量';
  return '确认全量冲销';
});
const verificationVisible = ref(false);
const previewQuantity = (quantity: number | null): string =>
  quantity !== null && Number.isFinite(quantity) ? formatQuantity(quantity) : '—';
const quantityImpact = computed(() => {
  const editor = props.editor;
  if (
    (editor.mode === 'correct' && editor.quantityValidation.error !== null) ||
    editor.afterNormalQuantity === null ||
    !Number.isFinite(editor.afterNormalQuantity) ||
    editor.afterAvailableQuantity === null ||
    !Number.isFinite(editor.afterAvailableQuantity)
  )
    return null;
  const unit = editor.step?.unit ?? '';
  return `工序累计正常数量 ${formatQuantity(editor.afterNormalQuantity)} ${unit}，还可报工 ${formatQuantity(editor.afterAvailableQuantity)} ${unit}`;
});
const unconfirmedNote = computed(() =>
  props.editor.unknownReverse
    ? '上次冲销结果尚未确认，请先核对报工历史。请勿重新冲销或更正。'
    : submissionRecoveryMessage(props.editor.intentStatus, '报工历史'),
);
watch(
  () => props.editor.visible,
  (visible) => {
    if (!visible) verificationVisible.value = false;
  },
);
</script>

<style scoped>
.editor-note {
  margin-top: 12px;
}
.editor-form {
  margin-top: 16px;
}
.adjustment-note {
  margin: 8px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.quantity-limit,
.quantity-impact {
  flex-basis: 100%;
  margin-top: 6px;
  color: var(--el-text-color-regular);
  font-size: 12px;
}
.quantity-limit strong {
  color: var(--el-text-color-primary);
}
.quantity-impact {
  font-variant-numeric: tabular-nums;
}
.reverse-impact {
  margin-bottom: 16px;
}
.reverse-entry {
  margin-top: 8px;
}
</style>
