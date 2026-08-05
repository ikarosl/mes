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
      <el-form-item label="默认负责人"
        ><span>{{ stepRecord.defaultResponsibleUserName || '未配置' }}</span></el-form-item
      >
      <el-form-item label="实际负责人">
        <el-select
          v-model="form.responsibleUserId"
          clearable
          filterable
          placeholder="留空则使用默认负责人"
          @visible-change="(v: boolean) => v && $emit('refresh-users')"
        >
          <el-option
            v-for="choice in userChoices"
            :key="choice.value"
            :label="choice.option?.displayName ?? `${choice.value}（已失效）`"
            :value="choice.value"
            :disabled="choice.isUnavailable"
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
import { computed, reactive, watch } from 'vue';
import type { BatchStepRecordItem, TechnicalFileListItem, UserOption } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';

export type StepExecutionValue = {
  actualSopFileId: string | null;
  responsibleUserId: string | null;
};

const props = defineProps<{
  visible: boolean;
  stepRecord: BatchStepRecordItem | null;
  sopFileOptions: TechnicalFileListItem[];
  userOptions: UserOption[];
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'refresh-sop-files'): void;
  (e: 'refresh-users'): void;
  (e: 'save', data: StepExecutionValue): void;
}>();

/** 打开弹窗：刷新本弹窗实际需要的候选（SOP 文件 + 负责人），不刷新无关资源 */
const onOpen = (): void => {
  emit('refresh-sop-files');
  emit('refresh-users');
};

const form = reactive<StepExecutionValue>({
  actualSopFileId: null,
  responsibleUserId: null,
});

watch(
  () => props.stepRecord,
  (record) => {
    if (record) {
      form.actualSopFileId = record.actualSopFileId;
      form.responsibleUserId = record.responsibleUserId;
    }
  },
  { immediate: true },
);

/** 负责人下拉实时选项：已选负责人在候选被移除时显示「ID（已失效）」并禁用 */
const userChoices = computed(() =>
  buildLiveOptions(
    props.userOptions,
    form.responsibleUserId ? [form.responsibleUserId] : [],
    (user) => user.id,
  ),
);

const handleSubmit = (): void => {
  if (
    form.responsibleUserId &&
    hasUnavailableSelection(props.userOptions, [form.responsibleUserId], (user) => user.id)
  ) {
    EMessage.warning('所选负责人已失效，请重新选择');
    return;
  }
  emit('save', { ...form });
};
</script>
