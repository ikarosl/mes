<template>
  <div class="specification-upload">
    <SpecificationFileList
      :files="modelValue"
      :active="active"
      removable
      :disabled="disabled || uploading"
      @remove="remove"
    />
    <div class="upload-toolbar">
      <el-upload
        ref="uploader"
        class="drop-zone"
        drag
        multiple
        action=""
        :accept="UPLOAD_ACCEPT"
        :show-file-list="false"
        :auto-upload="false"
        :limit="remaining"
        :disabled="disabled || uploading || remaining === 0"
        :on-change="selectFile"
        :on-exceed="exceed"
      >
        <div class="upload-content">
          <el-icon><UploadFilled /></el-icon>
          <span>{{ uploadLabel }}</span>
        </div>
      </el-upload>
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
    <div
      class="upload-hint"
      role="status"
    >
      已上传 {{ modelValue.length }} / {{ SPECIFICATION_FILE_MAX_COUNT }} 个；支持
      PDF、Office、图片、DWG、DXF，单文件不超过 {{ TECHNICAL_FILE_MAX_SIZE_MIB }} MB。 CAD
      文件支持下载。保存资料后关联生效。
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onDeactivated, onScopeDispose, ref, watch } from 'vue';
import { UploadFilled } from '@element-plus/icons-vue';
import type { UploadFile, UploadInstance, UploadRawFile } from 'element-plus';
import type { TechnicalFileListItem } from '@company/contracts';
import { SPECIFICATION_FILE_MAX_COUNT } from '@company/constants';
import { productApi } from '../../../api/product';
import {
  TECHNICAL_FILE_MAX_SIZE_MIB,
  UPLOAD_ACCEPT,
  validateTechnicalFileUpload,
} from '../../../utils/file-validation';
import { EMessage } from '../../../utils/message';
import SpecificationFileList from './SpecificationFileList.vue';

type SpecificationFile = Pick<TechnicalFileListItem, 'id' | 'originalName'>;
const props = defineProps<{
  modelValue: SpecificationFile[];
  active: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  (event: 'update:modelValue', files: SpecificationFile[]): void;
  (event: 'uploading', value: boolean): void;
}>();
const uploader = ref<UploadInstance>();
const uploading = ref(false);
const progress = ref(0);
const currentName = ref('');
const remaining = computed(() =>
  Math.max(0, SPECIFICATION_FILE_MAX_COUNT - props.modelValue.length),
);
const uploadLabel = computed(() => {
  if (uploading.value) return `正在上传：${currentName.value}`;
  if (remaining.value === 0) return '已达到文件数量上限';
  return '拖拽文件到此处，或点击选择（可多选）';
});
let controller: AbortController | undefined;
let queue: UploadRawFile[] = [];
const stop = (): void => {
  controller?.abort();
  controller = undefined;
  queue = [];
  currentName.value = '';
  uploading.value = false;
  emit('uploading', false);
  uploader.value?.clearFiles();
};
const cancel = (): void => {
  stop();
  EMessage.info('已取消后续上传，已上传的文件仍保留在当前表单');
};
const exceed = (): void => {
  EMessage.warning(
    `最多关联 ${SPECIFICATION_FILE_MAX_COUNT} 个文件，本次还可选择 ${remaining.value} 个`,
  );
};
const remove = (id: string): void => {
  if (!props.active || props.disabled || uploading.value) return;
  emit(
    'update:modelValue',
    props.modelValue.filter((file) => file.id !== id),
  );
};
const selectFile = (file: UploadFile): void => {
  if (!file.raw || !props.active || props.disabled) return;
  const message = validateTechnicalFileUpload(file.raw);
  if (message) {
    EMessage.warning(message);
    uploader.value?.handleRemove(file);
    return;
  }
  if (
    props.modelValue.length + queue.length + (currentName.value ? 1 : 0) >=
    SPECIFICATION_FILE_MAX_COUNT
  ) {
    exceed();
    uploader.value?.handleRemove(file);
    return;
  }
  queue.push(file.raw);
  if (!uploading.value) void uploadQueue();
};
const uploadQueue = async (): Promise<void> => {
  const current = new AbortController();
  controller = current;
  uploading.value = true;
  emit('uploading', true);
  const uploaded = [...props.modelValue];
  try {
    while (queue.length && controller === current && props.active) {
      const file = queue.shift()!;
      currentName.value = file.name;
      progress.value = 0;
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
        if (controller !== current || !props.active) return;
        uploaded.push({ id: result.id, originalName: file.name });
        emit('update:modelValue', [...uploaded]);
      } catch (error) {
        if (controller !== current) return;
        EMessage.error(error, `${file.name} 上传失败，请重新选择该文件`);
      }
    }
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
.upload-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}
.drop-zone {
  flex: 1;
  min-width: 0;
}
.drop-zone :deep(.el-upload),
.drop-zone :deep(.el-upload-dragger) {
  width: 100%;
}
.drop-zone :deep(.el-upload-dragger) {
  padding: 10px 14px;
}
.upload-content {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 24px;
  line-height: 24px;
  text-align: left;
  overflow-wrap: anywhere;
}
.upload-content .el-icon {
  flex-shrink: 0;
  font-size: 20px;
  color: var(--el-color-primary);
}
.upload-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 22px;
  margin-top: 4px;
}
</style>
