<template>
  <el-dialog
    :model-value="visible"
    title="设置默认工艺路线"
    :width="DialogWidth.md"
    @update:model-value="$emit('update:visible', $event)"
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
        >
          <el-option
            v-for="route in availableRoutes"
            :key="route.id"
            :label="`${route.routeCode} / ${route.routeName} / ${route.versionNo}`"
            :value="route.id"
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
import { ref, watch } from 'vue';
import type { ProcessRouteOption, ProductListItem } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';

const props = defineProps<{
  visible: boolean;
  product: ProductListItem | null;
  availableRoutes: ProcessRouteOption[];
  currentRouteId: string | null;
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'confirm', routeId: string | null): void;
}>();

const selectedRouteId = ref('');

const handleConfirm = (): void => {
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
