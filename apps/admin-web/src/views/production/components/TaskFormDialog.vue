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
      <el-form-item
        v-if="editingTaskId"
        label="任务批次号"
        >{{ existingBatchNo }}</el-form-item
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
        <section
          v-if="selectedWorkOrder"
          class="work-order-summary"
        >
          <div class="summary-heading">
            <strong>工单额度与审定产出</strong>
            <el-button
              link
              type="primary"
              :loading="workOrderSource.loading.value"
              @click="workOrderSource.refresh()"
              >刷新核对</el-button
            >
          </div>
          <el-descriptions
            :column="2"
            border
          >
            <el-descriptions-item label="工单计划">{{
              formatQuantity(selectedWorkOrder.plannedQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item label="有效已分配">{{
              formatQuantity(selectedWorkOrder.assignedQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item label="剩余可分配"
              ><strong>{{
                formatQuantity(selectedWorkOrder.remainingQuantity)
              }}</strong></el-descriptions-item
            >
            <el-descriptions-item label="已终止计划（不占额度）">{{
              formatQuantity(selectedWorkOrder.terminatedPlannedQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item label="审定计划内产出">{{
              formatQuantity(selectedWorkOrder.finalOutput.availableQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item label="审定计划外产出">{{
              formatQuantity(selectedWorkOrder.finalOutput.extraQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item label="审定可用合计">{{
              formatQuantity(approvedUsableQuantity(selectedWorkOrder.finalOutput))
            }}</el-descriptions-item>
            <el-descriptions-item label="审定报废">{{
              formatQuantity(selectedWorkOrder.finalOutput.scrapQuantity)
            }}</el-descriptions-item>
            <el-descriptions-item
              label="计划内产出与计划比较"
              :span="2"
              >{{
                plannedOutputGapText(selectedWorkOrder.finalOutput.plannedShortfallQuantity)
              }}；已批准 {{ selectedWorkOrder.finalOutput.finalizedBatchCount }} 个任务，收尾中
              {{ selectedWorkOrder.finalOutput.closingBatchCount }}
              个任务（未计入）</el-descriptions-item
            >
          </el-descriptions>
          <p class="summary-note">
            剩余可分配 = 工单计划 −
            有效已分配。已取消、已终止任务不占额度；收尾中、正常完成仍占用。已终止任务的审定产出继续累计，不抵扣可分配额度，也不代表已入库。
          </p>
          <p
            v-if="Number.isInteger(form.plannedQuantity) && form.plannedQuantity > 0"
            class="summary-note"
          >
            本次分配 {{ formatQuantity(form.plannedQuantity) }}；
            {{
              form.plannedQuantity > Number(selectedWorkOrder.remainingQuantity)
                ? '超出额度'
                : '分配后剩余'
            }}
            {{
              formatQuantity(
                Math.abs(Number(selectedWorkOrder.remainingQuantity) - form.plannedQuantity),
              )
            }}
          </p>
        </section>
        <el-alert
          v-if="workOrderSource.status.value === 'error'"
          type="warning"
          :closable="false"
          title="工单额度刷新失败，请刷新核对后再保存任务。"
          class="work-order-summary"
        />
        <el-form-item label="任务批次号">由系统自动生成</el-form-item>
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
      <el-form-item
        v-if="taskOrderType !== 'research'"
        label="工艺路线"
        :required="!editingTaskId"
      >
        <span v-if="editingTaskId">{{ existingRouteLabel }}</span>
        <el-select
          v-else
          v-model="form.routeId"
          filterable
          clearable
          placeholder="请选择工艺路线"
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
      <el-form-item
        label="负责人"
        required
      >
        <div class="owner-field">
          <div class="owner-picker">
            <el-select
              v-model="form.ownerId"
              filterable
              placeholder="请选择任务负责人"
              :loading="ownersLoading"
              @change="rememberOwnerSelection"
            >
              <el-option
                v-for="owner in owners"
                :key="owner.id"
                :label="owner.displayName"
                :value="owner.id"
              />
              <el-option
                v-if="missingOwner"
                :label="missingOwner.label"
                :value="missingOwner.id"
                disabled
              />
              <template #empty>
                <div class="candidate-empty">
                  {{
                    ownersVerified
                      ? '暂无候选人员，请联系管理员配置业务人员角色'
                      : '请刷新负责人候选后重试'
                  }}
                </div>
              </template>
            </el-select>
            <el-button
              :icon="Refresh"
              :loading="ownersLoading"
              aria-label="刷新任务负责人候选"
              @click="refreshOwners"
            />
          </div>
          <p
            v-if="ownersError"
            class="owner-warning"
            role="status"
          >
            任务负责人候选读取失败，请刷新后再保存。
          </p>
          <p
            v-else-if="ownersVerified && !owners.length"
            class="owner-note"
            role="status"
          >
            暂无候选人员，请联系管理员配置业务人员角色。
          </p>
          <p
            v-if="isOwnerUnavailable"
            class="owner-warning"
            role="status"
          >
            原负责人已退出当前候选范围，请重新选择。
          </p>
        </div>
      </el-form-item>
      <el-form-item
        label="计划数量"
        required
      >
        <el-input-number
          v-model="form.plannedQuantity"
          :min="1"
          :precision="0"
          :step="1"
        />
      </el-form-item>
      <el-form-item
        label="计划开始"
        :required="!editingTaskId"
      >
        <el-date-picker
          v-model="form.planStartDate"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="请选择计划开始日期"
          :disabled-date="disableTaskDate"
        />
      </el-form-item>
      <el-form-item
        label="计划结束"
        :required="!editingTaskId"
      >
        <el-date-picker
          v-model="form.planEndDate"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="请选择计划结束日期"
          :disabled-date="disableTaskDate"
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
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!editingTaskId && workOrderSource.status.value !== 'ready'"
        @click="handleSubmit"
        >保存任务</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import type {
  ProcessRouteOption,
  ProductionBatchDetail,
  WorkOrderOption,
} from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { toDateInputValue } from '../../../utils/date';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';
import { useProcessRouteOptions } from '../../../composables/options/useProcessRouteOptions';
import { useWorkOrderOptions } from '../composables/useWorkOrderOptions';
import { useTaskOwnerOptions } from '../composables/use-task-owner-options';
import { formatQuantity } from '../production-status';
import { approvedUsableQuantity, plannedOutputGapText } from '../production-output-quantity';

export type TaskFormValue = {
  workOrderId: string;
  routeId: string;
  ownerId: string;
  plannedQuantity: number;
  planStartDate: string;
  planEndDate: string;
  remark: string;
};

const props = defineProps<{
  visible: boolean;
  editingTaskId: string | null;
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'save', data: TaskFormValue): void;
}>();

const existingBatchNo = ref('');
const existingTaskContext = ref<Pick<
  ProductionBatchDetail,
  'orderType' | 'routeCode' | 'routeVersion'
> | null>(null);
const existingRouteLabel = computed(() => {
  const context = existingTaskContext.value;
  if (!context?.routeCode) return '未配置';
  const versionLabel = context.routeVersion ? ` / ${context.routeVersion}` : '';
  return `${context.routeCode}${versionLabel}`;
});
const initialForm = (): TaskFormValue => ({
  workOrderId: '',
  routeId: '',
  ownerId: '',
  plannedQuantity: 1,
  planStartDate: '',
  planEndDate: '',
  remark: '',
});

/** 本弹窗自持工单与工艺路线候选；产品身份由所选工单提供。 */
const routeSource = useProcessRouteOptions();
const workOrderSource = useWorkOrderOptions();
const {
  owners,
  loading: ownersLoading,
  verified: ownersVerified,
  error: ownersError,
  refreshOwners,
  invalidateOwners,
} = useTaskOwnerOptions(() => props.visible);

/** 打开弹窗刷新本表单持有的候选。 */
const onOpen = (): void => {
  if (!props.editingTaskId) void routeSource.refresh();
  void workOrderSource.refresh();
  void refreshOwners();
};

/** 打开时读取候选，不因恢复缓存页覆盖本次填写的上下文。 */
watch(
  () => props.visible,
  (visible) => {
    if (visible) onOpen();
    else invalidateOwners();
  },
);

const form = reactive(initialForm());
const originalOwner = ref<{ id: string; name: string | null } | null>(null);
const rememberOwnerSelection = (): void => {
  const id = form.ownerId;
  const owner = owners.value.find((candidate) => candidate.id === id);
  if (owner) originalOwner.value = { id, name: owner.displayName };
  if (!id) originalOwner.value = null;
};
watch(owners, rememberOwnerSelection);

const missingOwner = computed(() => {
  const id = form.ownerId;
  if (!id || owners.value.some((owner) => owner.id === id)) return null;
  const name = originalOwner.value?.id === id ? originalOwner.value.name || id : id;
  const state = ownersVerified.value ? '已失效' : '待核验';
  return { id, label: `${name}（${state}）` };
});
const isOwnerUnavailable = computed(() => ownersVerified.value && Boolean(missingOwner.value));
const editingTaskOriginalQuantity = ref(0);

const selectedWorkOrder = computed(
  () => workOrderSource.options.value.find((item) => item.id === form.workOrderId) ?? null,
);
const taskOrderType = computed(() =>
  props.editingTaskId ? existingTaskContext.value?.orderType : selectedWorkOrder.value?.orderType,
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
  return routeSource.options.value;
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

const toLocalDateValue = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const disableTaskDate = (date: Date): boolean => {
  const order = selectedWorkOrder.value;
  if (!order) return false;
  const value = toLocalDateValue(date);
  const orderStartDate = toDateInputValue(order.planStartDate);
  const orderEndDate = toDateInputValue(order.planEndDate);
  return Boolean(
    (orderStartDate && value < orderStartDate) || (orderEndDate && value > orderEndDate),
  );
};

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

const handleWorkOrderChange = (workOrderId: string): void => {
  const order = workOrderSource.options.value.find((item) => item.id === workOrderId);
  // 切换工单时清空原路线与负责人，防止旧工单输入残留到提交校验。
  form.routeId = '';
  form.ownerId = '';
  originalOwner.value = null;
  form.planStartDate = toDateInputValue(order?.planStartDate);
  form.planEndDate = toDateInputValue(order?.planEndDate);
  if (!order) return;
  form.plannedQuantity = Number(order.remainingQuantity);
  if (!Number.isInteger(form.plannedQuantity) || form.plannedQuantity <= 0) {
    EMessage.warning('该工单已无可分配数量');
  }
};

const resetForm = (): void => {
  existingBatchNo.value = '';
  existingTaskContext.value = null;
  originalOwner.value = null;
  Object.assign(form, initialForm());
};

const setForm = (row: {
  workOrderId: string;
  batchNo: string;
  orderType: ProductionBatchDetail['orderType'];
  routeId: string | null;
  routeCode: string | null;
  routeVersion: string | null;
  ownerId: string | null;
  ownerName: string | null;
  plannedQuantity: string | number;
  planStartDate: string | null;
  planEndDate: string | null;
  remark: string | null;
}): void => {
  editingTaskOriginalQuantity.value = Number(row.plannedQuantity);
  existingBatchNo.value = row.batchNo;
  existingTaskContext.value = {
    orderType: row.orderType,
    routeCode: row.routeCode,
    routeVersion: row.routeVersion,
  };
  originalOwner.value = row.ownerId ? { id: row.ownerId, name: row.ownerName } : null;
  Object.assign(form, {
    workOrderId: row.workOrderId,
    routeId: row.routeId ?? '',
    ownerId: row.ownerId ?? '',
    plannedQuantity: Number(row.plannedQuantity),
    planStartDate: toDateInputValue(row.planStartDate),
    planEndDate: toDateInputValue(row.planEndDate),
    remark: row.remark ?? '',
  });
};

const handleSubmit = (): void => {
  if (!form.ownerId) {
    EMessage.warning('请选择任务负责人');
    return;
  }
  if (!ownersVerified.value) {
    EMessage.warning('请先刷新任务负责人候选后再保存');
    return;
  }
  if (isOwnerUnavailable.value) {
    EMessage.warning('所选任务负责人已失效，请重新选择');
    return;
  }
  if (!props.editingTaskId && workOrderSource.status.value !== 'ready') {
    EMessage.warning('请先刷新工单额度后再保存任务');
    return;
  }
  if (
    (!props.editingTaskId && !form.workOrderId) ||
    !Number.isInteger(form.plannedQuantity) ||
    form.plannedQuantity <= 0
  ) {
    EMessage.warning('请选择所属工单并填写计划数量');
    return;
  }
  if (taskQuantityMax.value !== null && form.plannedQuantity > taskQuantityMax.value) {
    EMessage.warning('计划数量不能超过工单剩余数量');
    return;
  }
  if (!form.planStartDate || !form.planEndDate) {
    EMessage.warning('请填写计划开始和计划结束日期');
    return;
  }
  if (form.planStartDate && form.planEndDate && form.planEndDate < form.planStartDate) {
    EMessage.warning('计划结束日期不能早于计划开始日期');
    return;
  }
  const order = selectedWorkOrder.value;
  const orderStartDate = toDateInputValue(order?.planStartDate);
  const orderEndDate = toDateInputValue(order?.planEndDate);
  if (
    order &&
    ((orderStartDate && form.planStartDate < orderStartDate) ||
      (orderEndDate && form.planEndDate > orderEndDate))
  ) {
    EMessage.warning('任务计划日期必须位于工单计划区间内');
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
  if (!props.editingTaskId && taskOrderType.value !== 'research' && !form.routeId) {
    EMessage.warning('请先选择工艺路线');
    return;
  }
  if (
    !props.editingTaskId &&
    form.routeId &&
    hasUnavailableSelection(availableRouteOptions.value, [form.routeId], (route) => route.id)
  ) {
    EMessage.warning('所选工艺路线已失效，请重新选择');
    return;
  }
  emit('save', {
    ...form,
    routeId: taskOrderType.value === 'research' ? '' : form.routeId,
  });
};

defineExpose({ setForm, resetForm });
</script>

<style scoped>
.owner-field {
  width: 100%;
}
.owner-picker {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.owner-picker :deep(.el-select) {
  flex: 1;
  min-width: 0;
}
.owner-note,
.owner-warning {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
}
.owner-note {
  color: var(--el-text-color-regular);
}
.owner-warning {
  color: var(--el-color-warning);
}
.candidate-empty {
  max-width: 340px;
  padding: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
  text-align: center;
}
.work-order-summary {
  margin-bottom: 20px;
}
.summary-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.summary-note {
  margin: 10px 0 0;
  line-height: 1.7;
  color: var(--el-text-color-regular);
}
.dialog-form :deep(.el-input),
.dialog-form :deep(.el-select),
.dialog-form :deep(.el-input-number),
.dialog-form :deep(.el-date-editor),
.dialog-form :deep(.el-textarea) {
  width: 100%;
}
.dialog-form :deep(.el-input__wrapper),
.dialog-form :deep(.el-select__wrapper) {
  border-radius: 6px;
  box-shadow: 0 0 0 1px #e5e7eb inset;
}
</style>
