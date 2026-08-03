<template>
  <el-dialog
    :model-value="visible"
    :title="editingTaskId ? '编辑任务' : '新增任务'"
    :width="DialogWidth.lg"
    @update:model-value="$emit('update:visible', $event)"
    @open="onOpen"
  >
    <el-form
      class="dialog-form"
      label-width="108px"
      :model="form"
      :disabled="submitting"
    >
      <template v-if="!editingTaskId">
        <el-form-item
          label="选择工单"
          required
        >
          <el-select
            v-model="form.workOrderId"
            filterable
            :loading="workOrderLoading"
            placeholder="请选择工单"
            @change="handleWorkOrderChange"
            @visible-change="(v: boolean) => v && $emit('refresh-work-orders')"
          >
            <el-option
              v-for="choice in workOrderChoices"
              :key="choice.value"
              :label="
                choice.option ? formatWorkOrderOption(choice.option) : `${choice.value}（已失效）`
              "
              :value="choice.value"
              :disabled="choice.isUnavailable"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="批次号">
          <el-input
            v-model="form.batchNo"
            placeholder="留空自动生成"
          />
        </el-form-item>
        <el-form-item
          v-if="selectedWorkOrder"
          label="产品"
        >
          <el-input
            :model-value="selectedWorkOrder.productCode + ' / ' + selectedWorkOrder.productName"
            disabled
          />
        </el-form-item>
      </template>
      <el-form-item label="工艺路线">
        <el-select
          v-model="form.routeId"
          filterable
          clearable
          placeholder="请选择工艺路线"
          @change="loadCreateStepPreview"
          @visible-change="(v: boolean) => v && $emit('refresh-routes')"
        >
          <el-option
            v-for="route in availableRouteOptions"
            :key="route.id"
            :label="formatRoute(route)"
            :value="route.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="负责人">
        <el-select
          v-model="form.ownerId"
          filterable
          clearable
          placeholder="请选择负责人"
          @visible-change="(v: boolean) => v && $emit('refresh-users')"
        >
          <el-option
            v-for="user in userOptions"
            :key="user.id"
            :label="user.displayName"
            :value="user.id"
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
          :max="taskQuantityMax ?? undefined"
          :precision="4"
          :step="1"
        />
      </el-form-item>
      <el-form-item label="备注">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="3"
        />
      </el-form-item>
    </el-form>
    <el-tabs
      v-if="!editingTaskId && form.routeId"
      class="detail-tabs"
    >
      <el-tab-pane label="工序执行">
        <el-table
          :data="createStepPreview"
          class="detail-table"
        >
          <el-table-column
            prop="stepOrder"
            label="顺序"
            width="70"
          />
          <el-table-column
            prop="stepName"
            label="工序"
            min-width="150"
          />
          <el-table-column
            label="默认参考文件"
            min-width="180"
          >
            <template #default="{ row }">{{ row.sopFileName || '未配置' }}</template>
          </el-table-column>
          <el-table-column
            label="实际参考文件"
            min-width="220"
          >
            <template #default="{ row }">
              <el-select
                v-model="row.actualSopFileId"
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
            </template>
          </el-table-column>
          <el-table-column
            label="默认负责人"
            min-width="130"
          >
            <template #default="{ row }">{{ row.defaultOwnerName || '未配置' }}</template>
          </el-table-column>
          <el-table-column
            label="实际负责人"
            min-width="180"
          >
            <template #default="{ row }">
              <el-select
                v-model="row.responsibleUserId"
                clearable
                filterable
                placeholder="留空则使用默认负责人"
              >
                <el-option
                  v-for="user in userOptions"
                  :key="user.id"
                  :label="user.displayName"
                  :value="user.id"
                />
              </el-select>
            </template>
          </el-table-column>
        </el-table>
        <div
          v-if="!createStepPreview.length"
          class="empty-hint"
        >
          该路线没有可执行工序
        </div>
      </el-tab-pane>
    </el-tabs>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="handleSubmit"
        >保存任务</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { ProductOption, TechnicalFileListItem, WorkOrderItem } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';
import { formatQuantity, getWorkOrderRemaining } from '../production-status';
import { resolveDefaultRouteId } from '../production-route-options';
import { useTaskRouteSteps } from '../composables/useTaskRouteSteps';
import type { TaskRouteOption, TaskUserOption } from '../composables/useProductionBatches';

export type TaskFormValue = {
  workOrderId: string;
  batchNo: string;
  routeId: string;
  ownerId: string;
  plannedQuantity: number;
  remark: string;
  stepOverrides: Array<{
    routeStepId: string;
    actualSopFileId: string | null;
    responsibleUserId: string | null;
  }>;
};

const props = defineProps<{
  visible: boolean;
  editingTaskId: string | null;
  workOrderOptions: WorkOrderItem[];
  workOrderLoading: boolean;
  productOptions: ProductOption[];
  routeOptions: TaskRouteOption[];
  userOptions: TaskUserOption[];
  sopFileOptions: TechnicalFileListItem[];
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'refresh-work-orders'): void;
  (e: 'refresh-routes'): void;
  (e: 'refresh-users'): void;
  (e: 'refresh-sop-files'): void;
  (e: 'save', data: TaskFormValue): void;
}>();

const initialForm = (): Omit<TaskFormValue, 'stepOverrides'> => ({
  workOrderId: '',
  batchNo: '',
  routeId: '',
  ownerId: '',
  plannedQuantity: 1,
  remark: '',
});

