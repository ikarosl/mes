<template>
  <el-dialog
    :model-value="visible"
    title="设置默认工艺路线"
    :width="DialogWidth.md"
    @update:model-value="$emit('update:visible', $event)"
    @open="$emit('refresh-options')"
  >
    <el-form label-width="96px">
      <el-form-item label="产品">
        <span>{{ product?.itemCode }} / {{ product?.productName }}</span>
      </el-form-item>
      <el-form-item label="默认路线">
        <el-select
          v-model="selectedRouteId"
          clearable
          placeholder="不设置默认路线"
          @visible-change="(visible: boolean) => visible && $emit('refresh-options')"
        >
          <el-option
            v-for="choice in routeChoices"
            :key="choice.value"
            :label="
              choice.option
                ? `${choice.option.routeCode} / ${choice.option.routeName} / ${choice.option.versionNo}`
                : `${choice.value}（已失效）`
            "
            :value="choice.value"
            :disabled="choice.isUnavailable"
          />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="handleConfirm"
        >保存默认路线</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ProcessRouteOption, ProductListItem } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';
import { EMessage } from '../../../utils/message';

const props = defineProps<{
  visible: boolean;
  product: ProductListItem | null;
  availableRoutes: ProcessRouteOption[];
  currentRouteId: string | null;
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'refresh-options'): void;
  (e: 'confirm', routeId: string | null): void;
}>();

const selectedRouteId = ref('');
const routeChoices = computed(() =>
  buildLiveOptions(
    props.availableRoutes,
    selectedRouteId.value ? [selectedRouteId.value] : [],
    (item) => item.id,
  ),
);

const handleConfirm = (): void => {
  if (
    hasUnavailableSelection(
      props.availableRoutes,
      selectedRouteId.value ? [selectedRouteId.value] : [],
      (item) => item.id,
    )
  ) {
    EMessage.warning('默认工艺路线已失效，请重新选择');
    return;
  }
  emit('confirm', selectedRouteId.value || null);
};

watch(
  () => [props.visible, props.product?.id, props.currentRouteId] as const,
  ([visible]) => {
    if (visible) selectedRouteId.value = props.currentRouteId ?? '';
  },
  { immediate: true },
);
</script>
