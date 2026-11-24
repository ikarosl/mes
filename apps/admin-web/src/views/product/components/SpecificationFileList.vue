<template>
  <div class="specification-files">
    <div
      v-for="file in files"
      :key="file.id"
      class="file-row"
    >
      <span
        class="file-name"
        :title="file.originalName"
        >{{ file.originalName }}</span
      >
      <div class="file-actions">
        <el-button
          v-if="canPreviewFile(file.originalName)"
          link
          type="primary"
          :loading="selectedId === file.id && actions.pendingAction.value === 'preview'"
          :disabled="Boolean(actions.pendingAction.value)"
          @click="run(file.id, 'preview')"
          >预览</el-button
        >
        <el-button
          link
          type="primary"
          :loading="selectedId === file.id && actions.pendingAction.value === 'download'"
          :disabled="Boolean(actions.pendingAction.value)"
          @click="run(file.id, 'download')"
          >下载</el-button
        >
        <el-button
          v-if="removable"
          link
          type="danger"
          :disabled="disabled"
          :aria-label="`移除 ${file.originalName}`"
          @click="$emit('remove', file.id)"
          >移除</el-button
        >
      </div>
    </div>
    <span
      v-if="!files.length"
      class="empty-file"
      >未上传</span
    >
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { TechnicalFileListItem } from '@company/contracts';
import { canPreviewFile } from '../../../utils/file-preview';
import { useTechnicalFileActions } from '../../../composables/useTechnicalFileActions';

const props = withDefaults(
  defineProps<{
    files: Pick<TechnicalFileListItem, 'id' | 'originalName'>[];
    active?: boolean;
    removable?: boolean;
    disabled?: boolean;
  }>(),
  { active: true },
);
defineEmits<{ (event: 'remove', id: string): void }>();
const selectedId = ref<string | null>(null);
const actions = useTechnicalFileActions(
  () => props.files.find((file) => file.id === selectedId.value) ?? null,
  () => props.active,
);
const run = (id: string, action: 'preview' | 'download'): void => {
  if (actions.pendingAction.value) return;
  selectedId.value = id;
  void actions[action]();
};
</script>

<style scoped>
.specification-files {
  width: 100%;
  min-width: 0;
}
.file-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 4px 0;
}
.file-name {
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 20px;
}
.file-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}
.file-actions .el-button {
  margin: 0;
}
.empty-file {
  color: var(--el-text-color-secondary);
}
</style>
