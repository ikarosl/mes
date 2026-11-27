<template>
  <div class="candidate">
    <el-select
      :model-value="modelValue"
      :aria-label="label"
      :placeholder="label"
      clearable
      filterable
      remote
      :remote-method="search"
      :loading="read.state.loading"
      @visible-change="opened"
      @update:model-value="change"
    >
      <el-option
        v-for="item in options"
        :key="item.id"
        :label="item.label"
        :value="item.id"
      />
      <template #footer
        ><span
          v-if="read.state.error"
          class="error"
          >{{ read.state.error }}</span
        ><span
          v-else
          class="hint"
          >输入关键词搜索；每次显示前20项</span
        ></template
      >
    </el-select>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import type {
  PageResult,
  ProductionDashboardOption,
  ProductionDashboardOptionKind,
  ProductionDashboardFilter,
} from '@company/contracts';
import { productionDashboardApi } from '../../../api/production/dashboard';
import { useDashboardRead } from './use-dashboard-read';
const props = defineProps<{
  modelValue?: string;
  kind: ProductionDashboardOptionKind;
  label: string;
  scope?: ProductionDashboardFilter;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string | undefined] }>();
const selected = ref<ProductionDashboardOption>();
const read = useDashboardRead<PageResult<ProductionDashboardOption>>();
const options = computed(() => {
  const items = read.state.data?.items ?? [];
  if (
    selected.value &&
    props.modelValue === selected.value.id &&
    !items.some((item) => item.id === selected.value?.id)
  )
    return [selected.value, ...items];
  return items;
});
async function search(keyword: string): Promise<void> {
  await read.load((signal) =>
    productionDashboardApi.options(
      props.kind,
      { ...props.scope, keyword, page: 1, pageSize: 20 },
      { signal, skipErrorHandling: true },
    ),
  );
}
function opened(visible: boolean): void {
  if (visible && read.state.data === null) void search('');
}
function change(value: string | undefined): void {
  selected.value = options.value.find((item) => item.id === value);
  emit('update:modelValue', value || undefined);
}
</script>
<style scoped>
.candidate {
  min-width: 190px;
  flex: 1;
}
.candidate :deep(.el-select) {
  width: 100%;
}
.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.error {
  color: var(--el-color-danger);
  font-size: 12px;
}
</style>
