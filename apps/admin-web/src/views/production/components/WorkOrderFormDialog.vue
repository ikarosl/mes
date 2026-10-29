<template>
  <el-dialog
    :model-value="visible"
    :title="dialogTitle"
    :width="DialogWidth.lg"
    @update:model-value="$emit('update:visible', $event)"
    @open="onOpen"
  >
    <el-alert
      v-if="previousResearchOrder"
      type="info"
      :closable="false"
      show-icon
      class="research-source"
    >
      <template #title>前序研发工单 {{ previousResearchOrder.workOrderNo }}</template>
      <p>
        前序成品：{{ previousResearchOrder.productCode }} · {{ previousResearchOrder.productName }}
      </p>
      <p>
        {{
          editingOrderId
            ? '前序关联不可改，本轮不得改回前序成品。'
            : '仅带出计划资料。新成品和计划日期须重新选择；'
        }}新成品 BOM 仍需独立审批，旧需求、生产记录和库存不带入。
      </p>
    </el-alert>
    <el-form
      class="dialog-form"
      label-width="108px"
      :model="form"
      :disabled="submitting"
    >
      <div class="form-grid">
        <el-form-item label="工单号">
          <span>{{ displayedWorkOrderNo || '保存时自动生成：北京时间日期 + 当日序号' }}</span>
        </el-form-item>
        <el-form-item
          label="工单类型"
          required
        >
          <el-select
            v-model="form.orderType"
            :disabled="Boolean(form.previousResearchOrderId)"
            placeholder="请选择工单类型"
          >
            <el-option
              v-for="(label, value) in WORK_ORDER_TYPE_LABELS"
              :key="value"
              :label="label"
              :value="value"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          label="产品"
          required
        >
          <el-select
            v-model="form.productId"
            filterable
            placeholder="请选择产品"
            :loading="props.productOptionsStatus === 'loading'"
            @visible-change="(v: boolean) => v && $emit('refresh-products')"
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
            :min="1"
            :precision="0"
            :step="1"
          />
        </el-form-item>
        <el-form-item
          label="负责人"
          required
        >
          <div class="owner-field">
            <div class="owner-picker">
              <el-select
                v-model="form.workOrderOwnerId"
                clearable
                filterable
                placeholder="请选择工单负责人"
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
                aria-label="刷新负责人候选"
                @click="refreshOwners"
              />
            </div>
            <p
              v-if="ownersError"
              class="owner-warning"
              role="status"
            >
              负责人候选读取失败，请刷新后再选择；也可清空负责人保存草稿。
            </p>
            <p
              v-else-if="ownersVerified && !owners.length"
              class="owner-note"
              role="status"
            >
              暂无候选人员，请联系管理员配置业务人员角色；可不指定负责人保存草稿。
            </p>
            <p
              v-if="isOwnerUnavailable"
              class="owner-warning"
              role="status"
            >
              原负责人已退出当前候选范围，请重新选择或清空。
            </p>
          </div>
        </el-form-item>
        <el-form-item label="客户名称">
          <el-input
            v-model="form.customerName"
            placeholder="可选填写"
          />
        </el-form-item>
        <el-form-item
          label="计划开始"
          required
        >
          <el-date-picker
            v-model="form.planStartDate"
            type="date"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item
          label="计划完成"
          required
        >
          <el-date-picker
            v-model="form.planEndDate"
            type="date"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="质量等级">
          <el-input
            v-model="form.qualityLevel"
            placeholder="客户质量等级代码"
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
import { computed, reactive, ref, watch } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import type {
  ProductOption,
  WorkOrderDetail,
  WorkOrderType,
  ResearchWorkOrderReference,
} from '@company/contracts';
import { WORK_ORDER_TYPE_LABELS } from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { toDateInputValue } from '../../../utils/date';
import { EMessage } from '../../../utils/message';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';
import type { RefreshableStatus } from '../../../composables/options/useRefreshableOptions';
import { useWorkOrderOwnerOptions } from '../composables/use-work-order-owner-options';

export type WorkOrderFormValue = {
  orderType: WorkOrderType;
  previousResearchOrderId: string | null;
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
  productOptions: ProductOption[];
  productOptionsStatus: RefreshableStatus;
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'refresh-products'): void;
  (e: 'save', data: WorkOrderFormValue): void;
}>();

/** 工单负责人采用表单自己的完整候选，打开和显式刷新时核验。 */
const {
  owners,
  loading: ownersLoading,
  verified: ownersVerified,
  error: ownersError,
  refreshOwners,
  invalidateOwners,
} = useWorkOrderOwnerOptions(() => props.visible);

const onOpen = (): void => {
  emit('refresh-products');
  void refreshOwners();
};

