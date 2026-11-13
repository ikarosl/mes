<template>
  <el-dialog
    :model-value="visible"
    :title="editingTaskId ? '编辑任务' : '新增任务'"
    :width="DialogWidth.lg"
    :before-close="() => emit('update:visible', false)"
  >
    <SubmissionRecoveryNotice
      :status="intentStatus"
      :busy="submitting"
      records-label="生产任务列表"
      allow-restart
      @retry="emit('retry')"
      @restart="emit('restart')"
    />
    <el-form
      class="dialog-form"
      label-position="top"
      :model="form"
      :disabled="submitting || intentStatus !== 'idle'"
    >
      <div
        v-if="editingTaskId"
        class="task-identity"
      >
        <span>任务批次号</span>
        <strong>{{ existingBatchNo }}</strong>
      </div>
      <el-form-item
        label="选择工单"
        required
      >
        <el-select
          v-model="form.workOrderId"
          filterable
          :disabled="Boolean(editingTaskId)"
          :loading="workOrderSource.loading.value"
          placeholder="请选择工单"
          @change="handleWorkOrderChange"
          @visible-change="(v: boolean) => v && !editingTaskId && workOrderSource.refresh()"
        >
          <el-option
            v-if="editingTaskId && existingTaskContext"
            :label="existingWorkOrderLabel"
            :value="existingTaskContext.workOrderId"
          />
          <template v-else-if="!editingTaskId">
            <el-option
              v-for="choice in workOrderChoices"
              :key="choice.value"
              :label="
                choice.option ? formatWorkOrderOption(choice.option) : `${choice.value}（已失效）`
              "
              :value="choice.value"
              :disabled="choice.isUnavailable"
            />
          </template>
        </el-select>
      </el-form-item>
      <section class="work-order-summary">
        <div class="summary-heading">
          <h3>任务分配</h3>
          <el-button
            v-if="form.workOrderId"
            link
            type="primary"
            :loading="workOrderSource.loading.value"
            @click="workOrderSource.refresh()"
            >刷新分配与产出</el-button
          >
        </div>
        <div
          class="allocation-grid"
          :class="{ 'allocation-grid--single': !selectedWorkOrder }"
        >
          <div
            v-if="selectedWorkOrder"
            class="allocation-quantities"
          >
            <div class="allocation-term">
              <span>工单计划</span>
              <strong>{{ formatQuantity(selectedWorkOrder.plannedQuantity) }}</strong>
            </div>
            <div class="allocation-term">
              <span>累计已分配</span>
              <strong>{{ formatQuantity(selectedWorkOrder.assignedQuantity) }}</strong>
            </div>
            <div class="allocation-term">
              <span>{{ workOrderPlanBalance?.label }}</span>
              <strong>{{ formatQuantity(workOrderPlanBalance?.quantity) }}</strong>
            </div>
          </div>
          <el-form-item
            label="计划数量"
            :required="canEditPlan"
            class="quantity-item"
          >
            <div class="quantity-field">
              <el-input-number
                v-model="form.plannedQuantity"
                :disabled="!canEditPlan"
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
            </div>
          </el-form-item>
        </div>
        <InlineHint
          v-if="!isDraft && hasPlannedQuantityChange"
          class="allocation-notes"
        >
          修改计划数量不会自动调整已生成的物料需求。
        </InlineHint>
        <p
          v-if="editingTaskId && !selectedWorkOrder"
          class="summary-unavailable"
          role="status"
        >
          工单分配与产出信息暂不可用，请刷新核对。
        </p>
        <template v-if="selectedWorkOrder">
          <div class="output-reference">
            <strong class="output-label">产出参考</strong>
            <div class="output-values">
              <span
                >已确认实际产出
                <strong>{{
                  formatQuantity(selectedWorkOrder.finalOutput.availableQuantity)
                }}</strong></span
              ><span>{{ selectedWorkOrder.finalOutput.confirmedOutputCount }} 次终检确认</span>
            </div>
          </div>
          <InlineHint
            class="allocation-notes"
            :tone="allocationAfterSave && allocationAfterSave.remaining < 0 ? 'warning' : 'info'"
          >
            <p
              v-if="allocationAfterSave"
              class="allocation-feedback"
              role="status"
            >
              {{ editingTaskId ? '调整后' : '本次分配后' }}累计计划数量为
              <strong>{{ formatQuantity(allocationAfterSave.total) }}</strong
              ><template v-if="allocationAfterSave.remaining < 0"
                >，超出工单计划 <strong>{{ formatQuantity(-allocationAfterSave.remaining) }}</strong
                >，可继续保存。</template
              ><template v-else
                >，计划内剩余 <strong>{{ formatQuantity(allocationAfterSave.remaining) }}</strong
                >。</template
              >
            </p>
            累计已分配按任务计划量合计，包含草稿及已结束任务（含提前结束），取消任务不计入；实际产出独立统计。
          </InlineHint>
        </template>
      </section>
      <el-alert
        v-if="workOrderSource.status.value === 'error'"
        type="warning"
        :closable="false"
        :title="
          editingTaskId
            ? '工单分配信息刷新失败，输入已保留；调整计划数量前请刷新核对。'
            : '工单分配信息刷新失败，请刷新核对后再保存任务。'
        "
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
          :required="canEditRoute"
        >
          <el-select
            v-model="form.routeId"
            filterable
            clearable
            :disabled="!canEditRoute"
            :loading="routeSource.loading.value"
            :placeholder="canEditRoute ? '请选择工艺路线' : existingRouteLabel"
            @visible-change="(v: boolean) => v && canEditRoute && routeSource.refresh()"
          >
            <el-option
              v-if="!canEditRoute && form.routeId"
              :label="existingRouteLabel"
              :value="form.routeId"
            />
            <template v-else-if="canEditRoute">
              <el-option
                v-if="missingOriginalRoute"
                :label="`${existingRouteLabel}（原路线）`"
                :value="missingOriginalRoute"
              />
              <el-option
                v-for="choice in routeChoices"
                :key="choice.value"
                :label="choice.option ? formatRoute(choice.option) : `${choice.value}（已失效）`"
                :value="choice.value"
                :disabled="choice.isUnavailable"
              />
            </template>
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
          :required="isDraft"
        >
          <el-date-picker
            v-model="form.planStartDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="请选择计划开始日期"
            :disabled="!isDraft"
            :disabled-date="disableTaskDate"
          />
        </el-form-item>
        <el-form-item
          label="计划结束"
          :required="isDraft"
        >
          <el-date-picker
            v-model="form.planEndDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="请选择计划结束日期"
            :disabled="!isDraft"
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
          :disabled="!isDraft"
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
        :disabled="
          intentStatus !== 'idle' ||
          ((!editingTaskId || hasPlannedQuantityChange) && workOrderSource.status.value !== 'ready')
        "
        @click="handleSubmit"
        >保存任务</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import type { IdempotentIntentStatus } from '../../../composables/idempotency/useIdempotentIntent';
