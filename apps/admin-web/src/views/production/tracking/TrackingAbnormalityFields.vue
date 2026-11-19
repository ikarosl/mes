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
    :required="resolutionRequired"
  >
    <el-checkbox
      v-for="resolution in PRODUCTION_TRACKING_ABNORMALITY_RESOLUTIONS"
      :key="resolution"
      :model-value="selectedResolution === resolution"
      @change="emit('toggleResolution', resolution, Boolean($event))"
      >全部{{ PRODUCTION_TRACKING_ABNORMALITY_RESOLUTION_LABELS[resolution] }}</el-checkbox
    >
    <el-checkbox
      :model-value="selectedResolution === 'mixed'"
      :disabled="!allowMixedResolution && selectedResolution !== 'mixed'"
      @change="emit('toggleResolution', 'mixed', Boolean($event))"
      >部分返修、部分报废<span v-if="!allowMixedResolution"
        >（至少 2 {{ unit }}）</span
      ></el-checkbox
    >
  </el-form-item>
  <el-form-item
    v-if="selectedResolution === 'mixed'"
    label="报废数量"
    required
    :error="mixedResolutionError"
  >
    <el-input-number
      :model-value="scrappedQuantity"
      :disabled="!allowMixedResolution"
      :min="1"
      :precision="0"
      :step="1"
      placeholder="填写报废数量"
      @update:model-value="emit('update:scrappedQuantity', $event)"
    /><span class="unit">{{ unit }}</span>
    <p
      v-if="allowMixedResolution"
      class="mixed-repair-quantity"
    >
      <template v-if="mixedRepairedQuantity === undefined"
        >报废须少于异常数量，其余数量计为返修完成。</template
      >
      <template v-else
        >其余
        <strong>{{ formatQuantity(mixedRepairedQuantity) }} {{ unit }}</strong> 返修完成。</template
      >
    </p>
  </el-form-item>
</template>

<script setup lang="ts">
import {
  PRODUCTION_TRACKING_ABNORMALITY_RESOLUTIONS,
  PRODUCTION_TRACKING_ABNORMALITY_RESOLUTION_LABELS,
} from '@company/constants';
import TrackingAbnormalityLabels from './TrackingAbnormalityLabels.vue';
import type { TrackingAbnormalityDisposition } from './use-tracking-card-action';
import { formatQuantity } from '../../../utils/quantity';

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
    resolutionRequired?: boolean;
    allowMixedResolution?: boolean;
    scrappedQuantity?: number;
    mixedRepairedQuantity?: number;
    mixedResolutionError?: string;
    labelSearch?: LabelSearchState;
  }>(),
  {
    readonlyDetails: false,
    resolutionRequired: false,
    allowMixedResolution: false,
    scrappedQuantity: undefined,
    mixedRepairedQuantity: undefined,
    mixedResolutionError: '',
    labelSearch: undefined,
  },
);
const emit = defineEmits<{
  'update:modelValue': [value: AbnormalityFieldsValue];
  'update:scrappedQuantity': [value: number | undefined];
  toggleResolution: [resolution: TrackingAbnormalityDisposition, checked: boolean];
  search: [value: string];
  refresh: [];
  loadMore: [];
}>();

function updateField<Key extends keyof AbnormalityFieldsValue>(
  key: Key,
  value: AbnormalityFieldsValue[Key],
): void {
  if (props.readonlyDetails) return;
  emit('update:modelValue', { ...props.modelValue, [key]: value });
}
</script>

<style scoped>
.mixed-repair-quantity {
  width: 100%;
  margin: 4px 0 0;
  line-height: 1.5;
}
.unit {
  margin-left: 8px;
}
.quantity-available {
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: var(--el-font-size-small);
}
</style>
