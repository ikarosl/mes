<template>
  <div class="abnormality-labels">
    <div
      class="tag-input"
      :class="{ 'is-disabled': isDisabled || readonly, 'is-readonly': readonly }"
      role="group"
      aria-label="异常描述标签"
      @click.self="focusInput"
    >
      <el-tooltip
        v-for="label in modelValue"
        :key="label"
        :content="label"
        :trigger="['hover', 'focus']"
        :show-after="250"
        :popper-style="labelTooltipStyle"
        effect="light"
        placement="top"
      >
        <button
          type="button"
          class="label-pill is-selected"
          :disabled="!readonly && isDisabled"
          :aria-disabled="readonly || undefined"
          :aria-label="readonly ? label : `移除描述：${label}`"
          @click="remove(label)"
        >
          <span class="label-text">{{ label }}</span>
          <el-icon
            v-if="!readonly"
            aria-hidden="true"
            ><Close
          /></el-icon>
        </button>
      </el-tooltip>
      <el-input
        v-if="!readonly"
        ref="inputRef"
        class="tag-entry"
        :model-value="inputValue"
        :disabled="isDisabled"
        placeholder="输入异常描述，回车添加"
        aria-label="输入异常描述，回车添加"
        clearable
        @update:model-value="updateInput"
        @compositionstart="composing = true"
        @compositionend="composing = false"
        @keydown.enter="addOnEnter"
      />
    </div>
    <p
      v-if="!readonly && inputIssue"
      class="label-message"
      role="status"
    >
      {{ inputIssue }}
    </p>
    <div
      v-if="!readonly"
      class="history-labels"
      role="group"
      aria-label="可多选的历史异常描述"
      :aria-busy="loading"
    >
      <span
        v-if="error"
        class="label-message label-error"
        role="status"
        >历史标签加载失败</span
      >
      <span
        v-else-if="loading && !options.length"
        class="label-message"
        role="status"
        >加载中…</span
      >
      <span
        v-else-if="!hasLoaded"
        class="label-message"
        role="status"
        >历史标签未加载</span
      >
      <span
        v-else-if="!options.length"
        class="label-message"
        role="status"
        >{{ inputValue.trim() ? '无匹配标签' : '暂无历史标签' }}</span
      >
      <el-tooltip
        v-for="label in options"
        :key="label"
        :content="label"
        :trigger="['hover', 'focus']"
        :show-after="250"
        :popper-style="labelTooltipStyle"
        effect="light"
        placement="top"
      >
        <button
          type="button"
          class="label-pill"
          :class="{ 'is-selected': modelValue.includes(label) }"
          :disabled="isDisabled || loading || (atLimit && !modelValue.includes(label))"
          :aria-pressed="modelValue.includes(label)"
          @click="toggle(label)"
        >
          <el-icon
            v-if="modelValue.includes(label)"
            aria-hidden="true"
            ><Check
          /></el-icon>
          <span class="label-text">{{ label }}</span>
        </button>
      </el-tooltip>
      <el-button
        link
        class="history-refresh"
        :icon="Refresh"
        :disabled="isDisabled || loading"
        :loading="loading"
        :aria-label="error ? '重试历史标签' : '刷新历史标签'"
        :title="error ? '重试历史标签' : '刷新历史标签'"
        @click="refresh"
      />
      <el-button
        v-if="hasMore && !error"
        link
        type="primary"
        :disabled="isDisabled || loading"
        @click="loadMore"
        >加载更多</el-button
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, ref, type CSSProperties } from 'vue';
import { formContextKey, type InputInstance } from 'element-plus';
import { Check, Close, Refresh } from '@element-plus/icons-vue';
import {
  PRODUCTION_TRACKING_ABNORMALITY_LABEL_LIMIT,
  PRODUCTION_TRACKING_ABNORMALITY_LABEL_MAX_LENGTH,
} from '@company/constants';

