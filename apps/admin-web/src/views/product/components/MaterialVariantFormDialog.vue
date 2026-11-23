<template>
  <el-dialog
    :model-value="visible"
    :title="variant ? '管理规格文件' : '新增物料版本'"
    :width="DialogWidth.md"
    :close-on-press-escape="!busy"
    :show-close="!busy"
    :before-close="beforeClose"
    @update:model-value="$emit('update:visible', $event)"
    @closed="visible || resetForm()"
  >
    <el-form label-width="96px">
      <el-form-item label="基础物料">
        <strong>{{ material?.materialCode }} · {{ material?.materialName }}</strong>
      </el-form-item>
      <el-form-item
        v-if="variant"
        label="版本编码"
      >
        {{ variant.variantCode }}
      </el-form-item>
      <template v-else>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item
              label="大版本"
              required
            >
              <el-input
                v-model="form.majorVersion"
                maxlength="32"
                placeholder="例如 v1"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item
              label="小版本"
              required
            >
              <el-input
                v-model="form.minorVersion"
                maxlength="32"
                placeholder="例如 A"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="版本编码">
          <el-input
            :model-value="variantCodePreview"
            disabled
          />
        </el-form-item>
      </template>
      <el-form-item
        label="规格书"
        required
      >
        <SpecificationUpload
          :key="variant?.id ?? material?.id"
          v-model="specificationFiles"
          :active="visible"
          :disabled="submitting"
          @uploading="uploading = $event"
        />
      </el-form-item>
      <el-form-item
        v-if="!variant"
        label="备注"
      >
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="2"
          maxlength="5000"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button
        :disabled="busy"
        @click="close"
        >取消</el-button
      >
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="submit"
      >
        {{ variant ? '保存规格书' : '保存版本' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { sameStringSet } from '@company/utils';
import { computed, reactive, ref, watch } from 'vue';
import type {
  MaterialListItem,
  MaterialVariantItem,
  MaterialVariantPayload,
  MaterialVariantSpecificationPayload,
  TechnicalFileListItem,
} from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { useDraftCloseGuard } from '../../../composables/useDraftCloseGuard';
import SpecificationUpload from './SpecificationUpload.vue';

export type MaterialVariantFormValue = Omit<MaterialVariantPayload, 'materialId'>;
const props = defineProps<{
  visible: boolean;
  material: MaterialListItem | null;
  variant: MaterialVariantItem | null;
  submitting: boolean;
}>();
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'save', value: MaterialVariantFormValue): void;
  (e: 'save-specification', value: MaterialVariantSpecificationPayload): void;
}>();
const form = reactive({ majorVersion: '', minorVersion: '', remark: '' });
const specificationFiles = ref<Pick<TechnicalFileListItem, 'id' | 'originalName'>[]>([]);
const expectedFileIds = ref<string[]>([]);
const uploading = ref(false);
const busy = computed(() => props.submitting || uploading.value);
const { close, beforeClose } = useDraftCloseGuard({
  visible: () => props.visible,
  busy: () => busy.value,
  dirty: () =>
    Boolean(form.majorVersion || form.minorVersion || form.remark) ||
    !sameStringSet(
      specificationFiles.value.map((file) => file.id),
      expectedFileIds.value,
    ),
  label: '物料版本资料',
  onClose: () => emit('update:visible', false),
});
const canSubmit = computed(() => {
  if (busy.value || !specificationFiles.value.length) return false;
  return props.variant
    ? !sameStringSet(
        specificationFiles.value.map((file) => file.id),
        expectedFileIds.value,
      )
    : Boolean(props.material && form.majorVersion.trim() && form.minorVersion.trim());
});
const variantCodePreview = computed(() =>
  props.material && form.majorVersion.trim() && form.minorVersion.trim()
    ? `${props.material.materialCode}-${form.majorVersion.trim()}-${form.minorVersion.trim()}`
    : '填写大小版本后生成',
);
const resetForm = (): void => {
  Object.assign(form, { majorVersion: '', minorVersion: '', remark: '' });
  specificationFiles.value = [...(props.variant?.specificationFiles ?? [])];
  expectedFileIds.value = [...(props.variant?.specificationFileIds ?? [])];
};
watch(
  () => props.visible,
  (visible) => {
    if (visible) resetForm();
  },
);
const submit = (): void => {
  if (!canSubmit.value || !specificationFiles.value.length) return;
  if (props.variant) {
    emit('save-specification', {
      specificationFileIds: specificationFiles.value.map((file) => file.id),
      expectedSpecificationFileIds: expectedFileIds.value,
    });
  } else {
    emit('save', {
      majorVersion: form.majorVersion.trim(),
      minorVersion: form.minorVersion.trim(),
      remark: form.remark.trim() || null,
      specificationFileIds: specificationFiles.value.map((file) => file.id),
    });
  }
};
</script>
