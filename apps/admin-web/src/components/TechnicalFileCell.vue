<template>
  <div v-if="fileName">
    <div
      class="file-name"
      :title="fileName"
    >
      {{ fileName }}
    </div>
    <div class="file-actions">
      <el-button
        v-if="canPreviewFile(fileName)"
        link
        type="primary"
        :loading="pendingAction === 'preview'"
        :disabled="disabled || Boolean(pendingAction)"
        @click="$emit('preview')"
        >预览</el-button
      >
      <el-button
        link
        type="primary"
        :loading="pendingAction === 'download'"
        :disabled="disabled || Boolean(pendingAction)"
        @click="$emit('download')"
        >下载</el-button
      >
    </div>
  </div>
  <span
    v-else
    class="empty-file"
    >未上传</span
  >
</template>

<script setup lang="ts">
import { canPreviewFile } from '../utils/file-preview';

defineProps<{
  fileName: string | null;
  pendingAction?: 'preview' | 'download' | null;
  disabled?: boolean;
}>();
defineEmits<{ (event: 'preview'): void; (event: 'download'): void }>();
</script>

<style scoped>
.file-name {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  white-space: normal;
  line-height: 20px;
}
.file-actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}
.file-actions .el-button {
  margin-left: 0;
  padding: 0;
}
.empty-file {
  color: var(--el-text-color-secondary);
}
</style>
