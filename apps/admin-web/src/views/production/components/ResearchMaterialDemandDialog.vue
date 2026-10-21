<template>
  <el-dialog
    :model-value="visible"
    :title="`手工提需${batch ? ` · ${batch.batchNo}` : ''}`"
    :width="DialogWidth.workbench"
    :close-on-click-modal="false"
    @update:model-value="close"
  >
    <el-alert
      title="从有效物料中选择本次所需版本和数量。后续可继续提出其他物料或版本的需求，已确认需求和领料记录保留。"
      type="info"
      :closable="false"
      show-icon
    />
    <el-form
      label-position="top"
      class="research-demand-form"
      :disabled="submitting || unresolved"
    >
      <el-form-item
        label="提需原因"
        required
        ><el-input
          v-model="reason"
          type="textarea"
          :rows="2"
          maxlength="5000"
      /></el-form-item>
      <el-form-item label="添加物料">
        <el-select
          v-model="selectedMaterialId"
          filterable
          remote
          :remote-method="searchMaterials"
          :loading="optionsLoading"
          placeholder="输入物料编码或名称"
          @visible-change="refreshOptions"
          @change="addMaterial"
        >
          <el-option
            v-for="option in availableOptions"
            :key="option.id"
            :value="option.id"
            :label="`${option.materialCode} · ${option.materialName}`"
          />
        </el-select>
      </el-form-item>
      <el-table
        :data="rows"
        row-key="materialId"
        empty-text="添加本次需要的物料"
      >
        <el-table-column
          label="物料"
          width="200"
          ><template #default="{ row }"
            ><div>{{ row.materialCode }}</div>
            <div>{{ row.materialName }}</div></template
          ></el-table-column
        >
        <el-table-column
          label="版本、数量与采购提示"
          min-width="550"
          ><template #default="{ row }">
            <div
              v-for="(split, index) in row.splits"
              :key="split.key"
              class="research-split"
            >
              <el-select
                v-model="split.materialVariantId"
                filterable
                :loading="row.loading"
                placeholder="选择启用版本"
                @visible-change="(opened: boolean) => opened && loadVariants(row)"
              >
                <el-option
                  v-for="variant in variantsFor(row, index)"
                  :key="variant.id"
                  :value="variant.id"
                  :label="variant.variantCode"
                />
              </el-select>
              <el-input-number
                v-model="split.quantity"
                :min="1"
                :max="99999999"
                :precision="0"
                controls-position="right"
              />
              <span>{{ row.unit }}</span>
              <el-button
                v-if="row.splits.length > 1"
                link
                type="danger"
                @click="row.splits.splice(index, 1)"
                >移除版本</el-button
              >
              <el-input
                v-model="split.supplierHint"
                maxlength="500"
                placeholder="可选：本次需求的供应商或采购要求提示"
              />
            </div>
            <el-button
              link
              type="primary"
              :disabled="row.splits.length >= row.variants.length"
              @click="addSplit(row)"
              >添加版本</el-button
            >
          </template></el-table-column
        >
        <el-table-column width="80"
          ><template #default="{ row }"
            ><el-button
              link
              type="danger"
              @click="removeMaterial(row.materialId)"
              >移除</el-button
            ></template
          ></el-table-column
        >
      </el-table>
    </el-form>
    <template #footer
      ><el-button
        :disabled="submitting"
        @click="close"
        >取消</el-button
      ><el-button
        type="primary"
        :disabled="!canSubmit"
        :loading="submitting"
        @click="submit"
        >{{ unresolved ? '重试本次提需' : '确认生成需求' }}</el-button
      ></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, onActivated, onScopeDispose, ref, watch } from 'vue';
import type {
  AddManualMaterialDemandsPayload,
  MaterialOption,
  MaterialVariantItem,
  ProductionBatchItem,
} from '@company/contracts';
import { useTabsStore } from '../../../stores/tabs';
import { productionApi } from '../../../api/production';
import { productApi } from '../../../api/product';
import { useIdempotentIntent } from '../../../composables/idempotency/useIdempotentIntent';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
defineOptions({ name: 'ResearchMaterialDemandDialog' });
interface Split {
  key: string;
  materialVariantId: string;
  quantity: number;
  supplierHint: string;
}
interface Row extends MaterialOption {
  materialId: string;
  variants: MaterialVariantItem[];
  loading: boolean;
  splits: Split[];
  requestVersion: number;
}
const props = defineProps<{ visible: boolean; batch: ProductionBatchItem | null }>();
const emit = defineEmits<{ 'update:visible': [boolean]; added: [] }>();
const rows = ref<Row[]>([]),
  options = ref<MaterialOption[]>([]),
  reason = ref(''),
  selectedMaterialId = ref('');
const optionsLoading = ref(false),
  submitting = ref(false),
  unresolved = ref(false);
const intent = useIdempotentIntent('手工需求');
let epoch = 0,
  optionsRequest = 0,
  keyCounter = 0;
