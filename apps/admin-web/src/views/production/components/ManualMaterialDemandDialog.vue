<template>
  <ResearchMaterialDemandDialog
    v-if="batch?.orderType === 'research'"
    :visible="visible"
    :batch="batch"
    @update:visible="emit('update:visible', $event)"
    @added="emit('added')"
  />
  <el-dialog
    v-else
    :model-value="visible"
    :title="`人工追加需求${batch ? ` · ${batch.batchNo}` : ''}`"
    :width="DialogWidth.xl"
    :close-on-click-modal="false"
    @update:model-value="handleVisibleChange"
  >
    <div v-loading="loading">
      <el-alert
        :title="policyDescription"
        type="info"
        :closable="false"
        show-icon
      />
      <el-form
        label-position="top"
        class="addition-form"
      >
        <el-form-item
          label="追加原因"
          required
        >
          <el-input
            v-model="reason"
            :disabled="submitting || unresolved"
            type="textarea"
            :rows="2"
            maxlength="5000"
            show-word-limit
            placeholder="说明本次人工追加的业务原因"
          />
        </el-form-item>
      </el-form>
      <el-table
        :data="rows"
        class="addition-editor"
        empty-text="当前任务没有冻结 BOM 物料"
      >
        <el-table-column
          width="52"
          fixed="left"
          align="center"
        >
          <template #default="{ row }">
            <el-checkbox
              v-model="row.selected"
              :disabled="submitting || unresolved"
              :aria-label="`选择 ${row.materialCode}`"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="基础物料"
          width="220"
          fixed="left"
        >
          <template #default="{ row }">
            <div class="primary">{{ row.materialCode }}</div>
            <div class="secondary">{{ row.materialName }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="追加版本及数量"
          min-width="580"
        >
          <template #default="{ row }">
            <span
              v-if="!row.selected"
              class="secondary"
              >勾选后配置追加版本</span
            >
            <template v-else>
              <div
                v-for="(split, index) in row.splits"
                :key="index"
                class="split-row"
              >
                <el-select
                  v-model="split.materialVariantId"
                  filterable
                  placeholder="选择具体版本"
                  :disabled="submitting || unresolved || Boolean(row.lockedMaterialVariantId)"
                >
                  <el-option
                    v-for="variant in availableVariants(row, index)"
                    :key="variant.materialVariantId"
                    :value="variant.materialVariantId"
                    :label="variant.materialVariantCode"
                  />
                </el-select>
                <el-input-number
                  v-model="split.quantity"
                  :disabled="submitting || unresolved"
                  :max="99999999"
                  :min="1"
                  :step="1"
                  :precision="0"
                  controls-position="right"
                />
                <span class="secondary">{{ row.unit }}</span>
              </div>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="submit"
      >
        确认追加
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import ResearchMaterialDemandDialog from './ResearchMaterialDemandDialog.vue';
import { computed, onScopeDispose, ref, watch } from 'vue';
import type {
  MaterialDemandManagementRow,
  MaterialDemandManagementVariant,
  ProductionBatchItem,
} from '@company/contracts';
import { useTabsStore } from '../../../stores/tabs';
import { productionApi } from '../../../api/production';
import { loadBatchMaterialDemands } from '../composables/loadBatchMaterialDemands';
import { useIdempotentIntent } from '../../../composables/idempotency/useIdempotentIntent';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';

type SplitDraft = { materialVariantId: string; quantity: number };
type RowDraft = MaterialDemandManagementRow & { selected: boolean; splits: SplitDraft[] };

const props = defineProps<{ visible: boolean; batch: ProductionBatchItem | null }>();
const emit = defineEmits<{ 'update:visible': [boolean]; added: [] }>();
const rows = ref<RowDraft[]>([]);
const reason = ref('');
const loading = ref(false);
let loadVersion = 0;
const submitting = ref(false);
const intent = useIdempotentIntent();

const policyDescription =
  '可一次追加多种冻结 BOM 物料；每种物料固定使用本任务初始需求锁定的唯一版本。';
const unresolved = ref(false);
const selectedRows = computed(() => rows.value.filter((row) => row.selected));
const canSubmit = computed(
  () =>
    !loading.value &&
    reason.value.trim().length > 0 &&
    selectedRows.value.length > 0 &&
    selectedRows.value.every(
      (row) =>
        row.splits.length > 0 &&
        row.splits.every(
          (split) =>
            split.materialVariantId && Number.isSafeInteger(split.quantity) && split.quantity > 0,
        ) &&
        new Set(row.splits.map((split) => split.materialVariantId)).size === row.splits.length,
    ),
);
const availableVariants = (
  row: RowDraft,
  currentIndex: number,
): MaterialDemandManagementVariant[] => {
  const selected = new Set(
    row.splits
      .filter((_, index) => index !== currentIndex)
      .map((split) => split.materialVariantId)
      .filter(Boolean),
  );
  return row.variants.filter((variant) => !selected.has(variant.materialVariantId));
};
const load = async (): Promise<void> => {
  if (!props.batch || props.batch.orderType === 'research') return;
  const version = ++loadVersion;
  const batchId = props.batch.id;
  loading.value = true;
  try {
    const result = await loadBatchMaterialDemands(batchId);
    if (version !== loadVersion || !props.visible || props.batch?.id !== batchId) return;
    rows.value = result.map((row) => ({
      ...row,
      selected: false,
      splits: [
        {
          materialVariantId: row.lockedMaterialVariantId ?? '',
          quantity: 1,
        },
      ],
    }));
  } catch (error) {
    if (version !== loadVersion || !props.visible || props.batch?.id !== batchId) return;
    EMessage.error(error, '人工追加候选加载失败');
  } finally {
    if (version === loadVersion) loading.value = false;
  }
};
const submit = async (): Promise<void> => {
  if (!props.batch || !canSubmit.value || submitting.value) return;
  const body = {
    reason: reason.value.trim(),
    requirements: selectedRows.value.map((row) => ({
      materialId: row.materialId,
      splits: row.splits.map((split) => ({ ...split })),
    })),
  };
  submitting.value = true;
  try {
    const result = await intent.execute(
      {
        intentType: 'production.material-demands.add-manual',
        params: { batchId: props.batch.id },
        query: {},
        body,
      },
      (key) => productionApi.addManualMaterialDemands(props.batch!.id, body, key),
    );
    intent.reset();
    unresolved.value = false;
    EMessage.success(`人工追加需求 ${result.additionNo} 已生成`);
    emit('update:visible', false);
    emit('added');
  } catch (error) {
    unresolved.value = intent.getStatus() !== 'idle';
    EMessage.error(error, '人工追加需求生成失败');
  } finally {
    submitting.value = false;
  }
};
const close = async (): Promise<boolean> => {
  if (!props.visible || props.batch?.orderType === 'research') return true;
  if (submitting.value) return false;
  const status = intent.getStatus();
  if (status !== 'idle') {
    try {
      await RouteMessageBox.confirm(
        '本次人工追加结果尚未确认。请先核对需求记录；放弃安全重试后再次提交可能生成重复事实。',
        '放弃人工追加',
        { type: 'warning', confirmButtonText: '核对后放弃', cancelButtonText: '继续保留' },
      );
    } catch {
      return false;
    }
  }
  intent.reset();
  unresolved.value = false;
  emit('update:visible', false);
  return true;
};
onScopeDispose(useTabsStore().registerCloseGuard('production-tasks', () => close()));
const handleVisibleChange = (visible: boolean): void => {
  if (visible) emit('update:visible', true);
  else void close();
};

watch(
  () => [props.visible, props.batch?.id] as const,
  ([visible]) => {
    loadVersion += 1;
    loading.value = false;
    if (visible) {
      reason.value = '';
      rows.value = [];
      void load();
    }
  },
);
</script>

<style scoped>
.addition-form {
  margin-top: 16px;
}
.addition-editor {
  width: 100%;
}
.primary {
  color: #1f2937;
  font-weight: 600;
}
.secondary {
  color: #909399;
  font-size: 12px;
}
.split-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.split-row :deep(.el-select) {
  width: 330px;
}
.split-row :deep(.el-input-number) {
  width: 130px;
}
</style>