defineOptions({ name: 'TrackingAbnormalityLabels' });
const props = withDefaults(
  defineProps<{
    modelValue: string[];
    inputValue?: string;
    options?: string[];
    loading?: boolean;
    error?: boolean;
    hasLoaded?: boolean;
    hasMore?: boolean;
    disabled?: boolean;
    readonly?: boolean;
  }>(),
  {
    inputValue: '',
    options: () => [],
    loading: false,
    error: false,
    hasLoaded: false,
    hasMore: false,
    disabled: false,
    readonly: false,
  },
);
const emit = defineEmits<{
  'update:modelValue': [labels: string[]];
  search: [value: string];
  refresh: [];
  loadMore: [];
}>();
const form = inject(formContextKey, undefined);
const isDisabled = computed(() => props.disabled || Boolean(form?.disabled));
const composing = ref(false);
const inputRef = ref<InputInstance>();
const labelLimit = PRODUCTION_TRACKING_ABNORMALITY_LABEL_LIMIT;
const atLimit = computed(() => props.modelValue.length >= labelLimit);
const newLabel = computed(() =>
  props.options.includes(props.inputValue) ? props.inputValue : props.inputValue.trim(),
);
const inputIssue = computed(() => {
  if (!newLabel.value.trim()) return '';
  if (Array.from(newLabel.value).length > PRODUCTION_TRACKING_ABNORMALITY_LABEL_MAX_LENGTH)
    return `每条描述最多 ${PRODUCTION_TRACKING_ABNORMALITY_LABEL_MAX_LENGTH} 字，请缩短后再添加。`;
  if (props.modelValue.includes(newLabel.value)) return '该描述已选中。';
  if (atLimit.value) return `最多选择 ${labelLimit} 条描述，请先移除不需要的描述。`;
  return '';
});
const canAdd = computed(
  () => !props.readonly && !isDisabled.value && Boolean(newLabel.value.trim()) && !inputIssue.value,
);
const labelTooltipStyle: CSSProperties = {
  maxWidth: 'min(560px, calc(100vw - 48px))',
  maxHeight: '240px',
  boxSizing: 'border-box',
  overflowX: 'hidden',
  overflowY: 'auto',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
};

function updateInput(value: string): void {
  if (!props.readonly && !isDisabled.value) emit('search', value);
}
function focusInput(): void {
  if (!props.readonly && !isDisabled.value) inputRef.value?.focus();
}
function add(): void {
  if (!canAdd.value || composing.value) return;
  emit('update:modelValue', [...props.modelValue, newLabel.value]);
  emit('search', '');
  void nextTick(() => inputRef.value?.input?.scrollIntoView({ block: 'nearest' }));
}
function addOnEnter(event: KeyboardEvent): void {
  if (composing.value || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  add();
}
function remove(label: string): void {
  if (!props.readonly && !isDisabled.value)
    emit(
      'update:modelValue',
      props.modelValue.filter((selected) => selected !== label),
    );
}
function toggle(label: string): void {
  if (props.readonly || isDisabled.value || props.loading) return;
  if (props.modelValue.includes(label)) remove(label);
  else if (!atLimit.value) {
    emit('update:modelValue', [...props.modelValue, label]);
    if (props.inputValue) emit('search', '');
  }
}
function refresh(): void {
  if (!props.readonly && !isDisabled.value && !props.loading) emit('refresh');
}
function loadMore(): void {
  if (!props.readonly && !isDisabled.value && !props.loading) emit('loadMore');
}
</script>

<style scoped>
.abnormality-labels {
  width: 100%;
  min-width: 0;
  max-height: 180px;
  overflow-x: hidden;
  overflow-y: auto;
  scroll-padding-block: 3px;
  line-height: 1.5;
}
.tag-input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  min-height: 32px;
  padding: 3px 8px;
  box-sizing: border-box;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-blank);
  transition: border-color 0.2s;
}
.tag-input:hover:not(.is-disabled) {
  border-color: var(--el-border-color-hover);
}
.tag-input:focus-within:not(.is-disabled) {
  border-color: var(--el-color-primary);
}
.tag-input.is-disabled {
  background: var(--el-disabled-bg-color);
  cursor: not-allowed;
}
.tag-input.is-readonly,
.tag-input.is-readonly .label-pill {
  cursor: default;
}
.tag-entry {
  flex: 1;
  min-width: min(180px, 100%);
}
.tag-entry :deep(.el-input__wrapper) {
  padding: 0;
  background: transparent;
  box-shadow: none;
}
.tag-entry :deep(.el-input__inner) {
  height: 24px;
  line-height: 24px;
}
.label-message {
  color: var(--el-text-color-secondary);
  font-size: var(--el-font-size-small);
}
.abnormality-labels > .label-message {
  margin: 6px 0 0;
}
.history-labels {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 3px;
}
.label-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: calc((100% - 8px) / 2);
  box-sizing: border-box;
  padding: 2px 6px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font: inherit;
  font-size: var(--el-font-size-small);
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
}
.label-pill.is-selected {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.label-pill:hover:enabled:not([aria-disabled='true']) {
  border-color: var(--el-color-primary);
}
.label-pill:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 1px;
}
.label-pill:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.label-pill .el-icon {
  flex: 0 0 auto;
}
.label-text {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.label-error {
  color: var(--el-color-danger);
}
.history-labels .el-button + .el-button {
  margin-left: 0;
}
.history-refresh {
  padding: 3px;
}
</style>
