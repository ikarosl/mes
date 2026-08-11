<template>
  <el-dialog
    :model-value="visible"
    :title="mode === 'assign' ? '工序派工' : '工序改派'"
    :width="DialogWidth.sm"
    @update:model-value="$emit('update:visible', $event)"
    @open="$emit('refresh-users')"
  >
    <el-form
      v-if="stepRecord"
      label-width="100px"
      :disabled="submitting"
    >
      <el-form-item label="工序">
        <span>{{ stepRecord.stepOrder }}. {{ stepRecord.stepName }}</span>
      </el-form-item>
      <el-form-item label="当前负责人">
        <span>{{ stepRecord.responsibleUserName || '尚未派工' }}</span>
      </el-form-item>
      <el-form-item
        label="派工员工"
        required
      >
        <el-select
          v-model="responsibleUserId"
          filterable
          placeholder="请选择现场执行员工"
          @visible-change="(value: boolean) => value && $emit('refresh-users')"
        >
          <el-option
            v-for="user in userOptions"
            :key="user.id"
            :label="user.displayName"
            :value="user.id"
          />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!responsibleUserId"
        @click="submit"
      >
        {{ mode === 'assign' ? '确认派工' : '确认改派' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { BatchStepRecordItem, UserOption } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';

const props = defineProps<{
  visible: boolean;
  mode: 'assign' | 'reassign';
  stepRecord: BatchStepRecordItem | null;
  userOptions: UserOption[];
  submitting: boolean;
}>();
const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'refresh-users'): void;
  (event: 'submit', responsibleUserId: string): void;
}>();
const responsibleUserId = ref('');

watch(
  () => [props.visible, props.stepRecord, props.mode] as const,
  ([visible, stepRecord, mode]) => {
    if (visible)
      responsibleUserId.value = mode === 'reassign' ? (stepRecord?.responsibleUserId ?? '') : '';
  },
  { immediate: true },
);

const submit = (): void => {
  if (responsibleUserId.value) emit('submit', responsibleUserId.value);
};
</script>

<style scoped>
:deep(.el-select) {
  width: 100%;
}
</style>
