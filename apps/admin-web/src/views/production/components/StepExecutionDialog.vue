<template>
  <el-dialog
    :model-value="visible"
    title="调整工序执行参数"
    :width="DialogWidth.md"
    @update:model-value="$emit('update:visible', $event)"
    @open="onOpen"
  >
    <el-form
      v-if="stepRecord"
      label-width="110px"
      :disabled="submitting"
    >
      <el-form-item label="工序"
        ><span>{{ stepRecord.stepName }}</span></el-form-item
      >
      <el-form-item label="默认参考文件"
        ><span>{{ stepRecord.defaultSopFileName || '未配置' }}</span></el-form-item
      >
      <el-form-item label="实际参考文件">
        <el-select
          v-model="form.actualSopFileId"
          clearable
          filterable
          placeholder="留空则使用默认文件"
          @visible-change="(v: boolean) => v && $emit('refresh-sop-files')"
        >
          <el-option
            v-for="file in sopFileOptions"
            :key="file.id"
            :label="file.fileName"
            :value="file.id"
          />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="handleSubmit"
        >保存</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import type { BatchStepRecordItem, TechnicalFileListItem } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';

export type StepExecutionValue = {
  actualSopFileId: string | null;
};

const props = defineProps<{
  visible: boolean;
  stepRecord: BatchStepRecordItem | null;
  sopFileOptions: TechnicalFileListItem[];
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'refresh-sop-files'): void;
  (e: 'save', data: StepExecutionValue): void;
}>();

/** 打开弹窗：刷新本弹窗实际需要的候选（SOP 文件 + 负责人），不刷新无关资源 */
const onOpen = (): void => {
  emit('refresh-sop-files');
};

const form = reactive<StepExecutionValue>({
  actualSopFileId: null,
});

watch(
  () => props.stepRecord,
  (record) => {
    if (record) {
      form.actualSopFileId = record.actualSopFileId;
    }
  },
  { immediate: true },
);

const handleSubmit = (): void => {
  emit('save', { ...form });
};
</script>
