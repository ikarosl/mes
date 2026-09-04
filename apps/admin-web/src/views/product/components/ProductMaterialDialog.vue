<template>
  <el-dialog
    :model-value="visible"
    title="配置产品物料清单"
    :width="DialogWidth.xl"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template v-if="product">
      <el-alert
        v-if="product.bomLockedAt"
        title="该 BOM 已被生产任务引用并永久锁定，当前仅可查看。原则变化请新建产品和产品编码。"
        type="info"
        :closable="false"
        show-icon
        class="bom-alert"
      />
      <el-alert
        v-if="detailStatus === 'error'"
        title="物料清单加载失败，当前不可保存，请点击刷新物料重试。"
        type="error"
        :closable="false"
        show-icon
        class="bom-alert"
      />
      <el-alert
        v-else-if="detailReady && !localRows.length && !product.bomLockedAt"
        title="当前产品尚未配置物料清单。生产任务配置物料需求前，需要先维护这里的用料。"
        type="warning"
        :closable="false"
        show-icon
        class="bom-alert"
      />
      <div class="bom-header">
        <div>
          <span class="item-code">{{ product.itemCode }}</span>
          <span class="sub-text">{{ product.productName }}</span>
        </div>
        <div class="bom-actions">
          <el-button
            :icon="Refresh"
            :loading="loading"
            @click="retryNow"
            >刷新物料</el-button
          >
          <el-button
            type="primary"
            :icon="Plus"
            :disabled="!detailReady || Boolean(product.bomLockedAt)"
            @click="addRow"
            >添加已有物料</el-button
          >
        </div>
      </div>
      <el-table
        :data="localRows"
        class="material-table"
      >
        <el-table-column
          label="物料"
          min-width="260"
        >
          <template #default="{ row }">
            <el-select
              v-model="row.materialProductId"
              filterable
              placeholder="请选择物料"
              :disabled="Boolean(product.bomLockedAt)"
              @change="syncRowUnit(row)"
              @visible-change="(visible: boolean) => visible && refreshCandidates()"
            >
              <el-option
                v-for="choice in materialChoices(row.materialProductId)"
                :key="choice.value"
                :label="
                  choice.option
                    ? `${choice.option.itemCode} / ${choice.option.productName}`
                    : `${choice.value}（已失效）`
                "
                :value="choice.value"
                :disabled="choice.isUnavailable"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column
          label="单位"
          width="120"
        >
          <template #default="{ row }">
            <el-input
              v-model="row.unit"
              placeholder="pcs"
              disabled
            />
          </template>
        </el-table-column>
        <el-table-column
          label="单位用量"
          width="150"
        >
          <template #default="{ row }">
            <el-input-number
              v-model="row.quantityPerUnit"
              :min="1"
              :precision="0"
              :step="1"
              controls-position="right"
              :disabled="Boolean(product.bomLockedAt)"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="关键物料"
          width="110"
          align="center"
        >
          <template #default="{ row }"
            ><el-switch
              v-model="row.isKeyMaterial"
              :disabled="Boolean(product?.bomLockedAt)"
          /></template>
        </el-table-column>
        <el-table-column
          label="记录批次"
          width="110"
          align="center"
        >
          <template #default="{ row }"
            ><el-switch
              v-model="row.needBatchRecord"
              :disabled="Boolean(product?.bomLockedAt)"
          /></template>
        </el-table-column>
        <el-table-column
          label="备注"
          min-width="160"
        >
          <template #default="{ row }">
            <el-input
              v-model="row.remark"
              placeholder="可选"
              :disabled="Boolean(product.bomLockedAt)"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="90"
          align="center"
        >
          <template #default="{ $index }">
            <el-button
              link
              type="danger"
              :disabled="Boolean(product?.bomLockedAt)"
              @click="removeRow($index)"
              >删除</el-button
            >
          </template>
        </el-table-column>
      </el-table>
    </template>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        v-if="!product?.bomLockedAt"
        type="primary"
        :loading="submitting"
        :disabled="!detailReady"
        @click="handleSubmit"
        >保存物料清单</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onActivated, ref, watch } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import type { ProductListItem } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';
import { EMessage } from '../../../utils/message';
import { useProductMaterialEditor } from '../composables/useProductMaterialEditor';

export type MaterialRow = {
  materialProductId: string;
  quantityPerUnit: number;
  unit: string;
  isKeyMaterial: boolean;
  needBatchRecord: boolean;
  remark: string;
};

