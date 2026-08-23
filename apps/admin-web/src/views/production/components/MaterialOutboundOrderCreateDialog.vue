<template>
  <el-dialog
    :model-value="modelValue"
    title="创建生产领料出库单"
    :width="DialogWidth.xl"
    :before-close="beforeClose"
    :close-on-click-modal="false"
    @update:model-value="updateVisible"
  >
    <div class="dialog-body">
      <el-alert
        title="本步骤只创建待出库凭据，不扣减库存。请核对后打印，用于拣货、领料和签字。"
        type="info"
        :closable="false"
      />
      <el-form
        class="create-form"
        label-width="96px"
      >
        <el-form-item
          label="生产批次"
          required
        >
          <el-select
            v-model="batchId"
            filterable
            :loading="optionLoading"
            placeholder="选择同一生产批次"
            @change="handleBatchChange"
          >
            <el-option
              v-for="option in batchOptions"
              :key="option.productionBatchId"
              :value="option.productionBatchId"
              :label="`${option.batchNo} · ${option.workOrderNo} · ${option.productName}`"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="remark"
            type="textarea"
            :rows="2"
            maxlength="5000"
          />
        </el-form-item>
      </el-form>

      <el-table
        v-loading="candidateLoading"
        :data="candidates"
        class="candidate-table"
        empty-text="请选择生产批次，或当前批次没有可制单分配行"
        @selection-change="selectedCandidates = $event"
      >
        <el-table-column
          type="selection"
          width="50"
        />
        <el-table-column
          label="物料"
          min-width="170"
        >
          <template #default="{ row }">
            <div>{{ row.itemName }}</div>
            <div class="secondary-text">{{ row.itemCode }}</div>
          </template>
        </el-table-column>
        <el-table-column
          prop="batchCode"
          label="库存批次"
          min-width="140"
        />
        <el-table-column
          label="分配"
          width="95"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.assignedQuantity) }}</template>
        </el-table-column>
        <el-table-column
          label="已确认"
          width="95"
          align="right"
        >
          <template #default="{ row }">{{
            formatQuantity(row.confirmedOutboundQuantity)
          }}</template>
        </el-table-column>
        <el-table-column
          label="待确认占用"
          width="105"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.pendingOutboundQuantity) }}</template>
        </el-table-column>
        <el-table-column
          label="可制单"
          width="95"
          align="right"
        >
          <template #default="{ row }">{{ formatQuantity(row.availableToOrderQuantity) }}</template>
        </el-table-column>
        <el-table-column
          label="本次数量"
          width="180"
        >
          <template #default="{ row }">
            <el-input-number
              v-model="quantities[row.allocationId]"
              :min="1"
              :max="Number(row.availableToOrderQuantity)"
              :step="1"
              :precision="0"
            />
            <span class="unit-text">{{ row.unit }}</span>
          </template>
        </el-table-column>
      </el-table>
      <div class="form-hint">
        已选择 {{ selectedCandidates.length }} 条；不同单位不会合并为误导性的总数量。
      </div>
    </div>
    <template #footer>
      <el-button @click="requestClose">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="submit"
      >
        创建待出库单
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type {
  CreateMaterialOutboundPayload,
  MaterialOutboundBatchOption,
  MaterialOutboundCandidateItem,
} from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { RouteMessageBox as ElMessageBox } from '../../../utils/route-message-box';
import type { IdempotentIntentStatus } from '../../../composables/idempotency/useIdempotentIntent';
import { formatQuantity } from '../production-status';

defineOptions({ name: 'MaterialOutboundOrderCreateDialog' });

const props = defineProps<{
  modelValue: boolean;
  batchOptions: MaterialOutboundBatchOption[];
  candidates: MaterialOutboundCandidateItem[];
  optionLoading: boolean;
  candidateLoading: boolean;
  submitting: boolean;
  intentStatus: IdempotentIntentStatus;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  loadCandidates: [batchId: string];
  resetIntent: [];
  submit: [batchId: string, payload: CreateMaterialOutboundPayload];
}>();

const batchId = ref('');
const remark = ref('');
const quantities = reactive<Record<string, number>>({});
const selectedCandidates = ref<MaterialOutboundCandidateItem[]>([]);
const canSubmit = computed(
  () =>
    Boolean(batchId.value) &&
    selectedCandidates.value.length > 0 &&
    selectedCandidates.value.every((row) => {
      const quantity = quantities[row.allocationId];
      return (
        Number.isInteger(quantity) &&
        quantity > 0 &&
        quantity <= Number(row.availableToOrderQuantity)
      );
    }),
);
const dirty = computed(() =>
  Boolean(batchId.value || remark.value.trim() || selectedCandidates.value.length),
);

watch(
  () => props.candidates,
  (candidates) => {
    for (const row of candidates)
      quantities[row.allocationId] = Number(row.availableToOrderQuantity);
  },
);
watch(
  () => props.modelValue,
  (visible) => {
    if (!visible) reset();
  },
);

const handleBatchChange = (value: string): void => {
  selectedCandidates.value = [];
  for (const key of Object.keys(quantities)) delete quantities[key];
  if (value) emit('loadCandidates', value);
};
const submit = (): void => {
  if (!canSubmit.value || props.submitting) return;
  emit('submit', batchId.value, {
    details: selectedCandidates.value.map((row) => ({
      allocationId: row.allocationId,
      outboundQuantity: quantities[row.allocationId]!,
    })),
    remark: remark.value,
  });
};
const beforeClose = async (done: () => void): Promise<void> => {
  if (!(await canDiscard())) return;
  done();
};
const requestClose = async (): Promise<void> => {
  if (await canDiscard()) emit('update:modelValue', false);
};
const updateVisible = (visible: boolean): void => {
  emit('update:modelValue', visible);
};
const canDiscard = async (): Promise<boolean> => {
  if (props.intentStatus !== 'idle') {
    try {
      await ElMessageBox.confirm(
        '上次创建结果尚未确认。请先在出库单列表核对；放弃安全重试后重新提交可能重复建单。',
        '放弃幂等意图确认',
        { type: 'warning', confirmButtonText: '核对后仍要放弃', cancelButtonText: '继续保留' },
      );
      emit('resetIntent');
      return true;
    } catch {
      return false;
    }
  }
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm('表单内容尚未提交，是否放弃？', '放弃创建', {
      type: 'warning',
      confirmButtonText: '放弃内容',
      cancelButtonText: '继续编辑',
    });
    return true;
  } catch {
    return false;
  }
};
const reset = (): void => {
  batchId.value = '';
  remark.value = '';
  selectedCandidates.value = [];
  for (const key of Object.keys(quantities)) delete quantities[key];
};
</script>

<style scoped>
.dialog-body {
  max-height: 70vh;
  padding-right: 4px;
  overflow-y: auto;
}
.create-form {
  margin-top: 18px;
}
.create-form :deep(.el-select) {
  width: min(560px, 100%);
}
.candidate-table {
  margin-top: 8px;
}
.secondary-text,
.form-hint,
.unit-text {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.unit-text {
  margin-left: 6px;
}
.form-hint {
  margin-top: 12px;
}
</style>
