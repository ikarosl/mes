<template>
  <div class="flow-task-picker">
    <label for="dashboard-flow-task">查看任务</label>
    <RemoteSearchSelect
      id="dashboard-flow-task"
      :model-value="modelValue?.id ?? null"
      :options="options"
      :loading="read.state.loading"
      :error="Boolean(read.state.error)"
      :has-more="(read.state.data?.total ?? 0) > (read.state.data?.items.length ?? 0)"
      placeholder="搜索任务号 / 工单号 / 产品"
      :empty-text="
        scope.onlyInProgress ? '当前筛选范围没有有在制的任务' : '当前筛选范围没有匹配任务'
      "
      @search="search"
      @open="search(keyword)"
      @refresh="search(keyword)"
      @update:model-value="select"
    />
    <slot />
    <span>任务按顶部业务条件筛选，不按日期截断</span>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import type {
  PageResult,
  ProductionDashboardOptionQuery,
  ProductionDashboardOption,
} from '@company/contracts';
import RemoteSearchSelect from '../../../components/RemoteSearchSelect.vue';
import { productionDashboardApi } from '../../../api/production/dashboard';
import { useDashboardRead } from './use-dashboard-read';

const props = defineProps<{
  modelValue: ProductionDashboardOption | null;
  scope: ProductionDashboardOptionQuery;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: ProductionDashboardOption | null] }>();
const read = useDashboardRead<PageResult<ProductionDashboardOption>>();
const keyword = ref('');
const items = computed(() => {
  const values = read.state.data?.items ?? [];
  return props.modelValue && !values.some((item) => item.id === props.modelValue?.id)
    ? [props.modelValue, ...values]
    : values;
});
const options = computed(() => items.value.map((item) => ({ value: item.id, label: item.label })));
async function search(value: string): Promise<void> {
  keyword.value = value;
  const query = { ...props.scope, search: value.trim() || undefined, page: 1, pageSize: 20 };
  await read.load((signal) =>
    productionDashboardApi.options('tasks', query, { signal, skipErrorHandling: true }),
  );
}
function select(id: string | null): void {
  emit('update:modelValue', items.value.find((item) => item.id === id) ?? null);
}
</script>
<style scoped>
.flow-task-picker {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
.flow-task-picker :deep(.remote-search-select) {
  width: 360px;
  max-width: 100%;
}
.flow-task-picker > span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
