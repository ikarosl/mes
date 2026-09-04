<template>
  <main class="material-demands-page">
    <section class="query-panel">
      <el-form
        class="query-form"
        :inline="true"
        :model="query"
        @submit.prevent="search"
      >
        <el-form-item label="批次/工单">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="生产批次号、工单号或基础物料"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="query.status"
            clearable
            placeholder="全部状态"
          >
            <el-option
              label="待配置"
              value="pending"
            />
            <el-option
              label="已配置"
              value="configured"
            />
          </el-select>
        </el-form-item>
        <el-form-item class="query-actions">
          <el-button
            type="primary"
            :loading="loading"
            @click="search"
            >查询</el-button
          >
          <el-button
            v-if="query.productionBatchId"
            @click="clearBatchFilter"
          >
            清除批次筛选
          </el-button>
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section class="table-panel">
      <TableToolbar :total="total">
        <template #tools>
          <el-button
            :icon="Refresh"
            text
            circle
            :loading="loading"
            @click="load"
          />
        </template>
      </TableToolbar>
      <el-alert
        title="BOM 只确定基础物料和总需求；版本、库存只在本页由管理员确认。库存数量仅供参考，系统不会自动替你选版本。"
        type="info"
        :closable="false"
        show-icon
      />
      <el-table
        v-loading="loading"
        :data="rows"
        class="data-table"
        empty-text="暂无待管理物料需求"
      >
        <el-table-column
          label="生产来源"
          min-width="200"
        >
          <template #default="{ row }">
            <div class="primary">{{ row.batchNo }}</div>
            <div class="secondary">{{ row.workOrderNo }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="基础物料"
          min-width="220"
        >
          <template #default="{ row }">
            <div class="primary">{{ row.materialCode }}</div>
            <div class="secondary">{{ row.materialName }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="基础需求"
          width="125"
          align="right"
        >
          <template #default="{ row }"
            >{{ quantity(row.requiredQuantity) }} {{ row.unit }}</template
          >
        </el-table-column>
        <el-table-column
          label="版本拆分 / 库存提示"
          min-width="450"
        >
          <template #default="{ row }">
            <div
              v-if="activeVariants(row).length === 0"
              class="empty-variant"
            >
              没有启用版本
            </div>
            <div
              v-else
              class="variant-list"
            >
              <div
                v-for="variant in activeVariants(row)"
                :key="variant.materialVariantId"
                class="variant-row"
              >
                <span class="variant-code">{{ variant.materialVariantCode }}</span>
                <span class="stock-hint"
                  >库存 {{ quantity(variant.advisoryStockQuantity) }} {{ row.unit }}</span
                >
                <el-input-number
                  v-model="drafts[row.id][variant.materialVariantId]"
                  :min="0"
                  :step="1"
                  :precision="0"
                  controls-position="right"
                  :disabled="row.status === 'configured'"
                />
                <span class="unit">{{ row.unit }}</span>
              </div>
            </div>
            <div class="split-summary">
              已拆分 {{ quantity(splitTotal(row)) }} / {{ quantity(row.requiredQuantity) }}
              {{ row.unit }}
            </div>
            <div
              v-if="row.demands.length"
              class="demand-history"
            >
              <div class="demand-history-title">已生成需求（{{ row.demands.length }} 条）</div>
              <div
                v-for="demand in row.demands"
                :key="demand.demandId"
                class="demand-history-row"
              >
                <span class="demand-variant">
                  {{ demand.materialVariantCode }}
                  <span
                    v-if="!activeVariantIds(row).has(demand.materialVariantId)"
                    class="historical-tag"
                    >已停用版本</span
                  >
                </span>
                <span>类型 {{ demandTypeLabel(demand) }}</span>
                <span v-if="parentDemandId(demand)">父需求 #{{ parentDemandId(demand) }}</span>
                <span>需求 {{ quantity(demand.demandQuantity) }} {{ row.unit }}</span>
                <span>剩余 {{ quantity(demand.remainingQuantity) }} {{ row.unit }}</span>
                <el-tag
                  size="small"
                  :type="
                    demand.businessStatus === 'active'
                      ? 'warning'
                      : demand.businessStatus === 'fulfilled'
                        ? 'success'
                        : 'info'
                  "
                  >{{ demandBusinessStatusLabel(demand.businessStatus) }}</el-tag
                >
                <el-button
                  v-if="canAddManual"
                  link
                  type="warning"
                  :disabled="demand.businessStatus === 'cancelled'"
                  :title="
                    demand.businessStatus === 'cancelled' ? '已取消需求不能继续追加' : undefined
                  "
                  @click.stop="openManual(row, demand)"
                  >人工补充</el-button
                >
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="状态"
          width="110"
        >
          <template #default="{ row }">
            <el-tag :type="row.status === 'configured' ? 'success' : 'warning'">
              {{ row.status === 'configured' ? '已配置' : '待配置' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="170"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              v-if="row.status !== 'configured' && canConfigure"
              link
              type="primary"
              :loading="pendingIds.has(row.id)"
              @click="configure(row)"
              >确认版本需求</el-button
            >
          </template>
        </el-table-column>
      </el-table>
      <PaginationFooter
        :total="total"
        :current-page="query.page ?? 1"
        :page-size="query.pageSize ?? 20"
        @update:page-size="pageSizeChanged"
        @page-change="pageChanged"
      />
    </section>

    <el-dialog
      v-model="manualVisible"
      title="人工补充物料需求"
      :width="DialogWidth.md"
      :close-on-click-modal="false"
      @closed="resetManual"
    >
      <template v-if="manualRow">
        <el-alert
          :title="`${manualRow.materialCode} · ${manualRow.materialName}：人工补充只允许选择该基础物料下的启用版本。`"
          type="info"
          :closable="false"
          show-icon
        />
        <el-form
          class="manual-form"
          label-width="96px"
        >
          <el-form-item
            label="父需求"
            required
          >
            <el-input
              :model-value="
                manualDemand
                  ? `${manualDemand.materialVariantCode} · 需求 #${manualDemand.demandId}`
                  : ''
              "
              disabled
            />
            <div class="field-tip">已从具体需求行进入，人工补充将直接挂在该父需求下。</div>
          </el-form-item>
          <el-form-item
            label="补充版本"
            required
          >
            <el-select
              v-model="manualForm.materialVariantId"
              filterable
              placeholder="选择启用版本"
            >
              <el-option
                v-for="variant in activeVariants(manualRow)"
                :key="variant.materialVariantId"
                :label="`${variant.materialVariantCode}（库存提示 ${quantity(variant.advisoryStockQuantity)}）`"
                :value="variant.materialVariantId"
              />
            </el-select>
          </el-form-item>
          <el-form-item
            label="补充数量"
            required
          >
            <el-input-number
              v-model="manualForm.quantity"
              :min="1"
              :step="1"
              :precision="0"
            />
            <span class="unit">{{ manualRow.unit }}</span>
          </el-form-item>
          <el-form-item
            label="补充原因"
            required
          >
            <el-input
              v-model="manualForm.reason"
              type="textarea"
              :rows="4"
              maxlength="5000"
              show-word-limit
            />
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="manualVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="manualSubmitting"
          :disabled="!canSubmitManual"
          @click="submitManual"
        >
          创建人工需求
        </el-button>
      </template>
    </el-dialog>
  </main>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import { DEMAND_GENERATION_GROUP_TYPE_LABELS, PERMISSIONS } from '@company/constants';
import type {
  MaterialDemandManagementQuery,
  MaterialDemandManagementRow,
} from '@company/contracts';
import { productionApi } from '../../api/production';
import { useIdempotentIntent } from '../../composables/idempotency/useIdempotentIntent';
import TableToolbar from '../../components/TableToolbar.vue';
import PaginationFooter from '../../components/PaginationFooter.vue';
import { useAuthStore } from '../../stores/auth';
import { DialogWidth } from '../../utils/dialog';
import { EMessage } from '../../utils/message';
import { demandBusinessStatusLabel } from '../../constants/business-status';

defineOptions({ name: 'MaterialDemandsPage' });

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const canConfigure = computed(() => auth.can(PERMISSIONS.production.materialDemands.configure));
const canAddManual = computed(() => auth.can(PERMISSIONS.production.materialDemands.addManual));
const query = reactive<MaterialDemandManagementQuery>({ page: 1, pageSize: 20, keyword: '' });
const rows = ref<MaterialDemandManagementRow[]>([]);
const total = ref(0);
const loading = ref(false);
const pendingIds = ref(new Set<string>());
const drafts = reactive<Record<string, Record<string, number>>>({});
const manualVisible = ref(false);
const manualSubmitting = ref(false);
const manualRow = ref<MaterialDemandManagementRow | null>(null);
type ManagementDemand = MaterialDemandManagementRow['demands'][number];
const manualDemand = ref<ManagementDemand | null>(null);
const manualForm = reactive({ materialVariantId: '', quantity: 1, reason: '' });
const configureIntents = new Map<string, ReturnType<typeof useIdempotentIntent>>();
const manualIntents = new Map<string, ReturnType<typeof useIdempotentIntent>>();
let listToken = 0;

const activeVariants = (row: MaterialDemandManagementRow) =>
  row.variants.filter((variant) => variant.status !== 0);
const activeVariantIds = (row: MaterialDemandManagementRow): Set<string> =>
  new Set(activeVariants(row).map((variant) => variant.materialVariantId));
const ensureDraft = (row: MaterialDemandManagementRow): void => {
  const current = drafts[row.id] ?? {};
  for (const variant of activeVariants(row)) {
    if (current[variant.materialVariantId] === undefined)
      current[variant.materialVariantId] = Number(variant.selectedQuantity ?? 0);
  }
  drafts[row.id] = current;
};
const splitTotal = (row: MaterialDemandManagementRow): number =>
  Object.values(drafts[row.id] ?? {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
const quantity = (value: string | number | null | undefined): string =>
  Number(value ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 4 });
const canSubmitManual = computed(
  () =>
    Boolean(manualRow.value) &&
    Boolean(manualDemand.value) &&
    Boolean(manualForm.materialVariantId) &&
    Number.isInteger(manualForm.quantity) &&
    manualForm.quantity > 0 &&
    Boolean(manualForm.reason.trim()),
);
const demandTypeLabel = (demand: ManagementDemand): string =>
  DEMAND_GENERATION_GROUP_TYPE_LABELS[demand.demandType];
const parentDemandId = (demand: ManagementDemand): string | null => demand.parentDemandId;

const routeProductionBatchId = (): string | undefined => {
  const value = route.query.productionBatchId;
  return typeof value === 'string' && value.trim() ? value : undefined;
};
const syncBatchFilter = (): boolean => {
  const next = routeProductionBatchId();
  if (query.productionBatchId === next) return false;
  query.productionBatchId = next;
  return true;
};

const load = async (): Promise<void> => {
  const token = ++listToken;
  loading.value = true;
  try {
    const result = await productionApi.listMaterialDemandManagement({
      ...query,
      keyword: query.keyword?.trim() || undefined,
    });
    if (token !== listToken) return;
    for (const row of result.items) ensureDraft(row);
    rows.value = result.items;
    total.value = result.total;
  } catch (error) {
    if (token === listToken) EMessage.error(error, '物料需求加载失败');
  } finally {
    if (token === listToken) loading.value = false;
  }
};
const search = (): void => {
  query.page = 1;
  void load();
};
const resetQuery = (): void => {
  query.keyword = '';
  query.status = undefined;
  query.page = 1;
  if (routeProductionBatchId()) {
    const nextQuery = { ...route.query };
    delete nextQuery.productionBatchId;
    void router.replace({ name: 'production-material-demands', query: nextQuery });
  } else {
    query.productionBatchId = undefined;
    void load();
  }
};
const clearBatchFilter = (): void => {
  if (!routeProductionBatchId()) return;
  const nextQuery = { ...route.query };
  delete nextQuery.productionBatchId;
  void router.replace({ name: 'production-material-demands', query: nextQuery });
};
const pageSizeChanged = (value: number): void => {
  query.pageSize = value;
  query.page = 1;
  void load();
};
const pageChanged = (value: number): void => {
  query.page = value;
  void load();
};
const configure = async (row: MaterialDemandManagementRow): Promise<void> => {
  ensureDraft(row);
  const expected = Number(row.requiredQuantity);
  const splits = activeVariants(row)
    .map((variant) => ({
      materialVariantId: variant.materialVariantId,
      quantity: Number(drafts[row.id]?.[variant.materialVariantId] ?? 0),
    }))
    .filter((split) => split.quantity > 0);
  if (!Number.isSafeInteger(expected) || expected <= 0) {
    EMessage.warning('基础需求数量不是可拆分的正整数，请联系生产管理员');
    return;
  }
  if (!splits.length || splits.some((split) => !Number.isSafeInteger(split.quantity))) {
    EMessage.warning('版本拆分数量必须为正整数');
    return;
  }
  if (splits.reduce((sum, split) => sum + split.quantity, 0) !== expected) {
    EMessage.warning(`版本拆分合计必须等于基础需求 ${quantity(row.requiredQuantity)} ${row.unit}`);
    return;
  }
  if (pendingIds.value.has(row.id)) return;
  pendingIds.value = new Set(pendingIds.value).add(row.id);
  const body = { requirements: [{ productMaterialId: row.productMaterialId, splits }] };
  const intent = configureIntents.get(row.id) ?? useIdempotentIntent();
  configureIntents.set(row.id, intent);
  try {
    await intent.execute(
      {
        intentType: 'production.material-demands.configure',
        params: { batchId: row.productionBatchId, productMaterialId: row.productMaterialId },
        query: {},
        body,
      },
      (key) => productionApi.configureMaterialDemands(row.productionBatchId, body, key),
    );
    configureIntents.delete(row.id);
    EMessage.success(`${row.batchNo} 的 ${row.materialCode} 版本需求已确认`);
    await load();
  } catch (error) {
    EMessage.error(error, '版本需求确认失败');
  } finally {
    const next = new Set(pendingIds.value);
    next.delete(row.id);
    pendingIds.value = next;
  }
};
const openManual = (
  row: MaterialDemandManagementRow,
  demand: MaterialDemandManagementRow['demands'][number],
): void => {
  manualRow.value = row;
  manualDemand.value = demand;
  manualForm.materialVariantId = '';
  manualForm.quantity = 1;
  manualForm.reason = '';
  manualVisible.value = true;
};
const resetManual = (): void => {
  manualRow.value = null;
  manualDemand.value = null;
  manualForm.materialVariantId = '';
  manualForm.quantity = 1;
  manualForm.reason = '';
};
const submitManual = async (): Promise<void> => {
  if (!canSubmitManual.value || !manualRow.value) return;
  const parentDemandId = manualDemand.value?.demandId;
  if (!parentDemandId) return;
  manualSubmitting.value = true;
  const body = {
    materialVariantId: manualForm.materialVariantId,
    quantity: manualForm.quantity,
    reason: manualForm.reason.trim(),
  };
  const intent = manualIntents.get(parentDemandId) ?? useIdempotentIntent();
  manualIntents.set(parentDemandId, intent);
  try {
    await intent.execute(
      {
        intentType: 'production.material-demands.add-manual',
        params: { demandId: parentDemandId },
        query: {},
        body,
      },
      (key) => productionApi.addManualMaterialDemand(parentDemandId, body, key),
    );
    manualIntents.delete(parentDemandId);
    EMessage.success('人工补充需求已创建');
    manualVisible.value = false;
    await load();
  } catch (error) {
    EMessage.error(error, '人工补充需求创建失败');
  } finally {
    manualSubmitting.value = false;
  }
};
watch(rows, (value) => value.forEach(ensureDraft));
let skipInitialActivation = true;
watch(
  () => route.query.productionBatchId,
  () => {
    if (!syncBatchFilter()) return;
    query.page = 1;
    void load();
  },
);
onMounted(() => {
  syncBatchFilter();
  void load();
});
onActivated(() => {
  syncBatchFilter();
  if (skipInitialActivation) {
    skipInitialActivation = false;
    return;
  }
  void load();
});
</script>

<style scoped>
.material-demands-page {
  display: grid;
  gap: 16px;
}
.query-panel,
.table-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
.query-panel {
  padding: 20px 20px 4px;
}
.query-form {
  display: flex;
  align-items: flex-start;
  gap: 10px 22px;
}
.query-form :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 16px;
}
.query-form :deep(.el-input),
.query-form :deep(.el-select) {
  width: 280px;
}
.query-actions {
  margin-left: auto;
}
.table-panel {
  overflow: hidden;
}
.table-panel > .el-alert {
  margin: 0 16px 12px;
}
.data-table {
  width: 100%;
}
.primary {
  color: #1f2937;
  font-weight: 600;
}
.secondary,
.stock-hint,
.unit,
.field-tip {
  color: #909399;
  font-size: 12px;
}
.variant-list {
  display: grid;
  gap: 6px;
}
.variant-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
}
.variant-code {
  min-width: 145px;
  color: #1d4ed8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.stock-hint {
  min-width: 110px;
}
.variant-row :deep(.el-input-number) {
  width: 118px;
}
.split-summary {
  margin-top: 6px;
  color: #606266;
  font-size: 12px;
}
.demand-history {
  display: grid;
  gap: 6px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed #dcdfe6;
}
.demand-history-title {
  color: #606266;
  font-size: 12px;
  font-weight: 600;
}
.demand-history-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  color: #606266;
  font-size: 12px;
}
.demand-variant {
  color: #1d4ed8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.historical-tag {
  margin-left: 4px;
  color: #e6a23c;
  font-family: inherit;
}
.empty-variant {
  color: #ef4444;
}
.manual-form {
  margin-top: 18px;
}
.manual-form :deep(.el-select),
.manual-form :deep(.el-input) {
  width: 100%;
}
</style>