import SubmissionRecoveryNotice from '../../../components/SubmissionRecoveryNotice.vue';
import type {
  ProcessRouteOption,
  ProductionBatchDetail,
  WorkOrderOption,
} from '@company/contracts';
import { WORK_ORDER_TYPE_LABELS } from '@company/constants';
import InlineHint from '../../../components/InlineHint.vue';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { toDateInputValue } from '../../../utils/date';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';
import { useProcessRouteOptions } from '../../../composables/options/useProcessRouteOptions';
import { useWorkOrderOptions } from '../work-orders/use-work-order-options';
import { useTaskOwnerOptions } from './use-task-owner-options';
import { formatQuantity } from '../../../utils/quantity';
import type { TaskFormValue } from './task-form';

const props = defineProps<{
  visible: boolean;
  editingTaskId: string | null;
  submitting: boolean;
  intentStatus: IdempotentIntentStatus;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'save', data: TaskFormValue): void;
  (e: 'retry'): void;
  (e: 'restart'): void;
}>();

const existingBatchNo = ref('');
const existingTaskContext = ref<ProductionBatchDetail | null>(null);
const isDraft = computed(
  () => !props.editingTaskId || existingTaskContext.value?.status === 'draft',
);
const canEditPlan = computed(
  () => !props.editingTaskId || existingTaskContext.value?.canEditPlan === true,
);
const canEditRoute = computed(
  () => !props.editingTaskId || existingTaskContext.value?.canEditRoute === true,
);
const existingRouteLabel = computed(() => {
  const context = existingTaskContext.value;
  if (!context?.routeCode) return '未配置';
  const versionLabel = context.routeVersion ? ` / ${context.routeVersion}` : '';
  return `${context.routeCode}${versionLabel}`;
});
const existingWorkOrderLabel = computed(() => {
  const context = existingTaskContext.value;
  if (!context) return '';
  return `${WORK_ORDER_TYPE_LABELS[context.orderType]} / ${context.workOrderNo} / ${context.productCode} / ${context.productName}`;
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
  if (canEditRoute.value) void routeSource.refresh();
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
let initialSignature = JSON.stringify(form);
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
const hasPlannedQuantityChange = computed(
  () =>
    Boolean(props.editingTaskId && existingTaskContext.value) &&
    form.plannedQuantity !== Number(existingTaskContext.value?.plannedQuantity),
);
const hasRouteChange = computed(
  () =>
    Boolean(props.editingTaskId && existingTaskContext.value) &&
    (form.routeId || null) !== existingTaskContext.value?.routeId,
);
const workOrderPlanBalance = computed(() => {
  if (!selectedWorkOrder.value) return null;
  const remaining = Number(selectedWorkOrder.value.remainingQuantity);
  return remaining < 0
    ? { label: '累计超计划', quantity: -remaining }
    : { label: '计划内剩余', quantity: remaining };
});
const plannedQuantityError = computed(() => {
  if (!canEditPlan.value) return '';
  if (!Number.isInteger(form.plannedQuantity) || form.plannedQuantity <= 0) {
    return '计划数量必须为大于 0 的整数。';
  }
  return '';
});
const allocationAfterSave = computed(() => {
  const order = selectedWorkOrder.value;
  if (
    !canEditPlan.value ||
    (props.editingTaskId && !hasPlannedQuantityChange.value) ||
    workOrderSource.status.value !== 'ready' ||
    plannedQuantityError.value ||
    !order
  ) {
    return null;
  }
  const originalQuantity = props.editingTaskId
    ? Number(existingTaskContext.value?.plannedQuantity)
    : 0;
  const total = Number(order.assignedQuantity) - originalQuantity + form.plannedQuantity;
  return { total, remaining: Number(order.plannedQuantity) - total };
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
  `${WORK_ORDER_TYPE_LABELS[order.orderType]} / ${workOrderSource.formatOption(order)}`;

const missingOriginalRoute = computed(() => {
  const id = existingTaskContext.value?.routeId;
  return id && !availableRouteOptions.value.some((route) => route.id === id) ? id : null;
});

/** 历史路线可保留或改回；只有新选择需要符合当前候选资格。 */
const routeChoices = computed(() =>
  buildLiveOptions(
    availableRouteOptions.value,
    form.routeId ? [form.routeId] : [],
    (route) => route.id,
  ).filter((choice) => choice.value !== missingOriginalRoute.value),
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
  const remaining = Number(order.remainingQuantity);
  form.plannedQuantity = Number.isInteger(remaining) && remaining > 0 ? remaining : 1;
};

const resetForm = (): void => {
  existingBatchNo.value = '';
  existingTaskContext.value = null;
  originalOwner.value = null;
  Object.assign(form, initialForm());
  initialSignature = JSON.stringify(form);
};

const setForm = (row: ProductionBatchDetail): void => {
  existingBatchNo.value = row.batchNo;
  existingTaskContext.value = row;
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
  initialSignature = JSON.stringify(form);
};

const handleSubmit = (): void => {
  if (props.submitting || props.intentStatus !== 'idle') return;
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
  if (
    (!props.editingTaskId || hasPlannedQuantityChange.value) &&
    workOrderSource.status.value !== 'ready'
  ) {
    EMessage.warning('请先刷新工单分配信息后再保存任务');
    return;
  }
  if (!props.editingTaskId && !form.workOrderId) {
    EMessage.warning('请选择所属工单');
    return;
  }
  if (hasPlannedQuantityChange.value && !selectedWorkOrder.value) {
    EMessage.warning('当前工单已不可新增或调整任务计划，请核对后重新打开任务');
    return;
  }
  if (plannedQuantityError.value) {
    EMessage.warning(plannedQuantityError.value);
    return;
  }
  if (isDraft.value && (!form.planStartDate || !form.planEndDate)) {
    EMessage.warning('请填写计划开始和计划结束日期');
    return;
  }
  if (
    isDraft.value &&
    form.planStartDate &&
    form.planEndDate &&
    form.planEndDate < form.planStartDate
  ) {
    EMessage.warning('计划结束日期不能早于计划开始日期');
    return;
  }
  const order = selectedWorkOrder.value;
  const orderStartDate = toDateInputValue(order?.planStartDate);
  const orderEndDate = toDateInputValue(order?.planEndDate);
  if (
    isDraft.value &&
    order &&
    ((orderStartDate && form.planStartDate < orderStartDate) ||
      (orderEndDate && form.planEndDate > orderEndDate))
  ) {
    EMessage.warning('任务计划日期必须位于工单计划区间内');
    return;
  }
  // 编辑模式工单只读回显，可能因状态变化不在候选内，跳过失效校验。
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
  if (canEditRoute.value && taskOrderType.value !== 'research' && !form.routeId) {
    EMessage.warning('请先选择工艺路线');
    return;
  }
  if ((!props.editingTaskId || hasRouteChange.value) && form.routeId) {
    if (routeSource.status.value !== 'ready') {
      EMessage.warning('请先刷新工艺路线候选后再保存任务');
      return;
    }
    if (hasUnavailableSelection(availableRouteOptions.value, [form.routeId], (route) => route.id)) {
      EMessage.warning('所选工艺路线已失效，请重新选择');
      return;
    }
  }
  emit('save', {
    ...form,
    routeId: taskOrderType.value === 'research' ? '' : form.routeId,
  });
};

defineExpose({ setForm, resetForm, isDirty: () => JSON.stringify(form) !== initialSignature });
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
  overflow-wrap: anywhere;
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
.allocation-quantities {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
.allocation-feedback {
  margin: 0 0 4px;
}
.summary-unavailable {
  margin: 8px 0 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 20px;
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
