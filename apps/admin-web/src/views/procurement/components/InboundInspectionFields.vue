<template>
  <el-form
    label-width="160px"
    :disabled="disabled"
  >
    <div class="inspection-reference">
      发起时申报 {{ coveredQuantity }} {{ unit }} · 仅供核对整批范围
    </div>
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
    <div class="inspection-quantity-grid">
      <el-form-item
        :label="model.inspectionMethod === 'sampling' ? '样本合格数' : '合格数'"
        required
      >
        <el-input-number
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
          v-model="model.unqualifiedQuantity"
          :min="0"
          :max="PURCHASE_ORDER_MAX_QUANTITY"
          :precision="0"
          controls-position="right"
        />
      </el-form-item>
    </div>
    <el-form-item
      label="放行结论"
      required
    >
      <el-select
        v-model="model.releaseDecision"
        placeholder="核对数量后选择结论"
      >
        <el-option
          v-for="decision in QUALITY_RELEASE_DECISIONS"
          :key="decision"
          :value="decision"
          :label="QUALITY_RELEASE_DECISION_LABELS[decision]"
        />
      </el-select>
    </el-form-item>
    <div
      v-if="preview"
      class="inspection-preview"
    >
      <strong
        >{{ model.inspectionMethod === 'sampling' ? '本次样本' : '实际检查' }}
        {{ preview.inspectedQuantity }}</strong
      >
      <span v-if="model.inspectionMethod === 'sampling'"
        >样本结果用于判断整批，样本数不等于整批实物量。</span
      >
      <span v-else-if="preview.inspectedQuantity !== coveredQuantity"
        >检查数与发起时申报量不同，库管定稿时需核对。</span
      >
      <span>本结论不自动形成入库或退回事实。</span>
    </div>
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
import { fromBeijingDateTimeInputValue, toBeijingDateTimeInputValue } from '../../../utils/date';
import {
  inboundInspectionInput,
  inboundInspectionPreview,
  type InboundInspectionDraft,
} from '../../quality/inbound-inspection';
const model = defineModel<InboundInspectionDraft>({ required: true });
defineProps<{ coveredQuantity: number; unit: string; disabled: boolean; caseId: string }>();
const emit = defineEmits<{ valid: [boolean] }>();
const preview = computed(() => inboundInspectionPreview(model.value));
const valid = computed(() => inboundInspectionInput(model.value) !== null);
const changeMethod = (value: string | number | boolean | undefined) => {
  if (!QUALITY_INBOUND_METHODS.includes(value as QualityInboundInspectionInput['inspectionMethod']))
    return;
  model.value.inspectionMethod = value as QualityInboundInspectionInput['inspectionMethod'];
  model.value.qualifiedQuantity = undefined;
  model.value.unqualifiedQuantity = undefined;
  model.value.releaseDecision = undefined;
};
watch(
  () => [model.value.qualifiedQuantity, model.value.unqualifiedQuantity],
  () => {
    model.value.releaseDecision = undefined;
  },
);
watch(valid, (value) => emit('valid', value), { immediate: true });
</script>
<style scoped>
.hint {
  margin-left: 12px;
  color: #6b7280;
  font-size: 13px;
}
.notice {
  margin: 12px 0 20px;
}
.inspection-reference,
.inspection-preview {
  margin-bottom: 16px;
  padding: 8px 12px;
  background: #f5f7fa;
  color: #1f2937;
}
.inspection-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  border-left: 3px solid #306188;
}
.inspection-quantity-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
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
