<template>
  <el-form-item label="关联工序">
    <el-select
      :model-value="modelValue.stepRecordId"
      :disabled="readonlyDetails"
      clearable
      :placeholder="readonlyDetails ? '未指定' : '不确定时可不选'"
      @update:model-value="updateField('stepRecordId', $event)"
    >
      <el-option
        v-for="step in steps"
        :key="step.stepRecordId"
        :label="step.stepName"
        :value="step.stepRecordId"
      />
    </el-select>
  </el-form-item>
  <el-form-item
    label="异常数量"
    required
  >
    <el-input-number
      :model-value="modelValue.affectedQuantity"
      :disabled="readonlyDetails"
      :min="1"
      :max="Math.max(quantityLimit, modelValue.affectedQuantity ?? 0)"
      :precision="0"
      :step="1"
      placeholder="填写受影响数量"
      @update:model-value="updateField('affectedQuantity', $event)"
    /><span class="unit">{{ unit }}</span>
    <span
      v-if="!readonlyDetails"
      class="quantity-available"
      >可登记 {{ quantityLimit }} {{ unit }}</span
    >
  </el-form-item>
  <el-form-item
    label="异常描述"
    required
  >
    <TrackingAbnormalityLabels
      :model-value="modelValue.descriptionLabels"
      :readonly="readonlyDetails"
      :input-value="labelSearch?.inputValue ?? ''"
      :options="labelSearch?.options ?? []"
      :loading="labelSearch?.loading ?? false"
      :error="labelSearch?.error ?? false"
      :has-loaded="labelSearch?.hasLoaded ?? false"
      :has-more="labelSearch?.hasMore ?? false"
      @update:model-value="updateField('descriptionLabels', $event)"
      @search="emit('search', $event)"
      @refresh="emit('refresh')"
      @load-more="emit('loadMore')"
    />
  </el-form-item>
  <el-form-item
    label="处置方式"
    required
  >
    <el-radio-group
      :model-value="selectedResolution"
      aria-label="处置方式"
      @update:model-value="updateResolution"
    >
      <el-radio
        v-for="resolution in PRODUCTION_TRACKING_ABNORMALITY_RESOLUTIONS"
        :key="resolution"
        :value="resolution"
        >{{ PRODUCTION_TRACKING_ABNORMALITY_RESOLUTION_LABELS[resolution] }}</el-radio
      >
      <el-radio
        v-if="allowMixedHandling"
        value="mixed"
        >部分返修、部分报废</el-radio
      >
    </el-radio-group>
  </el-form-item>
</template>

<script setup lang="ts">
import {
  PRODUCTION_TRACKING_ABNORMALITY_RESOLUTIONS,
  PRODUCTION_TRACKING_ABNORMALITY_RESOLUTION_LABELS,
} from '@company/constants';
import TrackingAbnormalityLabels from './TrackingAbnormalityLabels.vue';
import type { TrackingAbnormalityDisposition } from './use-tracking-card-action';

interface AbnormalityFieldsValue {
  stepRecordId: string;
  affectedQuantity: number | undefined;
  descriptionLabels: string[];
}
interface LabelSearchState {
  inputValue: string;
  options: string[];
  loading: boolean;
  error: boolean;
  hasLoaded: boolean;
  hasMore: boolean;
}

defineOptions({ name: 'TrackingAbnormalityFields' });
const props = withDefaults(
  defineProps<{
    modelValue: AbnormalityFieldsValue;
    steps: { stepRecordId: string; stepName: string }[];
    quantityLimit: number;
    selectedResolution: TrackingAbnormalityDisposition | '';
    unit: string;
    readonlyDetails?: boolean;
    allowMixedHandling?: boolean;
    labelSearch?: LabelSearchState;
  }>(),
  {
    readonlyDetails: false,
    allowMixedHandling: false,
    labelSearch: undefined,
  },
);
const emit = defineEmits<{
  'update:modelValue': [value: AbnormalityFieldsValue];
  selectResolution: [resolution: TrackingAbnormalityDisposition];
  search: [value: string];
  refresh: [];
  loadMore: [];
}>();

function updateResolution(value: string | number | boolean | undefined): void {
  const resolution = PRODUCTION_TRACKING_ABNORMALITY_RESOLUTIONS.find((option) => option === value);
  if (resolution) emit('selectResolution', resolution);
  else if (value === 'mixed' && props.allowMixedHandling) emit('selectResolution', value);
}

function updateField<Key extends keyof AbnormalityFieldsValue>(
  key: Key,
  value: AbnormalityFieldsValue[Key],
): void {
  if (props.readonlyDetails) return;
  emit('update:modelValue', { ...props.modelValue, [key]: value });
}
</script>

<style scoped>
.unit {
  margin-left: 8px;
}
.quantity-available {
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: var(--el-font-size-small);
}
</style>
