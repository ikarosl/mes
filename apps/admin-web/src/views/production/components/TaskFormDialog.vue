<template>
  <el-dialog
    :model-value="visible"
    :title="editingTaskId ? '编辑任务' : '新增任务'"
    :width="DialogWidth.lg"
    @update:model-value="$emit('update:visible', $event)"
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
            :loading="workOrderSource.loading.value"
            placeholder="请选择工单"
            @change="handleWorkOrderChange"
            @visible-change="(v: boolean) => v && workOrderSource.refresh()"
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
          @change="handleRouteChange"
          @visible-change="(v: boolean) => v && routeSource.refresh()"
        >
          <el-option
            v-for="choice in routeChoices"
            :key="choice.value"
            :label="choice.option ? formatRoute(choice.option) : `${choice.value}（已失效）`"
            :value="choice.value"
            :disabled="choice.isUnavailable"
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
            v-for="choice in ownerChoices"
            :key="choice.value"
            :label="choice.option ? choice.option.displayName : `${choice.value}（已失效）`"
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
                @visible-change="(v: boolean) => v && $emit('refresh-users')"
              >
                <el-option
                  v-for="choice in stepOwnerChoices(row)"
                  :key="choice.value"
                  :label="choice.option ? choice.option.displayName : `${choice.value}（已失效）`"
                  :value="choice.value"
                  :disabled="choice.isUnavailable"
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
import { computed, onActivated, reactive, ref, watch } from 'vue';
import type {
  ProcessRouteOption,
  TechnicalFileListItem,
  UserOption,
  WorkOrderOption,
} from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import {
  buildLiveOptions,
  hasUnavailableSelection,
  type LiveOption,
} from '../../../utils/live-options';
import { resolveDefaultRouteId } from '../production-route-options';
import { useProductOptions } from '../../../composables/options/useProductOptions';
import { useProcessRouteOptions } from '../../../composables/options/useProcessRouteOptions';
import { useTaskRouteSteps, type TaskStepPreview } from '../composables/useTaskRouteSteps';
import { useWorkOrderOptions } from '../composables/useWorkOrderOptions';

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
  userOptions: UserOption[];
  sopFileOptions: TechnicalFileListItem[];
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
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

/** 本弹窗自持候选源：工单（本地过滤）/ 产品 / 工艺路线；打开、展开、页面激活时定向刷新 */
const productSource = useProductOptions();
const routeSource = useProcessRouteOptions();
const workOrderSource = useWorkOrderOptions();

/** 打开弹窗：刷新本弹窗自持候选（产品 / 路线 / 工单），并请页面刷新它持有的用户 / SOP 文件候选 */
const onOpen = (): void => {
  void productSource.refresh();
  void routeSource.refresh();
  void workOrderSource.refresh();
  emit('refresh-users');
  emit('refresh-sop-files');
};

/** 打开（props.visible 变 true）：执行 onOpen；页面激活时若弹窗仍打开则再次定向刷新 */
watch(
  () => props.visible,
  (visible) => {
    if (visible) onOpen();
  },
);

onActivated(() => {
  if (props.visible) {
    void productSource.refresh();
    void routeSource.refresh();
    void workOrderSource.refresh();
  }
});

const form = reactive(initialForm());
const {
  preview: createStepPreview,
  load: fetchStepPreview,
  reset: resetStepPreview,
} = useTaskRouteSteps();
const editingTaskOriginalQuantity = ref(0);

const selectedWorkOrder = computed(
  () => workOrderSource.options.value.find((item) => item.id === form.workOrderId) ?? null,
);
/** 候选工单：标记失效已选值 */
const workOrderChoices = computed(() =>
  buildLiveOptions(
    workOrderSource.options.value,
    form.workOrderId ? [form.workOrderId] : [],
    (item) => item.id,
  ),
);
const availableRouteOptions = computed(() => {
  const order = selectedWorkOrder.value;
  if (!order) return routeSource.options.value;
  return routeSource.options.value.filter((route) => route.productId === order.productId);
});
const selectedWorkOrderRemaining = computed(() => {
  if (!selectedWorkOrder.value) return null;
  return Number(selectedWorkOrder.value.remainingQuantity);
});
const taskQuantityMax = computed(() => {
  if (selectedWorkOrderRemaining.value === null) return null;
  return props.editingTaskId
    ? selectedWorkOrderRemaining.value + editingTaskOriginalQuantity.value
    : selectedWorkOrderRemaining.value;
});

const formatRoute = (route: ProcessRouteOption): string =>
  `${route.routeName}${route.versionNo ? ` / ${route.versionNo}` : ''}`;

const formatWorkOrderOption = (order: WorkOrderOption): string =>
  workOrderSource.formatOption(order);

