<template>
  <el-dialog
    :model-value="visible"
    :title="`确认初始物料需求${batch ? ` · ${batch.batchNo}` : ''}`"
    :width="DialogWidth.workbench"
    workbench
    :close-on-click-modal="false"
    @update:model-value="handleVisibleChange"
  >
    <div v-loading="loading">
      <el-alert
        v-if="rows.length"
        :title="policyDescription"
        type="info"
        :closable="false"
        show-icon
      />
      <el-empty
        v-if="!loading && rows.length === 0"
        description="当前任务没有可配置的 BOM 物料"
      />
      <el-table
        v-else
        :data="rows"
        class="demand-editor"
      >
        <el-table-column
          label="基础物料"
          width="240"
          fixed="left"
        >
          <template #default="{ row }">
            <div class="primary">{{ row.materialCode }}</div>
            <div class="secondary">{{ row.materialName }}</div>
            <div class="secondary">应配置 {{ quantity(row.requiredQuantity) }} {{ row.unit }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="具体版本及数量"
          min-width="560"
        >
          <template #default="{ row }">
            <div
              v-for="(split, index) in row.splits"
              :key="index"
              class="split-row"
            >
              <el-select
                v-model="split.materialVariantId"
                filterable
                placeholder="选择具体版本"
                :disabled="submitting || unresolved"
              >
                <el-option
                  v-for="variant in availableVariants(row, index)"
                  :key="variant.materialVariantId"
                  :value="variant.materialVariantId"
                  :label="variant.materialVariantCode"
                />
              </el-select>
              <span class="fixed-quantity"
                >{{ quantity(row.requiredQuantity) }} {{ row.unit }}</span
              >
            </div>
            <el-input
              v-model="row.supplierHint"
              maxlength="500"
              placeholder="可选：供应商或采购要求提示，确认后随本任务冻结"
              :disabled="submitting || unresolved"
            />
            <div
              class="summary"
              :class="{ invalid: configuredTotal(row) !== Number(row.requiredQuantity) }"
            >
              已配置 {{ configuredTotal(row) }} / 应配置 {{ quantity(row.requiredQuantity) }}
              {{ row.unit }}
            </div>
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
        确认生成需求
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
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
import { formatQuantity as quantity } from '../production-status';

type SplitDraft = { materialVariantId: string; quantity: number };
type RowDraft = MaterialDemandManagementRow & { splits: SplitDraft[] };

const props = defineProps<{ visible: boolean; batch: ProductionBatchItem | null }>();
const emit = defineEmits<{ 'update:visible': [boolean]; configured: [] }>();
const rows = ref<RowDraft[]>([]);
const loading = ref(false);
let loadVersion = 0;
const submitting = ref(false);
const intent = useIdempotentIntent();

const policyDescription =
  '每种物料选择本任务使用的一个版本，数量按 BOM 单耗与任务计划量计算；确认后版本和供应商提示固定，其他任务可独立选版。';
const unresolved = ref(false);
const configuredTotal = (row: RowDraft): number =>
  row.splits.reduce((total, split) => total + (Number(split.quantity) || 0), 0);
const canSubmit = computed(
  () =>
    !loading.value &&
    rows.value.length > 0 &&
    rows.value.every(
      (row) =>
        row.productMaterialId !== null &&
        row.requiredQuantity !== null &&
        row.splits.length === 1 &&
        row.splits.every(
          (split) =>
            split.materialVariantId && Number.isSafeInteger(split.quantity) && split.quantity > 0,
        ) &&
        new Set(row.splits.map((split) => split.materialVariantId)).size === row.splits.length &&
        configuredTotal(row) === Number(row.requiredQuantity),
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
  if (!props.batch || props.batch.orderType !== 'mass_production') return;
  const version = ++loadVersion;
  const batchId = props.batch.id;
  loading.value = true;
  try {
    const result = await loadBatchMaterialDemands(batchId);
    if (version !== loadVersion || !props.visible || props.batch?.id !== batchId) return;
    rows.value = result.map((row) => {
      const selected = row.lockedMaterialVariantId ?? '';
      return {
        ...row,
        splits: [
          {
            materialVariantId: selected,
            quantity: Number(row.requiredQuantity),
          },
        ],
      };
    });
  } catch (error) {
    if (version !== loadVersion || !props.visible || props.batch?.id !== batchId) return;
    EMessage.error(error, '初始物料需求加载失败');
  } finally {
    if (version === loadVersion) loading.value = false;
  }
};
const submit = async (): Promise<void> => {
  if (!props.batch || !canSubmit.value || submitting.value) return;
  const body = {
    requirements: rows.value.map((row) => ({
      productMaterialId: row.productMaterialId!,
      splits: row.splits.map((split) => ({
        ...split,
        supplierHint: row.supplierHint?.trim() || null,
      })),
    })),
  };
  submitting.value = true;
  try {
    await intent.execute(
      {
        intentType: 'production.material-demands.configure',
        params: { batchId: props.batch.id },
        query: {},
        body,
      },
      (key) => productionApi.configureMaterialDemands(props.batch!.id, body, key),
    );
    intent.reset();
    unresolved.value = false;
    EMessage.success('初始物料需求已完整生成');
    emit('update:visible', false);
    emit('configured');
  } catch (error) {
    unresolved.value = intent.getStatus() !== 'idle';
    EMessage.error(error, '初始物料需求生成失败');
  } finally {
    submitting.value = false;
  }
};
const close = async (): Promise<boolean> => {
  if (!props.visible) return true;
  if (submitting.value) return false;
  const status = intent.getStatus();
  if (status !== 'idle') {
    try {
      await RouteMessageBox.confirm(
        '本次需求生成结果尚未确认。请先核对任务需求；放弃安全重试后再次提交可能生成重复事实。',
        '放弃需求配置',
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
      rows.value = [];
      void load();
    }
  },
);
</script>

<style scoped>
.demand-editor {
  margin-top: 16px;
}
.primary {
  color: #1f2937;
  font-weight: 600;
}
.secondary,
.summary {
  margin-top: 4px;
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
.fixed-quantity {
  min-width: 130px;
  color: #606266;
}
.summary.invalid {
  color: #e6a23c;
}
</style>
