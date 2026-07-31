<template>
  <el-dialog
    :model-value="visible"
    :title="editingOrderId ? '编辑工单' : '新增工单'"
    :width="DialogWidth.lg"
    @update:model-value="$emit('update:visible', $event)"
    @open="$emit('refresh-options')"
  >
    <el-form
      class="dialog-form"
      label-width="108px"
      :model="form"
      :disabled="submitting"
    >
      <div class="form-grid">
        <el-form-item
          label="工单号"
          required
        >
          <el-input
            v-model="form.workOrderNo"
            :disabled="Boolean(editingOrderId)"
            placeholder="请输入工单号"
          />
        </el-form-item>
        <el-form-item
          label="产品"
          required
        >
          <el-select
            v-model="form.productId"
            filterable
            placeholder="请选择产品"
            @visible-change="(v: boolean) => v && $emit('refresh-options')"
          >
            <el-option
              v-for="choice in productChoices"
              :key="choice.value"
              :label="choice.option ? formatProduct(choice.option) : `${choice.value}（已失效）`"
              :value="choice.value"
              :disabled="choice.isUnavailable"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          label="计划数量"
          required
        >
          <el-input-number
            v-model="form.plannedQuantity"
            :min="0.0001"
            :precision="4"
            :step="1"
          />
        </el-form-item>
        <el-form-item label="负责人">
          <el-select
            v-model="form.workOrderOwnerId"
            clearable
            filterable
            placeholder="请选择工单负责人"
            @visible-change="(v: boolean) => v && $emit('refresh-options')"
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
        <el-form-item label="客户名称">
          <el-input
            v-model="form.customerName"
            placeholder="可选填写"
          />
        </el-form-item>
        <el-form-item label="质量等级">
          <el-input
            v-model="form.qualityLevel"
            placeholder="客户质量等级代码"
          />
        </el-form-item>
        <el-form-item label="计划开始">
          <el-date-picker
            v-model="form.planStartDate"
            type="date"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="计划完成">
          <el-date-picker
            v-model="form.planEndDate"
            type="date"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="外部订单号">
          <el-input
            v-model="form.externalOrderNo"
            placeholder="可选填写"
          />
        </el-form-item>
      </div>
      <el-form-item label="备注">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="3"
          placeholder="可填写生产要求或注意事项"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="handleSubmit"
        >保存工单</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import type { WorkOrderItem } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { toDateInputValue } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';
import type { WorkOrderProductOption, WorkOrderUserOption } from '../composables/useWorkOrders';

export type WorkOrderFormValue = {
  workOrderNo: string;
  productId: string;
  plannedQuantity: number;
  workOrderOwnerId: string;
  customerName: string;
  qualityLevel: string;
  planStartDate: string;
  planEndDate: string;
  externalOrderNo: string;
  remark: string;
};

const props = defineProps<{
  visible: boolean;
  editingOrderId: string | null;
  productOptions: WorkOrderProductOption[];
  userOptions: WorkOrderUserOption[];
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'refresh-options'): void;
  (e: 'save', data: WorkOrderFormValue): void;
}>();

const initialForm = (): WorkOrderFormValue => ({
  workOrderNo: '',
  productId: '',
  plannedQuantity: 1,
  workOrderOwnerId: '',
  customerName: '',
  qualityLevel: '',
  planStartDate: '',
  planEndDate: '',
  externalOrderNo: '',
  remark: '',
});

const form = reactive<WorkOrderFormValue>(initialForm());

/** 实时选项：产品和负责人 */
const productChoices = computed(() =>
  buildLiveOptions(props.productOptions, form.productId ? [form.productId] : [], (item) => item.id),
);
const userChoices = computed(() =>
  buildLiveOptions(
    props.userOptions,
    form.workOrderOwnerId ? [form.workOrderOwnerId] : [],
    (item) => item.id,
  ),
);

const formatProduct = (product: WorkOrderProductOption): string =>
  `${product.itemCode} / ${product.productName}`;

const resetForm = (): void => {
  Object.assign(form, initialForm());
};

const setForm = (row: WorkOrderItem): void => {
  Object.assign(form, {
    workOrderNo: row.workOrderNo,
    productId: row.productId,
    plannedQuantity: Number(row.plannedQuantity),
    workOrderOwnerId: row.workOrderOwnerId ?? '',
    customerName: row.customerName ?? '',
    qualityLevel: row.qualityLevel ?? '',
    planStartDate: toDateInputValue(row.planStartDate),
    planEndDate: toDateInputValue(row.planEndDate),
    externalOrderNo: row.externalOrderNo ?? '',
    remark: row.remark ?? '',
  });
};

const handleSubmit = (): void => {
  if (!form.workOrderNo.trim() || !form.productId || form.plannedQuantity <= 0) {
    EMessage.warning('请填写工单号、产品和计划数量');
    return;
  }
  if (
    hasUnavailableSelection(
      props.productOptions,
      form.productId ? [form.productId] : [],
      (item) => item.id,
    )
  ) {
    EMessage.warning('所选产品已失效，请重新选择');
    return;
  }
  if (
    hasUnavailableSelection(
      props.userOptions,
      form.workOrderOwnerId ? [form.workOrderOwnerId] : [],
      (item) => item.id,
    )
  ) {
    EMessage.warning('所选负责人已失效，请重新选择');
    return;
  }
  emit('save', { ...form });
};

defineExpose({ setForm, resetForm });
</script>

<style scoped>
.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 20px;
}
.dialog-form :deep(.el-input),
.dialog-form :deep(.el-select),
.dialog-form :deep(.el-date-editor),
.dialog-form :deep(.el-input-number),
.dialog-form :deep(.el-textarea) {
  width: 100%;
}
.dialog-form :deep(.el-input__wrapper),
.dialog-form :deep(.el-select__wrapper) {
  border-radius: 6px;
  box-shadow: 0 0 0 1px #e5e7eb inset;
}
.dialog-form :deep(.el-button) {
  border-radius: 6px;
}
</style>
