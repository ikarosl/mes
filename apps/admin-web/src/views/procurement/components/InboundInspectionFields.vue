<template>
  <div>
    <el-alert
      v-if="coveredQuantity === 0"
      title="本次实收更正范围为零，仍须由质检核实真实情况并留存说明和凭据；不产生放行量。"
      type="info"
      :closable="false"
      class="notice"
    />
    <el-form
      label-width="130px"
      :disabled="disabled"
    >
      <el-form-item label="本次覆盖量">{{ coveredQuantity }} {{ unit }}</el-form-item>
      <el-form-item
        label="检验方式"
        required
      >
        <el-radio-group
          v-if="coveredQuantity > 0"
          :model-value="model.inspectionMethod"
          @change="changeMethod"
          ><el-radio value="full">{{ QUALITY_INBOUND_METHOD_LABELS.full }}</el-radio
          ><el-radio value="sampling">{{
            QUALITY_INBOUND_METHOD_LABELS.sampling
          }}</el-radio></el-radio-group
        >
        <span v-else>{{ QUALITY_INBOUND_METHOD_LABELS.review_only }}</span>
      </el-form-item>
      <template v-if="coveredQuantity > 0 && model.inspectionMethod === 'full'">
        <el-form-item
          label="实际合格量"
          required
          ><el-input-number
            :model-value="model.qualifiedQuantity ?? undefined"
            :precision="0"
            :min="0"
            :max="coveredQuantity"
            controls-position="right"
            @update:model-value="model.qualifiedQuantity = $event ?? null"
        /></el-form-item>
        <el-form-item
          label="实际不合格量"
          required
          ><el-input-number
            :model-value="model.unqualifiedQuantity ?? undefined"
            :precision="0"
            :min="0"
            :max="coveredQuantity"
            controls-position="right"
            @update:model-value="model.unqualifiedQuantity = $event ?? null"
          /><span class="hint">两项合计须等于覆盖量</span></el-form-item
        >
      </template>
      <template v-if="coveredQuantity > 0 && model.inspectionMethod === 'sampling'">
        <el-form-item
          label="实际样本量"
          required
          ><el-input-number
            :model-value="model.sampleQuantity ?? undefined"
            :precision="0"
            :min="1"
            :max="coveredQuantity"
            controls-position="right"
            @update:model-value="model.sampleQuantity = $event ?? null"
          /><span class="hint">抽样比例 {{ sampleRatio }}</span></el-form-item
        >
        <el-form-item
          label="样本内不合格量"
          required
          ><el-input-number
            :model-value="model.sampleUnqualifiedQuantity ?? undefined"
            :precision="0"
            :min="0"
            :max="model.sampleQuantity ?? coveredQuantity"
            controls-position="right"
            @update:model-value="model.sampleUnqualifiedQuantity = $event ?? null"
        /></el-form-item>
      </template>
      <template v-if="coveredQuantity > 0">
        <el-form-item
          label="实际剔除不良量"
          required
          ><el-input-number
            v-model="model.removedDefectQuantity"
            :precision="0"
            :min="0"
            :max="coveredQuantity"
            controls-position="right"
        /></el-form-item>
        <el-form-item
          label="是否批准入库"
          required
          ><el-radio-group
            v-model="approvalChoice"
            @change="approvalChanged"
            ><el-radio :value="true">明确批准</el-radio
            ><el-radio :value="false">不批准</el-radio></el-radio-group
          ></el-form-item
        >
        <el-form-item
          label="后续处置"
          required
          ><el-select v-model="model.disposition"
            ><el-option
              v-for="value in dispositions"
              :key="value"
              :value="value"
              :label="QUALITY_INBOUND_DISPOSITION_LABELS[value]" /></el-select
        ></el-form-item>
        <p class="hint">
          检验记录和放行不会自动入库；样本不合格比例不推算整批报废量。放行前必须剔除已知不良，实际放行额度由服务端核验。
        </p>
      </template>
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
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { QualityInboundInspectionInput } from '@company/contracts';
import {
  QUALITY_INBOUND_METHOD_LABELS,
  QUALITY_INBOUND_DISPOSITION_LABELS,
  QUALITY_INBOUND_TEXT_MAX_LENGTH,
} from '@company/constants';
const model = defineModel<QualityInboundInspectionInput>({ required: true });
const props = defineProps<{
  coveredQuantity: number;
  unit: string;
  disabled: boolean;
  caseId: string;
}>();
const emit = defineEmits<{ valid: [boolean] }>();
const approvalChoice = ref<boolean>();
const dispositions = ['release', 'await_full_inspection', 'await_decision', 'return_all'] as const;
const sampleRatio = computed(() =>
  props.coveredQuantity > 0 && model.value.sampleQuantity !== null
    ? `${((model.value.sampleQuantity / props.coveredQuantity) * 100).toFixed(2)}%`
    : '—',
);
const changeMethod = (value: string | number | boolean | undefined): void => {
  if (value !== 'full' && value !== 'sampling') return;
  model.value.inspectionMethod = value;
  model.value.qualifiedQuantity = null;
  model.value.unqualifiedQuantity = null;
  model.value.sampleQuantity = null;
  model.value.sampleUnqualifiedQuantity = null;
  model.value.removedDefectQuantity = 0;
  model.value.inboundApproved = false;
  approvalChoice.value = undefined;
  model.value.disposition = 'await_decision';
};
const approvalChanged = (): void => {
  model.value.inboundApproved = approvalChoice.value === true;
};
const integer = (value: number | null): boolean =>
  value !== null && Number.isInteger(value) && value >= 0;
const valid = computed(() => {
  const input = model.value;
  if (!input.remark.trim() || !input.evidence.trim()) return false;
  if (props.coveredQuantity === 0)
    return (
      input.inspectionMethod === 'review_only' && input.disposition === 'receipt_zero_confirmed'
    );
  if (
    approvalChoice.value === undefined ||
    (input.disposition === 'release') !== input.inboundApproved
  )
    return false;
  if (!integer(input.removedDefectQuantity) || input.removedDefectQuantity > props.coveredQuantity)
    return false;
  if (input.inspectionMethod === 'full')
    return (
      integer(input.qualifiedQuantity) &&
      integer(input.unqualifiedQuantity) &&
      Number(input.qualifiedQuantity) + Number(input.unqualifiedQuantity) === props.coveredQuantity
    );
  return (
    integer(input.sampleQuantity) &&
    Number(input.sampleQuantity) > 0 &&
    Number(input.sampleQuantity) <= props.coveredQuantity &&
    integer(input.sampleUnqualifiedQuantity) &&
    Number(input.sampleUnqualifiedQuantity) <= Number(input.sampleQuantity)
  );
});
watch(valid, (value) => emit('valid', value), { immediate: true });
watch(
  () => [props.caseId, model.value],
  () => {
    approvalChoice.value = undefined;
  },
);
</script>

<style scoped>
.notice {
  margin-bottom: 16px;
}
.hint {
  margin-left: 12px;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.7;
}
.el-select {
  width: 240px;
}
</style>
