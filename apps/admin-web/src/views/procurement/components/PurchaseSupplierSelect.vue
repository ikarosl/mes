<template>
  <el-select
    :model-value="supplierId"
    filterable
    remote
    reserve-keyword
    :remote-method="suppliers.search"
    :loading="suppliers.loading.value"
    :disabled="disabled"
    placeholder="搜索并选择实际供应商"
    @update:model-value="emit('update:supplierId', $event)"
    @visible-change="opened"
  >
    <el-option
      v-for="supplier in suppliers.options.value"
      :key="supplier.id"
      :value="supplier.id"
      :label="supplier.supplierName"
    />
    <el-option
      v-if="supplierId && !exists"
      :value="supplierId"
      :label="`${supplierName || supplierId}（当前不可选）`"
      disabled
    />
  </el-select>
</template>
<script setup lang="ts">
import { computed, onActivated, watch } from 'vue';
import { useSupplierOptions } from '../../../composables/options/useSupplierOptions';
const props = defineProps<{
  supplierId: string;
  supplierName?: string;
  disabled?: boolean;
  refreshToken?: number;
}>();
const emit = defineEmits<{ 'update:supplierId': [string]; ready: [boolean] }>();
const suppliers = useSupplierOptions(() => (props.supplierId ? [props.supplierId] : []));
const exists = computed(() =>
  suppliers.options.value.some((supplier) => supplier.id === props.supplierId),
);
watch(
  () => [props.supplierId, suppliers.status.value, exists.value],
  () => emit('ready', suppliers.status.value === 'ready' && exists.value),
  { immediate: true },
);
watch(
  () => props.refreshToken,
  () => {
    void suppliers.refresh();
  },
  { immediate: true },
);
function opened(value: boolean) {
  if (value) void suppliers.refresh();
}
onActivated(() => {
  void suppliers.refresh();
});
</script>