const props = defineProps<{
  visible: boolean;
  product: ProductListItem | null;
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'save', rows: MaterialRow[]): void;
}>();

const {
  materialOptions,
  loading,
  detailStatus,
  loadedProductId,
  load,
  refreshOptions,
  invalidate,
} = useProductMaterialEditor();
const localRows = ref<MaterialRow[]>([]);

/** 仅当当前产品 BOM 明细已就绪（且属于当前产品）时才允许保存，避免把上一个产品的行保存到新目标 */
const detailReady = computed(
  () => detailStatus.value === 'ready' && loadedProductId.value === props.product?.id,
);

const setRows = (initial: MaterialRow[]): void => {
  localRows.value = initial;
};

/** 加载当前产品 BOM 明细并写入 localRows；失败/过期不覆盖为可保存空数据 */
const loadRows = async (productId: string): Promise<void> => {
  const rows = await load(productId);
  if (!rows) return;
  setRows(
    rows.map((item) => ({
      materialProductId: item.materialProductId,
      quantityPerUnit: Number(item.quantityPerUnit),
      unit: item.unit,
      isKeyMaterial: item.isKeyMaterial,
      needBatchRecord: item.needBatchRecord,
      remark: item.remark ?? '',
    })),
  );
};

/** 打开弹窗时加载当前产品 BOM 明细与候选；关闭时推进请求代际，迟到的明细响应不得写回草稿行 */
watch(
  () => [props.visible, props.product?.id] as const,
  async ([visible, productId]) => {
    if (!visible) {
      invalidate();
      return;
    }
    if (!productId) return;
    await loadRows(productId);
  },
);

/** 下拉展开 / 页面激活：只刷新候选，不重载 BOM 明细（避免覆盖用户草稿行） */
const refreshCandidates = (): void => {
  if (!props.product) return;
  void refreshOptions(props.product.id);
};

/** 刷新物料按钮：明细加载失败时显式重试 BOM 明细，否则只刷新候选 */
const retryNow = (): void => {
  if (!props.product) return;
  if (detailStatus.value === 'error') {
    void loadRows(props.product.id);
    return;
  }
  refreshCandidates();
};

/** 页面重新激活且弹窗打开时只刷新候选（不重试明细，不覆盖草稿行） */
onActivated(() => {
  if (props.visible && props.product) void refreshOptions(props.product.id);
});

const addRow = (): void => {
  localRows.value.push({
    materialProductId: '',
    quantityPerUnit: 1,
    unit: '',
    isKeyMaterial: true,
    needBatchRecord: true,
    remark: '',
  });
};

const removeRow = (index: number): void => {
  localRows.value.splice(index, 1);
};

const materialChoices = (selectedValue: string) =>
  buildLiveOptions(materialOptions.value, selectedValue ? [selectedValue] : [], (item) => item.id);

const syncRowUnit = (row: MaterialRow): void => {
  const selected = materialOptions.value.find((item) => item.id === row.materialProductId);
  if (selected) row.unit = selected.unit;
};

const handleSubmit = (): void => {
  if (!detailReady.value) {
    EMessage.warning('物料清单尚未加载完成，请稍后重试');
    return;
  }
  if (localRows.value.some((r) => !r.materialProductId)) {
    EMessage.warning('请选择物料');
    return;
  }
  if (
    localRows.value.some((row) =>
      hasUnavailableSelection(
        materialOptions.value,
        row.materialProductId ? [row.materialProductId] : [],
        (item) => item.id,
      ),
    )
  ) {
    EMessage.warning('物料候选项已失效，请重新选择');
    return;
  }
  if (new Set(localRows.value.map((r) => r.materialProductId)).size !== localRows.value.length) {
    EMessage.warning('同一物料不能重复添加');
    return;
  }
  if (
    localRows.value.some((row) => !Number.isInteger(row.quantityPerUnit) || row.quantityPerUnit < 1)
  ) {
    EMessage.warning('单位用量必须是大于零的整数');
    return;
  }
  emit('save', localRows.value);
};

defineExpose({ setRows });
</script>

<style scoped>
.bom-alert {
  margin-bottom: 14px;
}
.bom-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.bom-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.item-code {
  font-weight: 600;
}
.sub-text {
  margin-left: 8px;
  color: #6b7280;
  font-size: 13px;
}
.material-table {
  width: 100%;
}
.material-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
.material-table :deep(.el-input),
.material-table :deep(.el-select),
.material-table :deep(.el-input-number) {
  width: 100%;
}
</style>
