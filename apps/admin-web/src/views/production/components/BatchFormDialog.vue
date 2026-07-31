<template>
  <el-dialog
    :model-value="visible"
    :title="editingBatchId ? '编辑生产批次' : '新增生产批次'"
    :width="DialogWidth.md"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form
      class="dialog-form"
      label-width="108px"
      :model="form"
      :disabled="submitting"
    >
      <el-form-item label="批次号">
        <el-input
          v-model="form.batchNo"
          placeholder="不填则系统自动生成"
        />
      </el-form-item>
      <el-form-item
        label="计划数量"
        required
      >
        <el-input-number
          v-model="form.plannedQuantity"
          :min="0.0001"
          :max="maxQuantity ?? undefined"
          :precision="4"
          :step="1"
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
      <el-form-item label="工艺路线">
        <el-select
          v-model="form.routeId"
          clearable
          filterable
          placeholder="默认使用产品默认路线"
        >
          <el-option
            v-for="route in availableRouteOptions"
            :key="route.id"
            :label="route.routeName"
            :value="route.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="负责人">
        <el-select
          v-model="form.ownerId"
          clearable
          filterable
          placeholder="请选择负责人"
        >
          <el-option
            v-for="user in userOptions"
            :key="user.id"
            :label="user.displayName"
            :value="user.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="备注">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="3"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="handleSubmit"
        >保存生产批次</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import type { ProductionBatchItem } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { toDateInputValue } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import type { WorkOrderRouteOption, WorkOrderUserOption } from '../composables/useWorkOrders';

export type BatchFormValue = {
  batchNo: string;
  routeId: string;
  plannedQuantity: number;
  ownerId: string;
  planStartDate: string;
  planEndDate: string;
  remark: string;
};

const props = defineProps<{
  visible: boolean;
  editingBatchId: string | null;
  availableRouteOptions: WorkOrderRouteOption[];
  userOptions: WorkOrderUserOption[];
  /** 本批次计划数量上限；null 表示不限制 */
  maxQuantity: number | null;
  /** 默认计划开始日期（取自工单） */
  defaultStartDate: string;
  /** 默认计划完成日期（取自工单） */
  defaultEndDate: string;
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'save', data: BatchFormValue): void;
}>();

const initialForm = (): BatchFormValue => ({
  batchNo: '',
  routeId: '',
  plannedQuantity: 1,
  ownerId: '',
  planStartDate: props.defaultStartDate,
  planEndDate: props.defaultEndDate,
  remark: '',
});

const form = reactive<BatchFormValue>(initialForm());

const resetForm = (): void => {
  Object.assign(form, initialForm());
};

const setForm = (row: ProductionBatchItem): void => {
  Object.assign(form, {
    batchNo: row.batchNo,
    routeId: row.routeId ?? '',
    plannedQuantity: Number(row.plannedQuantity),
    ownerId: row.ownerId ?? '',
    planStartDate: toDateInputValue(row.planStartDate),
    planEndDate: toDateInputValue(row.planEndDate),
    remark: row.remark ?? '',
  });
};

const handleSubmit = (): void => {
  if (form.plannedQuantity <= 0) {
    EMessage.warning('请填写生产批次数量');
    return;
  }
  if (props.maxQuantity !== null && form.plannedQuantity > props.maxQuantity) {
    EMessage.warning('生产批次数量不能超过工单剩余可分配数量');
    return;
  }
  if (form.planStartDate && form.planEndDate && form.planEndDate < form.planStartDate) {
    EMessage.warning('计划完成日期不能早于计划开始日期');
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
</style>
