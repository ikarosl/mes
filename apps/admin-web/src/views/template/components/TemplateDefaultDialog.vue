<template>
  <el-dialog
    :model-value="visible"
    title="配置默认模板"
    :width="DialogWidth.lg"
    :before-close="beforeClose"
    :show-close="!saving && !pickerVisible"
    :close-on-press-escape="!saving && !pickerVisible"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form
      label-width="110px"
      :disabled="saving || loading"
      @submit.prevent="save"
    >
      <el-form-item label="业务场景">{{ sceneLabel }}</el-form-item>
      <el-form-item label="默认模板">
        <div class="selected-template">
          <span class="selected-template-name">{{ selected?.name || '未配置' }}</span>
          <el-button @click="pickerVisible = true">选择模板</el-button>
        </div>
      </el-form-item>
    </el-form>
    <p class="default-hint">默认模板须已启用填写规则，且包含数据行和输入列。</p>
    <el-alert
      v-if="selectionError"
      :title="selectionError"
      type="warning"
      :closable="false"
      show-icon
    />
    <JsonTableEditor
      v-if="selected"
      class="template-preview"
      :model-value="selected.content"
      readonly
    />
    <el-alert
      v-if="errorMessage"
      class="save-error"
      :title="errorMessage"
      type="error"
      :closable="false"
      show-icon
    />
    <template #footer>
      <el-button
        :disabled="saving || loading || pickerVisible"
        @click="reload"
        >重新加载配置</el-button
      >
      <el-button
        :disabled="saving || pickerVisible"
        @click="close"
        >取消</el-button
      >
      <el-button
        type="primary"
        :disabled="
          saving ||
          loading ||
          pickerVisible ||
          !currentReady ||
          !selected ||
          Boolean(selectionError)
        "
        :loading="saving"
        @click="save"
        >保存配置</el-button
      >
    </template>
  </el-dialog>
  <BusinessTemplatePicker
    v-model:visible="pickerVisible"
    mode="default"
    @select="selected = $event"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { BUSINESS_TEMPLATE_SCENE_LABELS, BUSINESS_TEMPLATE_STATUS } from '@company/constants';
import type { BusinessTemplateDefaultItem, BusinessTemplateItem } from '@company/contracts';
import { normalizeBusinessTemplateColumnRules } from '@company/utils';
import { businessTemplatesApi } from '../../../api/templates';
import JsonTableEditor from '../../../components/JsonTableEditor.vue';
import { useDraftCloseGuard } from '../../../composables/useDraftCloseGuard';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import BusinessTemplatePicker from './BusinessTemplatePicker.vue';

const props = defineProps<{ visible: boolean; item: BusinessTemplateDefaultItem | null }>();
const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'saved'): void;
}>();
const current = ref<BusinessTemplateDefaultItem | null>(null);
const currentReady = ref(false);
const selected = ref<BusinessTemplateItem | null>(null);
const baseline = ref<string | null>(null);
const saving = ref(false);
const loading = ref(false);
const pickerVisible = ref(false);
const errorMessage = ref('');
const reads = useLatestReadRequest(() => (loading.value = false));
const sceneLabel = computed(() =>
  current.value
    ? (BUSINESS_TEMPLATE_SCENE_LABELS[current.value.sceneCode] ?? current.value.sceneCode)
    : '',
);
const selectionError = computed(() => {
  if (!selected.value) return '';
  if (selected.value.status !== BUSINESS_TEMPLATE_STATUS.enabled)
    return '当前模板已停用，请重新选择';
  if (!selected.value.columnRules) return '当前模板尚未启用填写规则，请重新选择';
  try {
    normalizeBusinessTemplateColumnRules(selected.value.columnRules, selected.value.content);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : '当前模板填写规则无效，请重新选择';
  }
});
const assign = (item: BusinessTemplateDefaultItem): void => {
  current.value = item;
  currentReady.value = true;
  selected.value = item.template;
  baseline.value = item.templateId;
  errorMessage.value = '';
};
watch(
  () => props.visible,
  (visible) => {
    reads.invalidate();
    pickerVisible.value = false;
    if (visible && props.item) assign(props.item);
  },
);
const { close, beforeClose } = useDraftCloseGuard({
  visible: () => props.visible,
  busy: () => saving.value || pickerVisible.value,
  dirty: () => (selected.value?.id ?? null) !== baseline.value,
  label: '默认模板配置',
  onClose: () => emit('update:visible', false),
});
const reload = async (): Promise<void> => {
  const target = current.value;
  if (!target || !props.visible || saving.value || loading.value || pickerVisible.value) return;
  if ((selected.value?.id ?? null) !== baseline.value) {
    try {
      await RouteMessageBox.confirm('重新加载会放弃当前默认模板选择，确认继续？', '重新加载配置', {
        type: 'warning',
        confirmButtonText: '放弃并加载',
      });
    } catch {
      return;
    }
  }
  if (
    !props.visible ||
    current.value !== target ||
    saving.value ||
    pickerVisible.value ||
    !reads.isActive()
  )
    return;
  const { isCurrent, signal } = reads.begin(
    () => props.visible && current.value === target && !saving.value,
  );
  loading.value = true;
  currentReady.value = false;
  errorMessage.value = '';
  try {
    const defaults = await businessTemplatesApi.defaults(signal);
    if (!isCurrent()) return;
    const latest = defaults.find((item) => item.sceneCode === target.sceneCode);
    if (!latest) throw new Error('未找到业务场景配置，请刷新后重试');
    loading.value = false;
    assign(latest);
  } catch (error) {
    if (isCurrent())
      errorMessage.value = error instanceof Error ? error.message : '默认配置读取失败';
  } finally {
    if (isCurrent()) loading.value = false;
  }
};
const save = async (): Promise<void> => {
  const target = current.value;
  if (
    !target ||
    !selected.value ||
    !props.visible ||
    !currentReady.value ||
    !reads.isActive() ||
    saving.value ||
    loading.value ||
    pickerVisible.value ||
    selectionError.value
  )
    return;
  saving.value = true;
  errorMessage.value = '';
  try {
    await businessTemplatesApi.updateDefault(target.sceneCode, {
      templateId: selected.value.id,
      version: target.version,
    });
    EMessage.success('默认模板配置已保存');
    emit('update:visible', false);
    emit('saved');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '默认模板配置保存失败';
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.selected-template {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.selected-template-name {
  overflow-wrap: anywhere;
}
.default-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.template-preview,
.save-error {
  margin-top: 16px;
}
</style>
