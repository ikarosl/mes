<template>
  <div class="specification-upload">
    <div class="file-row">
      <el-upload
        ref="uploader"
        class="drop-zone"
        drag
        action=""
        :accept="UPLOAD_ACCEPT"
        :show-file-list="false"
        :disabled="disabled || uploading"
        :before-upload="validate"
        :http-request="upload"
      >
        <div class="upload-content">
          <el-icon><Document v-if="modelValue" /><UploadFilled v-else /></el-icon>
          <span
            class="file-name"
            :title="modelValue?.originalName"
          >
            {{ uploading ? '正在上传…' : modelValue?.originalName || '拖拽文件到此处，或点击上传' }}
          </span>
          <span
            v-if="modelValue && !uploading"
            class="replace-hint"
            >拖拽或点击替换</span
          >
        </div>
      </el-upload>
      <div
        v-if="modelValue && !uploading"
        class="file-actions"
      >
        <el-button
          v-if="canPreviewFile(modelValue.originalName)"
          link
          type="primary"
          :loading="actions.pendingAction.value === 'preview'"
          :disabled="Boolean(actions.pendingAction.value)"
          @click="actions.preview"
          >预览</el-button
        >
        <el-button
          link
          type="primary"
          :loading="actions.pendingAction.value === 'download'"
          :disabled="Boolean(actions.pendingAction.value)"
          @click="actions.download"
          >下载</el-button
        >
      </div>
      <el-button
        v-if="uploading"
        link
        @click="cancel"
        >取消上传</el-button
      >
    </div>
    <el-progress
      v-if="uploading"
      :percentage="progress"
    />
    <span
      v-else-if="!modelValue"
      class="upload-hint"
    >
      PDF、Office 文档或图片，单个文件不超过 {{ TECHNICAL_FILE_MAX_SIZE_MIB }} MiB
    </span>
  </div>
</template>

<script setup lang="ts">
import { onDeactivated, onScopeDispose, ref, watch } from 'vue';
import { Document, UploadFilled } from '@element-plus/icons-vue';
import type { UploadInstance, UploadRawFile, UploadRequestOptions } from 'element-plus';
import type { TechnicalFileListItem } from '@company/contracts';
import { productApi } from '../../../api/product';
import { useTechnicalFileActions } from '../../../composables/useTechnicalFileActions';
import { canPreviewFile } from '../../../utils/file-preview';
import {
  TECHNICAL_FILE_MAX_SIZE_MIB,
  UPLOAD_ACCEPT,
  validateTechnicalFileUpload,
} from '../../../utils/file-validation';
import { EMessage } from '../../../utils/message';

const props = defineProps<{
  modelValue: Pick<TechnicalFileListItem, 'id' | 'originalName'> | null;
  active: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  (event: 'update:modelValue', file: Pick<TechnicalFileListItem, 'id' | 'originalName'>): void;
  (event: 'uploading', value: boolean): void;
}>();
const uploader = ref<UploadInstance>();
const uploading = ref(false);
const progress = ref(0);
const actions = useTechnicalFileActions(
  () => props.modelValue,
  () => props.active,
);
let controller: AbortController | undefined;
const stop = (): void => {
  controller?.abort();
  controller = undefined;
  uploading.value = false;
  emit('uploading', false);
  uploader.value?.clearFiles();
};
const cancel = (): void => {
  stop();
  EMessage.info('上传已取消，可重新选择文件');
};
const validate = (file: UploadRawFile): boolean => {
  if (!props.active || props.disabled || uploading.value) return false;
  const message = validateTechnicalFileUpload(file);
  if (message) EMessage.warning(message);
  return !message;
};
const upload = async ({ file }: UploadRequestOptions): Promise<void> => {
  if (!props.active || props.disabled || uploading.value) return;
  const current = new AbortController();
  controller = current;
  uploading.value = true;
  progress.value = 0;
  emit('uploading', true);
  try {
    const result = await productApi.uploadTechnicalFile(
      file,
      { fileType: 'specification' },
      {
        signal: current.signal,
        onUploadProgress: (value) => {
          if (controller === current) progress.value = value;
        },
      },
    );
    if (controller === current && props.active)
      emit('update:modelValue', { id: result.id, originalName: file.name });
  } catch (error) {
    if (controller === current) EMessage.error(error, '规格书上传失败，请重新选择文件');
  } finally {
    if (controller === current) stop();
  }
};
watch(() => props.active, stop, { flush: 'sync' });
onDeactivated(stop);
onScopeDispose(stop);
</script>

<style scoped>
.specification-upload {
  width: 100%;
  min-width: 0;
}
.file-row,
.upload-content,
.file-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.drop-zone {
  flex: 1;
  min-width: 0;
}
.drop-zone :deep(.el-upload) {
  width: 100%;
}
.drop-zone :deep(.el-upload-dragger) {
  width: 100%;
  padding: 10px 14px;
}
.upload-content {
  min-height: 24px;
  line-height: 24px;
  text-align: left;
}
.upload-content .el-icon {
  flex-shrink: 0;
  font-size: 20px;
  color: var(--el-color-primary);
}
.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.replace-hint {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--el-color-primary);
  font-size: 12px;
}
.upload-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 24px;
}
.file-actions {
  flex-shrink: 0;
}
.file-actions .el-button {
  margin: 0;
}
@media (max-width: 720px) {
  .upload-content {
    flex-wrap: wrap;
    gap: 4px 8px;
  }
  .replace-hint {
    margin-left: 0;
  }
}
</style>
