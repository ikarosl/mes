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
        v-if="loadError"
        title="初始需求读取失败，当前不能确认。请重试读取。"
        type="error"
        :closable="false"
      />
      <div
        v-if="batch && rows.length"
        class="configuration-context"
      >
        <div class="task-identity">
          <strong>{{ batch.workOrderNo }} · {{ batch.productName }}</strong>
          <span>{{ batch.productCode }} · 任务计划 {{ quantity(batch.plannedQuantity) }}</span>
        </div>
        <div class="selection-progress">
          <strong>已选版本 {{ selectedCount }} / {{ rows.length }} 项</strong>
          <span v-if="pendingCount">待选 {{ pendingCount }} 项</span>
          <span v-else>已完成选版</span>
        </div>
      </div>
      <p
        v-if="rows.length"
        class="configuration-rule"
      >
        数量按 BOM 单耗 ×
        任务计划量固定；每项选一个精确版本。确认后本任务版本与采购提示冻结，采购提示仅供参考。
      </p>
      <div
        v-if="rows.length"
        class="editor-toolbar"
      >
        <el-radio-group
          v-model="viewMode"
          size="small"
        >
          <el-radio-button label="all">全部</el-radio-button>
          <el-radio-button label="pending">仅未选版</el-radio-button>
        </el-radio-group>
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索物料名称或编码"
        />
      </div>
      <el-empty
        v-if="!loading && loadError"
        description="读取失败，请重试"
      />
      <el-empty
        v-else-if="!loading && rows.length === 0"
        description="当前任务没有可配置的 BOM 物料"
      />
      <el-empty
        v-else-if="!loading && filteredRows.length === 0"
        description="当前筛选无匹配物料"
      />
      <el-table
        v-else
        :data="filteredRows"
        class="demand-editor"
      >
        <el-table-column
          label="BOM 物料"
          min-width="230"
          fixed="left"
        >
          <template #default="{ row }">
            <div class="primary">{{ row.materialName }}</div>
            <div class="secondary">{{ row.materialCode }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="本任务需求量"
          width="150"
          align="right"
        >
          <template #default="{ row }">
            <strong>{{ quantity(row.requiredQuantity) }} {{ row.unit }}</strong>
          </template>
        </el-table-column>
        <el-table-column
          label="精确版本"
          min-width="300"
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
                placeholder="选择本任务使用的版本"
                :disabled="submitting || unresolved"
              >
                <el-option
                  v-for="variant in availableVariants(row, index)"
                  :key="variant.materialVariantId"
                  :value="variant.materialVariantId"
                  :label="variant.materialVariantCode"
                >
                  {{ variant.materialVariantCode }} · {{ variant.majorVersion }} /
                  {{ variant.minorVersion }}
                </el-option>
              </el-select>
            </div>
            <span
              v-if="!row.variants.length"
              class="row-warning"
              >暂无可选版本，请先维护启用的精确版本</span
            >
            <span
              v-else-if="!row.splits[0]?.materialVariantId"
              class="row-warning"
              >尚未选版</span
            >
          </template>
        </el-table-column>
        <el-table-column
          label="采购提示"
          min-width="185"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="toggleHint(row.id)"
            >
              {{
                expandedHints.includes(row.id)
                  ? '收起提示'
                  : row.supplierHint
                    ? '编辑提示'
                    : '添加提示'
              }}
            </el-button>
            <span
              v-if="row.supplierHint && !expandedHints.includes(row.id)"
              class="hint-preview"
              >{{ row.supplierHint }}</span
            >
            <el-input
              v-if="expandedHints.includes(row.id)"
              v-model="row.supplierHint"
              type="textarea"
              :rows="2"
              maxlength="500"
              placeholder="选填：供应商或采购要求参考；不代表实际采购供应商"
              :disabled="submitting || unresolved"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="配置状态"
          width="110"
        >
          <template #default="{ row }">
            <el-tag
              :type="row.splits[0]?.materialVariantId ? 'success' : 'warning'"
              size="small"
            >
              {{ row.splits[0]?.materialVariantId ? '已选版' : '待选版' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button
        v-if="loadError"
        @click="load"
        >重试读取</el-button
      >
      <span
        v-if="pendingCount"
        class="footer-hint"
        >还有 {{ pendingCount }} 项待选版</span
      >
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
const loadError = ref(false);
let loadVersion = 0;
const submitting = ref(false);
const intent = useIdempotentIntent();
const unresolved = ref(false);
const keyword = ref('');
const viewMode = ref<'all' | 'pending'>('all');
const expandedHints = ref<string[]>([]);
const initialDraft = ref('');
const selectedCount = computed(
  () => rows.value.filter((row) => Boolean(row.splits[0]?.materialVariantId)).length,
);
const pendingCount = computed(() => rows.value.length - selectedCount.value);
const filteredRows = computed(() => {
  const search = keyword.value.trim().toLocaleLowerCase();
  return rows.value.filter(
    (row) =>
      (viewMode.value === 'all' || !row.splits[0]?.materialVariantId) &&
      (!search || `${row.materialName} ${row.materialCode}`.toLocaleLowerCase().includes(search)),
  );
});
const draftSnapshot = computed(() =>
  JSON.stringify(
    rows.value.map((row) => [
      row.id,
      row.splits[0]?.materialVariantId ?? '',
      row.supplierHint ?? '',
    ]),
  ),
);
const dirty = computed(() => rows.value.length > 0 && draftSnapshot.value !== initialDraft.value);
const toggleHint = (id: string): void => {
  expandedHints.value = expandedHints.value.includes(id)
    ? expandedHints.value.filter((current) => current !== id)
    : [...expandedHints.value, id];
};
const configuredTotal = (row: RowDraft): number =>
  row.splits.reduce((total, split) => total + (Number(split.quantity) || 0), 0);
const canSubmit = computed(
  () =>
    !loading.value &&
    !loadError.value &&
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
  loadError.value = false;
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
    initialDraft.value = draftSnapshot.value;
  } catch (error) {
    if (version !== loadVersion || !props.visible || props.batch?.id !== batchId) return;
    loadError.value = true;
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
  } else if (dirty.value) {
    try {
      await RouteMessageBox.confirm(
        '已选择的版本或采购提示尚未确认。放弃后本次修改将丢失。',
        '放弃需求配置',
        { type: 'warning', confirmButtonText: '放弃修改', cancelButtonText: '继续配置' },
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
      loadError.value = false;
      keyword.value = '';
      viewMode.value = 'all';
      expandedHints.value = [];
      initialDraft.value = '';
      void load();
    }
  },
);
</script>

<style scoped>
.demand-editor {
  margin-top: 12px;
}
.configuration-context,
.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.configuration-context {
  padding: 8px 0 12px;
  border-bottom: 1px solid #e5e7eb;
}
.configuration-rule {
  margin: 10px 0 0;
  color: #6b7280;
  font-size: 13px;
}
.task-identity,
.selection-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.task-identity span,
.selection-progress span {
  color: #6b7280;
}
.selection-progress {
  text-align: right;
}
.editor-toolbar {
  margin-top: 12px;
}
.editor-toolbar :deep(.el-input) {
  max-width: 260px;
}
.primary {
  color: #1f2937;
  font-weight: 600;
}
.secondary,
.hint-preview {
  margin-top: 4px;
  color: #6b7280;
  font-size: 12px;
}
.hint-preview {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-warning,
.footer-hint {
  color: #b45309;
}
.split-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.split-row :deep(.el-select) {
  width: 100%;
}
</style>