watch(
  () => props.visible,
  (visible) => {
    if (!visible) invalidateOwners();
  },
);

const initialForm = (): WorkOrderFormValue => ({
  orderType: 'mass_production',
  previousResearchOrderId: null,
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
const dialogTitle = computed(() => {
  if (props.editingOrderId) return '编辑工单';
  if (form.previousResearchOrderId) return '开启下一轮研发';
  return '新增工单';
});
const displayedWorkOrderNo = ref('');
const previousResearchOrder = ref<ResearchWorkOrderReference | null>(null);
const originalOwner = ref<{ id: string; name: string | null } | null>(null);

const rememberOwnerSelection = (): void => {
  const id = form.workOrderOwnerId;
  const owner = owners.value.find((candidate) => candidate.id === id);
  if (owner) originalOwner.value = { id, name: owner.displayName };
  if (!id) originalOwner.value = null;
};

watch(owners, rememberOwnerSelection);

/** 产品候选仍按既有方式消费，负责人独立保留缺失的原选择。 */
const finishedProducts = computed(() =>
  props.productOptions.filter((product) => product.id !== previousResearchOrder.value?.productId),
);
const productChoices = computed(() =>
  buildLiveOptions(
    finishedProducts.value,
    form.productId ? [form.productId] : [],
    (item) => item.id,
  ),
);
const missingOwner = computed(() => {
  const id = form.workOrderOwnerId;
  if (!id || owners.value.some((owner) => owner.id === id)) return null;
  const name = originalOwner.value?.id === id ? originalOwner.value.name || id : id;
  const state = ownersVerified.value ? '已失效' : '待核验';
  return { id, label: `${name}（${state}）` };
});
const isOwnerUnavailable = computed(() => ownersVerified.value && Boolean(missingOwner.value));

const formatProduct = (product: ProductOption): string =>
  `${product.itemCode} / ${product.productName}`;

const resetForm = (): void => {
  Object.assign(form, initialForm());
  displayedWorkOrderNo.value = '';
  previousResearchOrder.value = null;
  originalOwner.value = null;
};

const setForm = (row: WorkOrderDetail): void => {
  displayedWorkOrderNo.value = row.workOrderNo;
  previousResearchOrder.value = row.previousResearchOrder;
  originalOwner.value = row.workOrderOwnerId
    ? { id: row.workOrderOwnerId, name: row.ownerName }
    : null;
  Object.assign(form, {
    orderType: row.orderType,
    previousResearchOrderId: row.previousResearchOrderId,
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

const startNextRound = (row: WorkOrderDetail): void => {
  resetForm();
  originalOwner.value = row.workOrderOwnerId
    ? { id: row.workOrderOwnerId, name: row.ownerName }
    : null;
  previousResearchOrder.value = {
    id: row.id,
    workOrderNo: row.workOrderNo,
    productId: row.productId,
    productCode: row.productCode,
    productName: row.productName,
    status: row.status,
  };
  Object.assign(form, {
    orderType: 'research',
    previousResearchOrderId: row.id,
    plannedQuantity: Number(row.plannedQuantity),
    workOrderOwnerId: row.workOrderOwnerId ?? '',
    customerName: row.customerName ?? '',
    qualityLevel: row.qualityLevel ?? '',
    externalOrderNo: row.externalOrderNo ?? '',
    remark: row.remark ?? '',
  });
};

const handleSubmit = (): void => {
  if (!form.productId || !Number.isInteger(form.plannedQuantity) || form.plannedQuantity <= 0) {
    EMessage.warning('请选择产品并填写计划数量');
    return;
  }
  if (!form.planStartDate || !form.planEndDate) {
    EMessage.warning('请填写计划开始和计划完成日期');
    return;
  }
  if (form.planEndDate < form.planStartDate) {
    EMessage.warning('计划完成日期不能早于计划开始日期');
    return;
  }
  if (
    hasUnavailableSelection(
      finishedProducts.value,
      form.productId ? [form.productId] : [],
      (item) => item.id,
    )
  ) {
    EMessage.warning('所选产品已失效，请重新选择');
    return;
  }
  if (form.workOrderOwnerId && !ownersVerified.value) {
    EMessage.warning('请先刷新负责人候选，或清空负责人保存草稿');
    return;
  }
  if (isOwnerUnavailable.value) {
    EMessage.warning('所选负责人已退出当前候选范围，请重新选择或清空');
    return;
  }
  emit('save', { ...form });
};

defineExpose({ setForm, resetForm, startNextRound });
</script>

<style scoped>
.research-source {
  margin-bottom: 16px;
}
.research-source p {
  margin: 4px 0;
}
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
</style>
