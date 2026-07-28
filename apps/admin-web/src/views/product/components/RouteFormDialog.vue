<template>
  <el-dialog
    :model-value="visible"
    :title="editingRouteId ? '编辑工艺路线' : '新增工艺路线'"
    :width="DialogWidth.md"
    @update:model-value="$emit('update:visible', $event)"
    @open="$emit('refresh-options')"
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
      <el-form-item
        label="适用产品"
        required
      >
        <el-select
          v-model="form.productId"
          filterable
          placeholder="请选择产品"
          @visible-change="(visible: boolean) => visible && $emit('refresh-options')"
        >
          <el-option
            v-for="choice in productChoices"
            :key="choice.value"
            :label="
              choice.option
                ? `${choice.option.itemCode} / ${choice.option.productName}`
                : `${choice.value}（已失效）`
            "
            :value="choice.value"
            :disabled="choice.isUnavailable"
          />
        </el-select>
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
import { computed, reactive } from 'vue';
import type { ProductOption } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';
import { EMessage } from '../../../utils/message';

export type RouteFormValue = {
  routeCode: string;
  routeName: string;
  productId: string;
  versionNo: string;
  remark: string;
};

const props = defineProps<{
  visible: boolean;
  editingRouteId: string | null;
  productOptions: ProductOption[];
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'refresh-options'): void;
  (e: 'save', data: RouteFormValue): void;
}>();

const initialForm = (): RouteFormValue => ({
  routeCode: '',
  routeName: '',
  productId: '',
  versionNo: 'V1.0',
  remark: '',
});

const form = reactive<RouteFormValue>(initialForm());
const productChoices = computed(() =>
  buildLiveOptions(props.productOptions, form.productId ? [form.productId] : [], (item) => item.id),
);

const resetForm = (): void => {
  Object.assign(form, initialForm());
};

const setForm = (row: {
  routeCode: string;
  routeName: string;
  productId: string | null;
  versionNo: string;
  remark: string | null;
}): void => {
  Object.assign(form, {
    routeCode: row.routeCode,
    routeName: row.routeName,
    productId: row.productId ?? '',
    versionNo: row.versionNo,
    remark: row.remark ?? '',
  });
};

const handleSubmit = (): void => {
  if (!form.routeCode.trim() || !form.routeName.trim() || !form.productId) {
    EMessage.warning('请填写路线编号、路线名称并选择适用产品');
    return;
  }
  if (hasUnavailableSelection(props.productOptions, [form.productId], (item) => item.id)) {
    EMessage.warning('适用产品已失效，请重新选择');
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
