<template>
  <el-select
    class="remote-search-select"
    :model-value="modelValue"
    :disabled="isDisabled"
    :loading="loading"
    :placeholder="placeholder"
    :remote-method="handleSearch"
    :value-on-clear="clearValue"
    filterable
    remote
    remote-show-suffix
    clearable
    @update:model-value="handleModelValue"
    @visible-change="handleVisibleChange"
  >
    <el-option
      v-if="modelValue && !hasSelectedOption"
      :key="modelValue"
      :value="modelValue"
      :label="missingSelectionLabel"
      disabled
    />
    <el-option
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      :label="option.label"
      :disabled="option.disabled"
    />
    <template #loading>
      <div class="remote-search-select__message">加载中…</div>
    </template>
    <template #empty>
      <div class="remote-search-select__message">
        {{ error ? '加载失败，请重试' : emptyText }}
      </div>
    </template>
    <template #footer>
      <div class="remote-search-select__footer">
        <span v-if="loading">正在搜索…</span>
        <span
          v-else-if="error"
          class="remote-search-select__error"
          >加载失败，请重试</span
        >
        <span v-else-if="hasMore">{{ moreText }}</span>
        <span v-else-if="modelValue">已选项保留显示</span>
        <span v-else>已显示全部匹配项</span>
        <div class="remote-search-select__actions">
          <el-button
            link
            size="small"
            :disabled="isDisabled || loading"
            @click="handleRefresh"
            >{{ error ? '重试' : '刷新' }}</el-button
          >
        </div>
      </div>
    </template>
  </el-select>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import { formContextKey } from 'element-plus';

defineOptions({ name: 'RemoteSearchSelect' });

interface RemoteSearchOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const props = withDefaults(
  defineProps<{
    modelValue: string | null;
    options: RemoteSearchOption[];
    loading: boolean;
    error: boolean;
    disabled?: boolean;
    hasMore: boolean;
    placeholder?: string;
    emptyText?: string;
    moreText?: string;
    missingSelectionLabel?: string;
  }>(),
  {
    disabled: false,
    placeholder: '请选择',
    emptyText: '暂无匹配项',
    moreText: '匹配项较多，请继续输入关键词缩小范围',
    missingSelectionLabel: '原已选项（待重新核验）',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
  search: [query: string];
  open: [];
  refresh: [];
}>();

const form = inject(formContextKey, undefined);
const isDisabled = computed(() => props.disabled || Boolean(form?.disabled));
const hasSelectedOption = computed(() =>
  props.options.some((option) => option.value === props.modelValue),
);
const clearValue = () => null;
let dropdownVisible = false;

function handleModelValue(value: unknown) {
  if (isDisabled.value) return;
  emit('update:modelValue', typeof value === 'string' && value ? value : null);
}

function handleSearch(query: string) {
  if (isDisabled.value) return;
  if (!dropdownVisible && !query) emit('open');
  else emit('search', query);
}

function handleVisibleChange(visible: boolean) {
  dropdownVisible = visible;
}

function handleRefresh() {
  if (!isDisabled.value && !props.loading) emit('refresh');
}
</script>

<style scoped>
.remote-search-select {
  width: 100%;
}

.remote-search-select__message {
  padding: 12px 20px;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.remote-search-select__footer,
.remote-search-select__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.remote-search-select__footer {
  color: var(--el-text-color-secondary);
  font-size: var(--el-font-size-small);
}

.remote-search-select__actions {
  justify-content: flex-end;
}

.remote-search-select__error {
  color: var(--el-color-danger);
}
</style>