/** 路线下拉：合并已选值，候选刷新后已失效路线回显「ID（已失效）」并禁用 */
const routeChoices = computed(() =>
  buildLiveOptions(
    availableRouteOptions.value,
    form.routeId ? [form.routeId] : [],
    (route) => route.id,
  ),
);
/** 负责人下拉：合并已选值，已失效负责人回显「ID（已失效）」并禁用 */
const ownerChoices = computed(() =>
  buildLiveOptions(props.userOptions, form.ownerId ? [form.ownerId] : [], (user) => user.id),
);
/** 工序预览行内实际负责人：同样合并已选值，刷新后已失效负责人回显「ID（已失效）」并禁用 */
const stepOwnerChoices = (row: TaskStepPreview): LiveOption<UserOption>[] =>
  buildLiveOptions(
    props.userOptions,
    row.responsibleUserId ? [row.responsibleUserId] : [],
    (user) => user.id,
  );

const loadCreateStepPreview = (): void => {
  void fetchStepPreview(form.routeId, Boolean(props.editingTaskId));
};

/** 待补算默认路线的工单 id：工单 change 时产品/路线候选未就绪，候选就绪后补算（不覆盖用户手动改的路线） */
let pendingRouteWorkOrderId: string | null = null;

/** 用户手动选择/清空路线：取消待补算的默认路线，避免迟到的默认路线补算覆盖手动选择 */
const handleRouteChange = (): void => {
  pendingRouteWorkOrderId = null;
  loadCreateStepPreview();
};

const applyDefaultRoute = (order: WorkOrderOption): void => {
  form.routeId = resolveDefaultRouteId(
    order.productId,
    productSource.options.value,
    routeSource.options.value,
  );
  loadCreateStepPreview();
};

/**
 * 产品 / 路线候选就绪后，补算之前因候选未就绪而挂起的默认路线。
 * pending 只在工单 change 时设置，用户手动改路线不会被候选刷新覆盖。
 */
watch(
  () => [productSource.options.value, routeSource.options.value],
  () => {
    if (!pendingRouteWorkOrderId) return;
    if (productSource.status.value !== 'ready' || routeSource.status.value !== 'ready') return;
    const order = workOrderSource.options.value.find((item) => item.id === pendingRouteWorkOrderId);
    pendingRouteWorkOrderId = null;
    if (!order || order.id !== form.workOrderId) return; // 工单已切换/清空，丢弃挂起
    applyDefaultRoute(order);
  },
);

const handleWorkOrderChange = (workOrderId: string): void => {
  const order = workOrderSource.options.value.find((item) => item.id === workOrderId);
  // 切换工单：立即清空上一工单的路线与负责人及预览，防止旧产品路线残留到提交校验
  pendingRouteWorkOrderId = null;
  form.routeId = '';
  form.ownerId = '';
  resetStepPreview();
  if (!order) return;
  form.plannedQuantity = Number(order.remainingQuantity);
  if (form.plannedQuantity <= 0) {
    EMessage.warning('该工单已无可分配数量');
  }
  if (productSource.status.value === 'ready' && routeSource.status.value === 'ready') {
    applyDefaultRoute(order);
  } else {
    pendingRouteWorkOrderId = order.id;
  }
};

const resetForm = (): void => {
  pendingRouteWorkOrderId = null;
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
  pendingRouteWorkOrderId = null; // 编辑模式工单只读回显，不参与默认路线补算
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
  // 编辑模式工单只读回显，可能不在 released 候选内（已全部分配/状态变化），跳过失效校验
  if (
    !props.editingTaskId &&
    hasUnavailableSelection(
      workOrderSource.options.value,
      form.workOrderId ? [form.workOrderId] : [],
      (item) => item.id,
    )
  ) {
    EMessage.warning('所选工单已失效，请重新选择');
    return;
  }
  if (
    form.routeId &&
    hasUnavailableSelection(availableRouteOptions.value, [form.routeId], (route) => route.id)
  ) {
    EMessage.warning('所选工艺路线已失效，请重新选择');
    return;
  }
  if (
    form.ownerId &&
    hasUnavailableSelection(props.userOptions, [form.ownerId], (user) => user.id)
  ) {
    EMessage.warning('所选负责人已失效，请重新选择');
    return;
  }
  // 工序执行行内实际负责人：刷新后已失效时前端拦截，不等后端拒绝
  if (
    createStepPreview.value.some(
      (step) =>
        step.responsibleUserId &&
        hasUnavailableSelection(props.userOptions, [step.responsibleUserId], (user) => user.id),
    )
  ) {
    EMessage.warning('所选工序实际负责人已失效，请重新选择');
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