/** 打开弹窗：刷新本弹窗实际需要的候选（工单 / 路线 / 负责人 / SOP 文件），不刷新无关资源 */
const onOpen = (): void => {
  emit('refresh-work-orders');
  emit('refresh-routes');
  emit('refresh-users');
  emit('refresh-sop-files');
};

const form = reactive(initialForm());
const {
  preview: createStepPreview,
  load: fetchStepPreview,
  reset: resetStepPreview,
} = useTaskRouteSteps();
const editingTaskOriginalQuantity = ref(0);

const selectedWorkOrder = computed(
  () => props.workOrderOptions.find((item) => item.id === form.workOrderId) ?? null,
);
/** 候选工单：标记失效已选值 */
const workOrderChoices = computed(() =>
  buildLiveOptions(
    props.workOrderOptions,
    form.workOrderId ? [form.workOrderId] : [],
    (item) => item.id,
  ),
);
const availableRouteOptions = computed(() => {
  if (!selectedWorkOrder.value) return props.routeOptions;
  return props.routeOptions.filter(
    (route) => route.productId === selectedWorkOrder.value?.productId,
  );
});
const selectedWorkOrderRemaining = computed(() => {
  if (!selectedWorkOrder.value) return null;
  return getWorkOrderRemaining(selectedWorkOrder.value);
});
const taskQuantityMax = computed(() => {
  if (selectedWorkOrderRemaining.value === null) return null;
  return props.editingTaskId
    ? selectedWorkOrderRemaining.value + editingTaskOriginalQuantity.value
    : selectedWorkOrderRemaining.value;
});

const formatRoute = (route: TaskRouteOption): string =>
  `${route.routeName}${route.versionNo ? ` / ${route.versionNo}` : ''}`;

const formatWorkOrderOption = (order: WorkOrderItem): string =>
  `${order.workOrderNo} / ${order.productCode} / 剩余 ${formatQuantity(
    getWorkOrderRemaining(order),
  )}`;

const loadCreateStepPreview = (): void => {
  void fetchStepPreview(form.routeId, Boolean(props.editingTaskId));
};

const handleWorkOrderChange = async (workOrderId: string): Promise<void> => {
  const order = props.workOrderOptions.find((item) => item.id === workOrderId);
  if (!order) {
    form.routeId = '';
    return;
  }
  form.routeId = resolveDefaultRouteId(order.productId, props.productOptions, props.routeOptions);
  form.ownerId = '';
  form.plannedQuantity = getWorkOrderRemaining(order);
  if (form.plannedQuantity <= 0) {
    EMessage.warning('该工单已无可分配数量');
  }
  await loadCreateStepPreview();
};

const resetForm = (): void => {
  Object.assign(form, initialForm());
  resetStepPreview();
};

const setForm = (row: {
  workOrderId: string;
  batchNo: string;
  routeId: string | null;
  ownerId: string | null;
  plannedQuantity: string | number;
  remark: string | null;
}): void => {
  editingTaskOriginalQuantity.value = Number(row.plannedQuantity);
  Object.assign(form, {
    workOrderId: row.workOrderId,
    batchNo: row.batchNo,
    routeId: row.routeId ?? '',
    ownerId: row.ownerId ?? '',
    plannedQuantity: Number(row.plannedQuantity),
    remark: row.remark ?? '',
  });
  resetStepPreview();
};

const handleSubmit = (): void => {
  if ((!props.editingTaskId && !form.workOrderId) || form.plannedQuantity <= 0) {
    EMessage.warning('请选择所属工单并填写计划数量');
    return;
  }
  if (taskQuantityMax.value !== null && form.plannedQuantity > taskQuantityMax.value) {
    EMessage.warning('计划数量不能超过工单剩余数量');
    return;
  }
  if (
    hasUnavailableSelection(
      props.workOrderOptions,
      form.workOrderId ? [form.workOrderId] : [],
      (item) => item.id,
    )
  ) {
    EMessage.warning('所选工单已失效，请重新选择');
    return;
  }
  emit('save', {
    ...form,
    stepOverrides: createStepPreview.value
      .filter((step) => step.actualSopFileId || step.responsibleUserId)
      .map((step) => ({
        routeStepId: step.id,
        actualSopFileId: step.actualSopFileId,
        responsibleUserId: step.responsibleUserId,
      })),
  });
};

defineExpose({ setForm, resetForm });
</script>

<style scoped>
.dialog-form :deep(.el-input),
.dialog-form :deep(.el-select),
.dialog-form :deep(.el-input-number),
.dialog-form :deep(.el-textarea) {
  width: 100%;
}
.dialog-form :deep(.el-input__wrapper),
.dialog-form :deep(.el-select__wrapper) {
  border-radius: 6px;
  box-shadow: 0 0 0 1px #e5e7eb inset;
}
.detail-tabs {
  margin-top: 18px;
}
.detail-table {
  width: 100%;
  color: #1f2937;
  font-size: 14px;
}
.detail-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
.detail-table :deep(.el-table__row) {
  height: 48px;
}
.detail-table :deep(.el-table__row:hover) {
  background: #f3f4f6;
}
.detail-table :deep(.el-table__cell) {
  border-bottom-color: #e5e7eb;
}
.detail-table :deep(.el-select) {
  width: 100%;
}
.empty-hint {
  padding: 24px;
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
}
</style>
