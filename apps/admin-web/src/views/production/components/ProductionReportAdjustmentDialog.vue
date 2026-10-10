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
        <el-descriptions-item label="原正常数量">
          <strong>{{ formatQuantity(editor.report.normalQuantity) }}</strong>
          {{ editor.report.unit }}
        </el-descriptions-item>
        <el-descriptions-item label="实际录入人">
          {{ editor.report.createdByName || '未提供姓名' }}
        </el-descriptions-item>
      </el-descriptions>
      <div class="adjustment-quantities">
        <ProductionQuotaBasis
          :quota="editor.step"
          :planned-quantity="editor.step.baseNormalQuantity"
          :show-reopen-hint="false"
        />
        <div class="quantity-preview">
          <span>工序数量（{{ editor.step.unit }}）</span>
          <span>调整前</span>
          <span>调整后</span>
          <strong>工序正常数量</strong>
          <span>{{ formatQuantity(editor.step.effectiveNormalQuantity) }}</span>
          <strong>{{ previewQuantity(editor.afterNormalQuantity) }}</strong>
          <strong>剩余额度</strong>
          <span>{{ formatQuantity(editor.step.availableReportQuantity) }}</span>
          <strong :class="{ 'over-limit': (editor.afterAvailableQuantity ?? 0) < 0 }">
            {{ previewQuantity(editor.afterAvailableQuantity) }}
          </strong>
        </div>
      </div>
      <InlineHint class="editor-note">
        {{
          editor.mode === 'correct'
            ? '填写该记录应保留的完整正常数量，不填写增减量。更正会全量冲销原记录并生成替代记录，原事实和原因继续留存。'
            : '整条正常报工全量冲销，原事实和原因继续留存。'
        }}
        数量调整不改变工序状态。
      </InlineHint>
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
          label="更正后正常数量"
          :error="editor.quantityTouched ? (editor.quantityValidation.error ?? '') : ''"
          required
        >
          <el-input
            :model-value="editor.form.normalQuantity"
            inputmode="numeric"
            placeholder="请输入应保留的完整正常数量"
            aria-label="更正后正常数量"
            @update:model-value="editor.setNormalQuantity"
            @blur="editor.touchQuantity"
          />
          <div class="quantity-limit">
            本条最多 <strong>{{ previewQuantity(editor.maximumQuantity) }}</strong>
            {{ editor.report.unit }}（以工序报工上限和单次上限核对）
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
        >{{
          editor.intentStatus === 'pending'
            ? '按原请求重试'
            : editor.mode === 'correct'
              ? '确认更正正常数量'
              : '确认全量冲销'
        }}</el-button
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
import { computed, ref, watch } from 'vue';
import type { ProductionReportAdjustmentEditor } from '../composables/useProductionReportAdjustment';
import InlineHint from '../../../components/InlineHint.vue';
import { DialogWidth } from '../../../utils/dialog';
import { formatQuantity } from '../production-status';
import ProductionQuotaBasis from './ProductionQuotaBasis.vue';
import ProductionReportVerificationDialog from './ProductionReportVerificationDialog.vue';

const props = defineProps<{ editor: ProductionReportAdjustmentEditor }>();
const verificationVisible = ref(false);
const previewQuantity = (quantity: number | null): string =>
  quantity !== null && Number.isFinite(quantity) ? formatQuantity(quantity) : '—';
const unconfirmedNote = computed(() =>
  props.editor.unknownReverse
    ? '上次冲销结果尚未确认，请先核对报工历史。请勿重新冲销或更正。'
    : props.editor.intentStatus === 'pending'
      ? '上次更正结果尚未确认，原数量、版本和请求已锁定。仅可按原请求重试，或先核对报工历史。'
      : '上次更正结果需要核对，当前不能继续提交。请核对报工历史后再决定是否放弃原请求。',
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
.adjustment-quantities {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}
.quantity-preview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 100px 100px;
  gap: 8px 16px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  font-size: 13px;
  color: var(--el-text-color-primary);
}
.quantity-preview > :nth-child(-n + 3) {
  color: var(--el-text-color-regular);
}
.quantity-preview > :nth-child(3n),
.quantity-preview > :nth-child(3n - 1) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.quantity-limit {
  flex-basis: 100%;
  margin-top: 6px;
  color: var(--el-text-color-regular);
  font-size: 12px;
}
.quantity-limit strong {
  color: var(--el-text-color-primary);
}
.reverse-entry {
  margin-top: 8px;
}
.over-limit {
  color: var(--el-color-danger);
}
</style>
