<template>
  <el-form
    label-width="160px"
    :disabled="disabled"
  >
    <el-form-item
      label="检验方式"
      required
    >
      <el-radio-group
        :model-value="model.inspectionMethod"
        @change="changeMethod"
      >
        <el-radio
          v-for="method in QUALITY_INBOUND_METHODS"
          :key="method"
          :value="method"
          >{{ QUALITY_INSPECTION_METHOD_LABELS[method] }}</el-radio
        >
      </el-radio-group>
    </el-form-item>
    <!-- Element Plus InputNumber 仅在挂载时写入 aria-disabled；锁定状态变化时重挂载以同步无障碍状态。 -->
    <div class="inspection-quantity-grid">
      <el-form-item
        :label="model.inspectionMethod === 'sampling' ? '样本合格数' : '合格数'"
        required
      >
        <el-input-number
          :key="disabled ? 'qualified-locked' : 'qualified-ready'"
          v-model="model.qualifiedQuantity"
          :min="0"
          :max="PURCHASE_ORDER_MAX_QUANTITY"
          :precision="0"
          controls-position="right"
        />
      </el-form-item>
      <el-form-item
        :label="model.inspectionMethod === 'sampling' ? '样本不合格数' : '不合格数'"
        required
      >
        <el-input-number
          :key="disabled ? 'unqualified-locked' : 'unqualified-ready'"
          v-model="model.unqualifiedQuantity"
          :min="0"
          :max="PURCHASE_ORDER_MAX_QUANTITY"
          :precision="0"
          controls-position="right"
        />
      </el-form-item>
    </div>
    <InlineHint
      :tone="previewTone"
      class="inspection-preview"
    >
      {{ model.inspectionMethod === 'sampling' ? '样本总数' : '检查总数' }}：
      <strong v-if="preview">{{ preview.inspectedQuantity }} {{ unit }}</strong>
      <template v-else>请填写有效数量</template>。
      <template
        v-if="
          model.inspectionMethod === 'sampling' &&
          preview &&
          preview.inspectedQuantity > coveredQuantity
        "
      >
        样本总数超过仓库送检数量
        <strong>{{ coveredQuantity }} {{ unit }}</strong
        >，请核对送检数量或检验记录。
      </template>
      <template v-else-if="model.inspectionMethod === 'sampling'">抽检只填写样本数量。</template>
      <template v-else-if="preview && preview.inspectedQuantity !== coveredQuantity">
        与仓库送检数量相差
        <strong>{{ Math.abs(preview.inspectedQuantity - coveredQuantity) }} {{ unit }}</strong
        >，仓库确认时需核对。
      </template>
    </InlineHint>
    <el-form-item
      label="放行结论"
      required
    >
      <el-select
        v-model="model.releaseDecision"
        :disabled="!preview"
        :placeholder="preview ? '核对数量后选择结论' : '先填写合格数与不合格数'"
      >
        <el-option
          v-for="decision in QUALITY_RELEASE_DECISIONS"
          :key="decision"
          :value="decision"
          :label="QUALITY_RELEASE_DECISION_LABELS[decision]"
        />
      </el-select>
    </el-form-item>
    <InlineHint class="inspection-preview"> 检验完成后，由仓库核对并办理入库或退回。 </InlineHint>
    <el-form-item
      label="线下检验时间"
      required
    >
      <el-date-picker
        :model-value="toBeijingDateTimeInputValue(model.inspectedAt)"
        type="datetime"
        value-format="YYYY-MM-DD HH:mm:ss"
        @update:model-value="model.inspectedAt = fromBeijingDateTimeInputValue($event)"
      />
    </el-form-item>
    <el-form-item
      label="检验结论说明"
      required
      ><el-input
        v-model="model.remark"
        type="textarea"
        :rows="3"
        :maxlength="QUALITY_INBOUND_TEXT_MAX_LENGTH"
        show-word-limit
    /></el-form-item>
    <el-form-item
      label="凭据编号 / 位置"
      required
      ><el-input
        v-model="model.evidence"
        type="textarea"
        :rows="2"
        :maxlength="QUALITY_INBOUND_TEXT_MAX_LENGTH"
        show-word-limit
    /></el-form-item>
  </el-form>
</template>
<script setup lang="ts">
import { computed, watch } from 'vue';
import {
  QUALITY_INBOUND_METHODS,
  QUALITY_INSPECTION_METHOD_LABELS,
  QUALITY_RELEASE_DECISIONS,
  QUALITY_RELEASE_DECISION_LABELS,
  QUALITY_INBOUND_TEXT_MAX_LENGTH,
  PURCHASE_ORDER_MAX_QUANTITY,
} from '@company/constants';
import type { QualityInboundInspectionInput } from '@company/contracts';
import InlineHint from '../../../components/InlineHint.vue';
import { fromBeijingDateTimeInputValue, toBeijingDateTimeInputValue } from '../../../utils/date';
import {
  inboundInspectionInput,
  inboundInspectionPreview,
  type InboundInspectionDraft,
} from '../../quality/inbound-inspection';
const model = defineModel<InboundInspectionDraft>({ required: true });
const props = defineProps<{ coveredQuantity: number; unit: string; disabled: boolean }>();
const emit = defineEmits<{ valid: [boolean] }>();
const preview = computed(() => inboundInspectionPreview(model.value));
const previewTone = computed(() => {
  if (!preview.value) return 'info';
  if (model.value.inspectionMethod === 'sampling') {
    if (preview.value.inspectedQuantity > props.coveredQuantity) return 'warning';
    return 'info';
  }
  if (preview.value.inspectedQuantity !== props.coveredQuantity) return 'warning';
  return 'info';
});
const valid = computed(() => inboundInspectionInput(model.value) !== null);
const changeMethod = (value: string | number | boolean | undefined) => {
  if (!QUALITY_INBOUND_METHODS.includes(value as QualityInboundInspectionInput['inspectionMethod']))
    return;
  model.value.inspectionMethod = value as QualityInboundInspectionInput['inspectionMethod'];
  model.value.qualifiedQuantity = undefined;
  model.value.unqualifiedQuantity = undefined;
  model.value.releaseDecision = undefined;
};
watch(valid, (value) => emit('valid', value), { immediate: true });
</script>
<style scoped>
.inspection-preview {
  margin-bottom: 16px;
}
.inspection-quantity-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
}
@media (max-width: 900px) {
  .inspection-quantity-grid {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
.el-select {
  width: 280px;
}
</style>
