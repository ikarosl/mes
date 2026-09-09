<template>
  <el-dialog
    :model-value="visible"
    :title="editingRouteId ? '编辑工艺路线' : '新增工艺路线'"
    :width="DialogWidth.md"
    @update:model-value="$emit('update:visible', $event)"
    @closed="resetForm"
  >
    <el-form
      class="dialog-form"
      label-width="112px"
      :model="form"
    >
      <el-form-item
        label="路线编号"
        required
      >
        <el-input
          v-model="form.routeCode"
          placeholder="例如：ROUTE-CIR-STD"
        />
      </el-form-item>
      <el-form-item
        label="路线名称"
        required
      >
        <el-input
          v-model="form.routeName"
          placeholder="例如：环形器标准工艺路线"
        />
      </el-form-item>
      <el-form-item label="版本">
        <el-input
          v-model="form.versionNo"
          placeholder="例如：V1.0"
        />
      </el-form-item>
      <el-form-item label="状态">
        <el-tag type="info">新路线以草稿保存，配置工序后再启用</el-tag>
      </el-form-item>
      <el-form-item label="备注">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="3"
          placeholder="可填写路线说明"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="handleSubmit"
        >保存路线</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';

export type RouteFormValue = {
  routeCode: string;
  routeName: string;
  versionNo: string;
  remark: string;
};

defineProps<{
  visible: boolean;
  editingRouteId: string | null;
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'save', data: RouteFormValue): void;
}>();

const initialForm = (): RouteFormValue => ({
  routeCode: '',
  routeName: '',
  versionNo: 'V1.0',
  remark: '',
});

const form = reactive<RouteFormValue>(initialForm());
const resetForm = (): void => {
  Object.assign(form, initialForm());
};

const setForm = (row: {
  routeCode: string;
  routeName: string;
  versionNo: string;
  remark: string | null;
}): void => {
  Object.assign(form, {
    routeCode: row.routeCode,
    routeName: row.routeName,
    versionNo: row.versionNo,
    remark: row.remark ?? '',
  });
};

const handleSubmit = (): void => {
  if (!form.routeCode.trim() || !form.routeName.trim()) {
    EMessage.warning('请填写路线编号和路线名称');
    return;
  }
  emit('save', {
    ...form,
    routeCode: form.routeCode.trim(),
    routeName: form.routeName.trim(),
  });
};

defineExpose({ setForm, resetForm });
</script>

<style scoped>
.dialog-form :deep(.el-input),
.dialog-form :deep(.el-select),
.dialog-form :deep(.el-textarea) {
  width: 100%;
}
</style>