const availableOptions = computed(() =>
  options.value.filter((option) => !rows.value.some((row) => row.materialId === option.id)),
);
const createSplit = (): Split => ({
  key: String(++keyCounter),
  materialVariantId: '',
  quantity: 1,
  supplierHint: '',
});
const canSubmit = computed(
  () =>
    reason.value.trim().length > 0 &&
    rows.value.length > 0 &&
    rows.value.every(
      (row) =>
        row.splits.length > 0 &&
        row.splits.every(
          (split) =>
            row.variants.some((variant) => variant.id === split.materialVariantId) &&
            Number.isSafeInteger(split.quantity) &&
            split.quantity > 0,
        ) &&
        new Set(row.splits.map((split) => split.materialVariantId)).size === row.splits.length,
    ),
);
const variantsFor = (row: Row, index: number): MaterialVariantItem[] =>
  row.variants.filter(
    (variant) =>
      !row.splits.some((split, other) => other !== index && split.materialVariantId === variant.id),
  );
const searchMaterials = async (keyword = ''): Promise<void> => {
  const request = ++optionsRequest,
    current = epoch;
  optionsLoading.value = true;
  try {
    const result = await productionApi.productionMaterialOptions({
      keyword: keyword.trim() || undefined,
      includeIds: rows.value.map((row) => row.materialId),
    });
    if (request === optionsRequest && current === epoch && props.visible) options.value = result;
  } catch (error) {
    if (current === epoch && props.visible) EMessage.error(error, '物料候选加载失败');
  } finally {
    if (request === optionsRequest) optionsLoading.value = false;
  }
};
const refreshOptions = (opened: boolean): void => {
  if (opened) void searchMaterials();
};
const loadVariants = async (row: Row): Promise<void> => {
  if (unresolved.value) return;
  const request = ++row.requestVersion,
    current = epoch;
  row.loading = true;
  try {
    const result = await productApi.materialVariantsByMaterial(row.materialId);
    if (current === epoch && request === row.requestVersion && props.visible) row.variants = result;
  } catch (error) {
    if (current === epoch && props.visible) EMessage.error(error, '物料版本加载失败');
  } finally {
    if (request === row.requestVersion) row.loading = false;
  }
};
const addMaterial = (materialId: string): void => {
  const option = options.value.find((candidate) => candidate.id === materialId);
  if (
    !option ||
    rows.value.some((row) => row.materialId === materialId) ||
    rows.value.length >= 100
  )
    return;
  const row: Row = {
    ...option,
    materialId,
    variants: [],
    loading: false,
    splits: [createSplit()],
    requestVersion: 0,
  };
  rows.value.push(row);
  selectedMaterialId.value = '';
  void loadVariants(rows.value[rows.value.length - 1]!);
};
const addSplit = (row: Row): void => {
  row.splits.push(createSplit());
};
const removeMaterial = (materialId: string): void => {
  rows.value = rows.value.filter((row) => row.materialId !== materialId);
};
const submit = async (): Promise<void> => {
  if (!props.batch || !canSubmit.value || submitting.value) return;
  const batchId = props.batch.id;
  const body: AddManualMaterialDemandsPayload = {
    reason: reason.value.trim(),
    requirements: rows.value.map((row) => ({
      materialId: row.materialId,
      splits: row.splits.map((split) => ({
        materialVariantId: split.materialVariantId,
        quantity: split.quantity,
        supplierHint: split.supplierHint.trim() || null,
      })),
    })),
  };
  submitting.value = true;
  try {
    await intent.execute(
      {
        intentType: 'production.material-demands.add-manual',
        params: { batchId },
        query: {},
        body,
      },
      (key) => productionApi.addManualMaterialDemands(batchId, body, key),
    );
    intent.reset();
    unresolved.value = false;
    EMessage.success('手工需求已生成');
    emit('update:visible', false);
    emit('added');
  } catch (error) {
    unresolved.value = intent.getStatus() !== 'idle';
    EMessage.error(error, '手工提需失败');
  } finally {
    submitting.value = false;
  }
};
const close = async (): Promise<boolean> => {
  if (!props.visible) return true;
  if (submitting.value) return false;
  if (unresolved.value || rows.value.length || reason.value.trim()) {
    try {
      await RouteMessageBox.confirm(
        unresolved.value
          ? '本次结果尚未确认，请先核对需求；放弃后无法继续安全重试。'
          : '关闭会放弃本次未提交的需求。',
        '关闭手工提需',
        { type: 'warning', confirmButtonText: '确认关闭', cancelButtonText: '继续填写' },
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
watch(
  () => [props.visible, props.batch?.id] as const,
  ([visible]) => {
    epoch += 1;
    optionsRequest += 1;
    optionsLoading.value = false;
    if (visible) {
      rows.value = [];
      reason.value = '';
      options.value = [];
      selectedMaterialId.value = '';
      void searchMaterials();
    }
  },
);
onActivated(() => {
  if (props.visible && !unresolved.value) void searchMaterials();
});
</script>
<style scoped>
.research-demand-form {
  margin-top: 16px;
}
.research-split {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.research-split :deep(.el-select) {
  width: 250px;
}
.research-split :deep(.el-input-number) {
  width: 130px;
}
</style>
