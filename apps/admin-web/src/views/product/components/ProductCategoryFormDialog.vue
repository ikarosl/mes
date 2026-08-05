<template>
  <el-dialog
    :model-value="visible"
    :title="editingCategoryId ? '编辑分类' : '新增分类'"
    :width="DialogWidth.md"
    @update:model-value="$emit('update:visible', $event)"
    @closed="resetForm"
  >
    <el-form
      class="dialog-form"
      label-width="96px"
      :model="form"
    >
      <el-form-item
        label="分类编码"
        required
      >
        <el-input
          v-model="form.categoryCode"
          placeholder="例如：MAT-ELECTRONIC"
        />
      </el-form-item>
      <el-form-item
        label="分类名称"
        required
      >
        <el-input
          v-model="form.categoryName"
          placeholder="例如：电子物料"
        />
      </el-form-item>
      <el-form-item
        label="对象类型"
        required
      >
        <el-select
          v-model="form.itemKind"
          :disabled="Boolean(editingCategoryId)"
        >
          <el-option
            v-for="(label, value) in itemKindLabels"
            :key="value"
            :label="label"
            :value="value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="父分类">
        <el-select
          v-model="form.parentId"
          clearable
          placeholder="顶级分类"
          @visible-change="(visible: boolean) => visible && categorySource.refresh()"
        >
          <el-option
            v-for="choice in parentChoices"
            :key="choice.value"
            :label="
              choice.option
                ? `${choice.option.categoryCode} / ${choice.option.categoryName}`
                : `${choice.value}（已失效）`
            "
            :value="choice.value"
            :disabled="choice.isUnavailable"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-switch
          v-model="form.enabled"
          active-text="启用"
          inactive-text="停用"
        />
      </el-form-item>
      <el-form-item label="备注">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="3"
          placeholder="可填写分类说明"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="handleSubmit"
        >保存分类</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onActivated, reactive, watch } from 'vue';
import type { ProductCategoryPayload, ProductItemKind } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';
import { EMessage } from '../../../utils/message';
import { useProductCategoryOptions } from '../../../composables/options/useProductCategoryOptions';

const props = defineProps<{
  visible: boolean;
  editingCategoryId: string | null;
  itemKindLabels: Record<ProductItemKind, string>;
  submitting: boolean;
}>();
const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'save', payload: ProductCategoryPayload): void;
}>();

const form = reactive({
  parentId: '' as string,
  categoryCode: '',
  categoryName: '',
  itemKind: 'material' as ProductItemKind,
  enabled: true,
  remark: '',
});
const initialForm = () => ({
  parentId: '',
  categoryCode: '',
  categoryName: '',
  itemKind: 'material' as ProductItemKind,
  enabled: true,
  remark: '',
});
const resetForm = (): void => {
  Object.assign(form, initialForm());
};
const setForm = (row: {
  parentId: string | null;
  categoryCode: string;
  categoryName: string;
  itemKind: ProductItemKind;
  status: number;
  remark: string | null;
}): void => {
  Object.assign(form, {
    parentId: row.parentId ?? '',
    categoryCode: row.categoryCode,
    categoryName: row.categoryName,
    itemKind: row.itemKind,
    enabled: row.status === 1,
    remark: row.remark ?? '',
  });
};

/** 弹窗自持父分类候选：打开、重新激活、下拉展开时刷新；失败保留上次成功（P2a） */
const categorySource = useProductCategoryOptions();
const parentOptions = computed(() =>
  categorySource.options.value.filter(
    (item) => item.id !== props.editingCategoryId && item.itemKind === form.itemKind,
  ),
);
const parentChoices = computed(() =>
  buildLiveOptions(parentOptions.value, form.parentId ? [form.parentId] : [], (item) => item.id),
);
watch(
  () => props.visible,
  (visible) => {
    if (visible) void categorySource.refresh();
  },
);
onActivated(() => {
  if (props.visible) void categorySource.refresh();
});

const handleSubmit = (): void => {
  if (!form.categoryCode.trim() || !form.categoryName.trim()) {
    EMessage.warning('请填写分类编码和分类名称');
    return;
  }
  if (
    hasUnavailableSelection(
      parentOptions.value,
      form.parentId ? [form.parentId] : [],
      (item) => item.id,
    )
  ) {
    EMessage.warning('父分类已失效，请重新选择');
    return;
  }
  emit('save', {
    parentId: form.parentId || null,
    categoryCode: form.categoryCode,
    categoryName: form.categoryName,
    itemKind: form.itemKind,
    status: form.enabled ? 1 : 0,
    remark: form.remark || null,
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
