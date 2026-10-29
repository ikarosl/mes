<template>
  <el-dialog
    :model-value="visible"
    :title="item ? '编辑模板' : '创建模板'"
    :width="DialogWidth.lg"
    :before-close="beforeClose"
    :show-close="!saving"
    :close-on-press-escape="!saving"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form
      label-width="88px"
      :disabled="saving"
      @submit.prevent
    >
      <div class="template-basics">
        <el-form-item
          label="模板名称"
          required
          ><el-input
            v-model="draft.name"
            maxlength="100"
            placeholder="例如：设备点检表"
        /></el-form-item>
        <el-form-item label="状态"
          ><el-switch
            v-model="enabled"
            active-text="启用"
            inactive-text="停用"
        /></el-form-item>
      </div>
      <JsonTableEditor
        v-if="visible"
        v-model="draft.content"
        :disabled="saving"
      />
    </el-form>
    <el-alert
      v-if="errorMessage"
      class="save-error"
      :title="errorMessage"
      type="error"
      :closable="false"
      show-icon
    />
    <template #footer
      ><el-button
        :disabled="saving"
        @click="close"
        >取消</el-button
      ><el-button
        type="primary"
        :loading="saving"
        :disabled="saving"
        @click="save"
        >保存模板</el-button
      ></template
    >
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { BUSINESS_TEMPLATE_STATUS } from '@company/constants';
import type { BusinessTemplateItem, BusinessTemplatePayload } from '@company/contracts';
import { normalizeJsonTable } from '@company/utils';
import { businessTemplatesApi } from '../../../api/templates';
import JsonTableEditor from '../../../components/JsonTableEditor.vue';
import { useDraftCloseGuard } from '../../../composables/useDraftCloseGuard';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
const props = defineProps<{ visible: boolean; item: BusinessTemplateItem | null }>();
const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'saved'): void;
}>();
const emptyDraft = (): BusinessTemplatePayload => ({
  name: '',
  status: BUSINESS_TEMPLATE_STATUS.enabled,
  content: { columns: [], rows: [] },
});
const draft = reactive(emptyDraft());
const baseline = ref('');
const saving = ref(false);
const errorMessage = ref('');
const enabled = computed({
  get: () => draft.status === BUSINESS_TEMPLATE_STATUS.enabled,
  set: (value) =>
    (draft.status = value ? BUSINESS_TEMPLATE_STATUS.enabled : BUSINESS_TEMPLATE_STATUS.disabled),
});
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    Object.assign(
      draft,
      props.item
        ? {
            name: props.item.name,
            status: props.item.status,
            content: normalizeJsonTable(props.item.content),
          }
        : emptyDraft(),
    );
    baseline.value = JSON.stringify(draft);
    errorMessage.value = '';
  },
);
const { close, beforeClose } = useDraftCloseGuard({
  visible: () => props.visible,
  busy: () => saving.value,
  dirty: () => JSON.stringify(draft) !== baseline.value,
  label: '模板配置',
  onClose: () => emit('update:visible', false),
});
const save = async (): Promise<void> => {
  if (saving.value || !props.visible) return;
  let payload: BusinessTemplatePayload;
  try {
    if (!draft.name.trim()) throw new Error('请填写模板名称');
    if (!draft.content.columns.length) throw new Error('请至少配置一列');
    payload = {
      name: draft.name.trim(),
      status: draft.status,
      content: normalizeJsonTable(draft.content),
    };
  } catch (error) {
    EMessage.warning(error instanceof Error ? error.message : '请检查模板配置');
    return;
  }
  saving.value = true;
  errorMessage.value = '';
  try {
    if (props.item)
      await businessTemplatesApi.update(props.item.id, { ...payload, version: props.item.version });
    else await businessTemplatesApi.create(payload);
    EMessage.success('模板已保存');
    emit('update:visible', false);
    emit('saved');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '模板保存失败';
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.template-basics {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 20px;
}
.save-error {
  margin-top: 16px;
}
@media (max-width: 760px) {
  .template-basics {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
