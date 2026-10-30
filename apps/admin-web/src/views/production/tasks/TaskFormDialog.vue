<template>
  <el-dialog
    :model-value="visible"
    :title="editingTaskId ? '编辑任务' : '新增任务'"
    :width="DialogWidth.lg"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form
      class="dialog-form"
      label-position="top"
      :model="form"
      :disabled="submitting"
    >
      <div
        v-if="editingTaskId"
        class="task-identity"
      >
        <span>任务批次号</span>
        <strong>{{ existingBatchNo }}</strong>
      </div>
      <template v-else>
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
      </template>
      <section class="work-order-summary">
        <div class="summary-heading">
          <h3>任务分配</h3>
          <el-button
            v-if="!editingTaskId && selectedWorkOrder"
            link
            type="primary"
            :loading="workOrderSource.loading.value"
            @click="workOrderSource.refresh()"
            >刷新分配与产出</el-button
          >
        </div>
        <div
          class="allocation-grid"
          :class="{ 'allocation-grid--single': editingTaskId || !selectedWorkOrder }"
        >
          <div
            v-if="!editingTaskId && selectedWorkOrder"
            class="allocation-formula"
          >
            <div class="allocation-term">
              <span>工单计划</span>
              <strong>{{ formatQuantity(selectedWorkOrder.plannedQuantity) }}</strong>
            </div>
            <span class="formula-symbol">−</span>
            <div class="allocation-term">
              <span>已分配</span>
              <strong>{{ formatQuantity(selectedWorkOrder.assignedQuantity) }}</strong>
            </div>
            <span class="formula-symbol">=</span>
            <div class="allocation-term">
              <span>可分配</span>
              <strong>{{ formatQuantity(selectedWorkOrder.remainingQuantity) }}</strong>
            </div>
          </div>
          <el-form-item
            label="计划数量"
            required
            class="quantity-item"
          >
            <div class="quantity-field">
              <el-input-number
                v-model="form.plannedQuantity"
                :min="1"
                :precision="0"
                :step="1"
              />
              <p
                v-if="plannedQuantityError"
                class="quantity-feedback quantity-feedback--error"
                role="alert"
              >
                {{ plannedQuantityError }}
              </p>
              <p
                v-else-if="remainingAfterAllocation !== null"
                class="quantity-feedback"
                role="status"
              >
                分配后还可分配 <strong>{{ formatQuantity(remainingAfterAllocation) }}</strong>
              </p>
            </div>
          </el-form-item>
        </div>
        <template v-if="!editingTaskId && selectedWorkOrder">
          <div class="output-reference">
            <strong class="output-label">产出参考</strong>
            <div class="output-values">
              <span v-if="selectedWorkOrder.finalOutput.finalizedBatchCount > 0">
                已批准可用产出
                <strong>{{
                  formatQuantity(approvedUsableQuantity(selectedWorkOrder.finalOutput))
                }}</strong>
                <span
                  >（计划内 {{ formatQuantity(selectedWorkOrder.finalOutput.availableQuantity) }} /
                  计划外 {{ formatQuantity(selectedWorkOrder.finalOutput.extraQuantity) }}）</span
                >
              </span>
              <span v-else>暂无已批准产出</span>
              <span v-if="selectedWorkOrder.finalOutput.closingBatchCount > 0">
                另有
                {{ selectedWorkOrder.finalOutput.closingBatchCount }} 个任务收尾中，产出未计入。
              </span>
            </div>
          </div>
          <InlineHint class="allocation-notes">
            <div>
              已终止/取消的任务，不占用分配量。
              <span v-if="Number(selectedWorkOrder.terminatedPlannedQuantity) > 0">
                已终止任务曾有
                {{ formatQuantity(selectedWorkOrder.terminatedPlannedQuantity) }}分配，不占额度。
              </span>
            </div>
            <div>
              <span class="output-caution"
                >已终止任务可能存在产出，请结合已有产出核对本次分配数量。</span
              >
            </div>
          </InlineHint>
        </template>
      </section>
      <el-alert
        v-if="!editingTaskId && workOrderSource.status.value === 'error'"
        type="warning"
        :closable="false"
        title="工单额度刷新失败，请刷新核对后再保存任务。"
        class="refresh-warning"
      />
      <div class="section-heading">
        <h3>执行安排</h3>
        <span
          v-if="!editingTaskId"
          class="section-caption"
          >任务批次号由系统自动生成</span
        >
      </div>
      <div class="task-fields">
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
          :class="{ 'task-field--wide': taskOrderType === 'research' }"
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
      </div>
      <el-form-item
        label="备注"
        class="remark-field"
      >
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="2"
          placeholder="可填写生产要求或注意事项（选填）"
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
import InlineHint from '../../../components/InlineHint.vue';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { toDateInputValue } from '../../../utils/date';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';
import { useProcessRouteOptions } from '../../../composables/options/useProcessRouteOptions';
import { useWorkOrderOptions } from '../work-orders/use-work-order-options';
import { useTaskOwnerOptions } from './use-task-owner-options';
import { formatQuantity } from '../../../utils/quantity';
import { approvedUsableQuantity } from '../shared/production-output-quantity';
import type { TaskFormValue } from './task-form';

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
const plannedQuantityError = computed(() => {
  if (!Number.isInteger(form.plannedQuantity) || form.plannedQuantity <= 0) {
    return '计划数量必须为大于 0 的整数。';
  }
  const max = taskQuantityMax.value;
  if (max !== null && form.plannedQuantity > max) {
    return `超出可分配数量 ${formatQuantity(form.plannedQuantity - max)}，当前最多可分配 ${formatQuantity(max)}。`;
  }
  return '';
});
const remainingAfterAllocation = computed(() => {
  if (plannedQuantityError.value || taskQuantityMax.value === null) return null;
  return taskQuantityMax.value - form.plannedQuantity;
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
  if (!props.editingTaskId && !form.workOrderId) {
    EMessage.warning('请选择所属工单');
    return;
  }
  if (plannedQuantityError.value) {
    EMessage.warning(plannedQuantityError.value);
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
.dialog-form {
  color: var(--el-text-color-primary);
}
.dialog-form :deep(.el-form-item) {
  min-width: 0;
  margin-bottom: 16px;
}
.dialog-form :deep(.el-form-item__label) {
  margin-bottom: 6px;
  line-height: 20px;
}
.task-identity {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
  color: var(--el-text-color-regular);
}
.task-identity strong {
  color: var(--el-text-color-primary);
}
.work-order-summary {
  margin-bottom: 16px;
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-light);
}
.summary-heading,
.section-heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 6px 12px;
  margin-bottom: 8px;
}
.summary-heading h3,
.section-heading h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
}
.section-caption {
  color: var(--el-text-color-regular);
  font-size: 12px;
}
.allocation-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 0.7fr);
  align-items: start;
  gap: 12px 28px;
}
.allocation-grid--single {
  grid-template-columns: minmax(0, 280px);
}
.allocation-formula {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding-top: 2px;
}
.allocation-term {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
}
.allocation-term span {
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 20px;
}
.allocation-term strong {
  font-size: 14px;
  font-weight: 400;
  line-height: 30px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.formula-symbol {
  padding-top: 28px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
.dialog-form :deep(.quantity-item) {
  margin-bottom: 0;
}
.quantity-field,
.owner-field {
  width: 100%;
  min-width: 0;
}
.quantity-feedback {
  margin: 4px 0 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 20px;
}
.quantity-feedback strong {
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}
.quantity-feedback--error {
  color: var(--el-color-danger);
}
.output-reference {
  display: flex;
  align-items: baseline;
  gap: 8px 16px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: 13px;
  line-height: 22px;
}
.output-label {
  flex-shrink: 0;
  font-weight: 500;
}
.output-values {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 16px;
  min-width: 0;
  color: var(--el-text-color-regular);
}
.output-values strong {
  color: var(--el-text-color-primary);
}
.allocation-notes {
  margin-top: 8px;
}
.output-caution {
  color: var(--el-color-danger);
}
.refresh-warning {
  margin-bottom: 16px;
}
.task-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 20px;
}
.task-fields :deep(.el-form-item__content) {
  min-width: 0;
}
.task-field--wide {
  grid-column: 1 / -1;
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
.dialog-form :deep(.remark-field) {
  margin-bottom: 0;
}
.dialog-form :deep(.el-input),
.dialog-form :deep(.el-select),
.dialog-form :deep(.el-input-number),
.dialog-form :deep(.el-date-editor),
.dialog-form :deep(.el-textarea) {
  width: 100%;
}
@media (max-width: 800px) {
  .allocation-grid,
  .task-fields {
    grid-template-columns: minmax(0, 1fr);
  }
  .allocation-grid {
    row-gap: 16px;
  }
  .output-reference {
    flex-direction: column;
    gap: 2px;
  }
}
</style>
