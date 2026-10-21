<template>
  <div class="material-select">
    <el-select
      :model-value="itemId || undefined"
      filterable
      remote
      reserve-keyword
      :remote-method="search"
      :loading="materials.loading.value"
      :disabled="disabled"
      placeholder="搜索外购物料"
      @update:model-value="selectMaterial"
      @visible-change="openMaterials"
    >
      <el-option
        v-for="item in materials.options.value"
        :key="item.id"
        :value="item.id"
        :label="`${item.materialCode} · ${item.materialName}`"
      />
      <el-option
        v-if="itemId && !materialExists"
        :value="itemId"
        :label="`${itemLabel || itemId}（当前不可选）`"
        disabled
      />
    </el-select>
    <el-select
      :model-value="variantId || undefined"
      filterable
      :disabled="disabled || !itemId"
      :loading="variants.loading.value"
      placeholder="选择精确版本"
      @update:model-value="selectVariant"
      @visible-change="openVariants"
    >
      <el-option
        v-for="variant in variants.options.value"
        :key="variant.id"
        :value="variant.id"
        :label="`${variant.variantCode}${variant.status === 0 ? '（已停用，允许采购）' : ''}`"
      />
      <el-option
        v-if="variantId && !variantExists"
        :value="variantId"
        :label="`${variantLabel || variantId}（当前不可选）`"
        disabled
      />
    </el-select>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, ref, watch } from 'vue';
import type { MaterialOption, MaterialVariantItem } from '@company/contracts';
import { procurementApi } from '../../../api/procurement';
import { useRefreshableOptions } from '../../../composables/options/useRefreshableOptions';

const props = defineProps<{
  itemId: string;
  variantId: string;
  itemLabel: string;
  variantLabel: string;
  disabled: boolean;
}>();
const emit = defineEmits<{
  change: [MaterialOption | undefined, MaterialVariantItem | undefined];
  ready: [boolean];
}>();
const keyword = ref('');
const materials = useRefreshableOptions(
  () =>
    procurementApi.materialOptions({
      keyword: keyword.value.trim() || undefined,
      includeIds: props.itemId ? [props.itemId] : [],
    }),
  '采购物料候选刷新失败',
);
const variants = useRefreshableOptions(
  () => (props.itemId ? procurementApi.materialVariantOptions(props.itemId) : Promise.resolve([])),
  '采购版本候选刷新失败',
);
const materialExists = computed(() =>
  materials.options.value.some((row) => row.id === props.itemId),
);
const variantExists = computed(() =>
  variants.options.value.some(
    (row) => row.id === props.variantId && row.materialId === props.itemId,
  ),
);
watch(
  () =>
    materials.status.value === 'ready' &&
    variants.status.value === 'ready' &&
    materialExists.value &&
    variantExists.value,
  (ready) => emit('ready', ready),
  { immediate: true },
);
const search = async (value: string): Promise<void> => {
  keyword.value = value;
  await materials.refresh();
};
const openMaterials = (open: boolean): void => {
  if (open) void materials.refresh();
};
const openVariants = (open: boolean): void => {
  if (open) void variants.refresh();
};
const selectMaterial = (id: string): void => {
  emit(
    'change',
    materials.options.value.find((row) => row.id === id),
    undefined,
  );
};
const selectVariant = (id: string): void => {
  emit(
    'change',
    materials.options.value.find((row) => row.id === props.itemId),
    variants.options.value.find((row) => row.id === id),
  );
};
watch(
  () => props.itemId,
  () => {
    void variants.refresh();
  },
  { immediate: true },
);
const refresh = async (): Promise<void> => {
  await Promise.all([materials.refresh(), variants.refresh()]);
};
onActivated(() => {
  void refresh();
});
void materials.refresh();
</script>

<style scoped>
.material-select {
  display: grid;
  gap: 8px;
}
.el-select {
  width: 100%;
}
</style>
